import { isUuid } from '@the-cricketer/database';
import type { Database, Repositories } from '@the-cricketer/database';
import {
  DELIVERIES,
  ENGINE_BALANCE,
  MATCH_FORMATS,
  SHOTS,
  classifyLength,
  classifyLine,
} from '@the-cricketer/game-core';
import {
  aiBowlerIntent,
  chooseBowlerFor,
  chooseDeliveryIntent,
  chooseShotIntent,
  stepSimulationAI,
  aiShotIntent,
  createMatchEngine,
  createTestMatch,
  humanShotIntent,
  replayMatch,
  stepSimulation,
  timingLabel,
} from '@the-cricketer/match-engine';
import type {
  BallAction,
  CreateMatchInput,
  DeliveryIntent,
  EngineBallResult,
  EngineMatchState,
  HeadlessMatchEngine,
  MatchReplay,
} from '@the-cricketer/match-engine';
import { AppError } from '@the-cricketer/server-kit';
import type {
  BattingLabRequest,
  BowlingLabRequest,
  DeliveryPreviewDto,
  DeliveryRequest,
  DeliveryResultDto,
  MatchPlayStateDto,
  ShotRequest,
  SimulateRequest,
} from '@the-cricketer/shared-types';
import type { PlayerScope } from '../player/equipment.service';
import { MatchCompletionService } from './match-completion.service';
import { completeMatchIfFinished, persistBall } from './match-persistence';
import type { DomainEventPublisher } from '../player/player.events';
import type { DomainEvent } from '@the-cricketer/game-core';
import {
  deliveriesFor,
  deliveryCard,
  findPlayer,
  presentDelivery,
  presentMatch,
  presentPreview,
} from './match-play.presenter';
import type { PlayContext } from './match-play.presenter';

class MatchPlayError extends AppError {}
const missing = () =>
  new MatchPlayError('MATCH_NOT_FOUND', 'Match not found.', 404);
const conflict = (code: string, message: string) =>
  new MatchPlayError(code, message, 409);

interface Loaded {
  readonly repos: Repositories;
  readonly matchId: string;
  readonly fixtureId: string | null;
  /** The human player of this request (the one whose career a finished match affects). */
  readonly playerId: string;
  /** Domain events collected inside the transaction and published only after it commits. */
  readonly events: DomainEvent[];
  readonly session: NonNullable<
    Awaited<ReturnType<Repositories['matches']['getEngineSession']>>
  >;
  readonly replay: MatchReplay;
  readonly engine: HeadlessMatchEngine;
}

/**
 * Orchestrates a human-bowled match on top of the authoritative engine. The browser sends a delivery
 * INTENT (variation, aimed target, execution timing); the server chooses the AI batter's shot from
 * what a batter can see, runs the ball through the Module 8 engine, persists it and returns the
 * result for the scene to present. Nothing here lets a client submit runs, wickets or a shot.
 */
export class MatchPlayService {
  private readonly completion = new MatchCompletionService();
  constructor(
    private readonly database: Database,
    private readonly options: { devTools: boolean } = { devTools: false },
    private readonly publisher: DomainEventPublisher = {
      publish: () => undefined,
    },
  ) {}

  /** A transaction whose collected domain events are published only after it has committed. */
  private async transact<T>(
    operation: string,
    work: (repos: Repositories, events: DomainEvent[]) => Promise<T>,
  ): Promise<T> {
    const events: DomainEvent[] = [];
    const result = await this.database.transaction(
      async (tx) => work(this.database.repositories(tx), events),
      { operation },
    );
    for (const event of events) this.publisher.publish(event);
    return result;
  }

  /** Current state for an authorized participant. Read-only: never advances the match. */
  async state(scope: PlayerScope, matchId: string): Promise<MatchPlayStateDto> {
    if (!isUuid(matchId)) throw missing();
    const repos = this.database.repositories();
    const loaded = await this.load(repos, scope, matchId, false);
    return this.present(loaded.engine, loaded.replay, scope.playerId);
  }

  /** Starts the next innings after an innings break. Idempotent. */
  async advance(
    scope: PlayerScope,
    matchId: string,
  ): Promise<MatchPlayStateDto> {
    if (!isUuid(matchId)) throw missing();
    return this.transact('match.advance', async (repos, events) => {
      const loaded = await this.load(repos, scope, matchId, true, events);
      if (loaded.engine.snapshot().status === 'innings_break') {
        loaded.engine.startNextInnings();
        await repos.matches.saveEngineSession(
          matchId,
          loaded.session.revision,
          loaded.engine.replay(),
          loaded.engine.snapshot(),
        );
      }
      return this.present(
        loaded.engine,
        loaded.engine.replay(),
        scope.playerId,
      );
    });
  }

  async deliver(
    scope: PlayerScope,
    matchId: string,
    request: DeliveryRequest,
  ): Promise<DeliveryResultDto> {
    if (!isUuid(matchId)) throw missing();
    return this.transact('match.delivery', async (repos, events) => {
      const loaded = await this.load(repos, scope, matchId, true, events);
      const { engine, replay } = loaded;
      const intent = this.intentFrom(request);

      // A retry of an action the server already processed returns the stored result.
      const previous = replay.commands.find(
        (c) => c.type === 'ball' && c.action.actionId === request.actionId,
      );
      if (previous && previous.type === 'ball') {
        const first = previous.action;
        // jsonb does not preserve key order, so compare the intent field by field
        const was = first.deliveryIntent;
        const same =
          first.expectedSequence === request.expectedSequence &&
          was.variationId === intent.variationId &&
          was.target?.x === intent.target?.x &&
          was.target?.y === intent.target?.y &&
          was.executionInput === intent.executionInput;
        if (!same)
          throw conflict(
            'ACTION_ID_REUSED',
            'That action id was already used for a different delivery.',
          );
        const ball = engine.resolveBall(first);
        return presentDelivery(
          this.context(engine, replay, scope.playerId),
          ball,
          true,
        );
      }

      const you = findPlayer(replay.input, scope.playerId)!;
      let state = engine.snapshot();
      if (state.status === 'innings_break') {
        engine.startNextInnings();
        state = engine.snapshot();
      }
      if (state.status !== 'in_progress')
        throw conflict('MATCH_FINISHED', 'The match is not in play.');
      const innings = state.innings[state.currentInningsIndex]!;
      if (innings.bowlingTeamId !== you.team.teamId)
        throw conflict(
          'NOT_YOUR_TURN_TO_BOWL',
          'Your team is batting; there is nothing to bowl.',
        );
      if (request.expectedSequence !== state.sequence + 1)
        throw conflict(
          'STALE_SEQUENCE',
          'The match has moved on; reload its state.',
        );

      let bowlerId = innings.currentBowlerId;
      if (!bowlerId) {
        if (!request.bowlerId)
          throw new MatchPlayError('BOWLER_REQUIRED', 'Select a bowler.', 400);
        if (!engine.eligibleBowlers().includes(request.bowlerId))
          throw conflict(
            'BOWLER_NOT_ELIGIBLE',
            'That bowler cannot bowl this over.',
          );
        engine.selectBowler(request.bowlerId);
        bowlerId = request.bowlerId;
      } else if (request.bowlerId && request.bowlerId !== bowlerId)
        throw conflict(
          'BOWLER_NOT_ELIGIBLE',
          'A bowler cannot be changed during an over.',
        );
      const bowler = findPlayer(replay.input, bowlerId)!.player;
      const batter = findPlayer(replay.input, innings.strikerId!)!.player;
      const definition = DELIVERIES.find((d) => d.id === intent.variationId);
      if (
        !definition ||
        !bowler.bowlingStyle ||
        !definition.eligibleStyles.includes(bowler.bowlingStyle)
      )
        throw new MatchPlayError(
          'INVALID_DELIVERY',
          'That delivery is not available to this bowler.',
          400,
        );

      const sequence = state.sequence + 1;
      const chase = innings.target !== null;
      const action: BallAction = {
        actionId: request.actionId,
        expectedSequence: request.expectedSequence,
        deliveryIntent: intent,
        battingIntent: replay.input.ai ? chooseShotIntent(engine, replay.input, intent).intent : aiShotIntent(
          replay.input.rngSeed,
          batter,
          intent,
          sequence,
          {
            runsNeeded: chase ? innings.target! - innings.runs : null,
            ballsRemaining: chase
              ? innings.maxBalls - innings.legalBalls
              : null,
          },
        ),
      };
      const ball = engine.resolveBall(action);
      await this.persist(repos, loaded, ball);
      return presentDelivery(
        this.context(engine, engine.replay(), scope.playerId),
        ball,
        false,
      );
    });
  }

  /**
   * Plays balls the human does not control (their own batting innings until human batting exists,
   * or overs they hand to the AI). Every ball goes through the same engine and persistence path.
   */
  async simulate(
    scope: PlayerScope,
    matchId: string,
    request: SimulateRequest,
  ): Promise<{
    simulated: {
      sequence: number;
      inningsNumber: number;
      label: string;
      headline: string;
      over: string;
      score: string;
    }[];
    match: MatchPlayStateDto;
  }> {
    if (!isUuid(matchId)) throw missing();
    return this.transact('match.simulate', async (repos, events) => {
      const loaded = await this.load(repos, scope, matchId, true, events);
      const { engine, replay } = loaded;
      const you = findPlayer(replay.input, scope.playerId)!;
      const simulated: Awaited<
        ReturnType<MatchPlayService['simulate']>
      >['simulated'] = [];
      const before = loaded.session.state as EngineMatchState;
      for (
        let guard = 0;
        guard < ENGINE_BALANCE.simulation.maxDeliveries;
        guard++
      ) {
        let cursor = engine.cursor();
        if (cursor.status === 'completed' || cursor.status === 'abandoned')
          break;
        if (cursor.status === 'innings_break') {
          // the innings break is a stop of its own (the player sees the target); asked to simulate FROM the
          // break, the next innings is started
          if (simulated.length) break;
          engine.startNextInnings();
          cursor = engine.cursor();
        }
        const yours = cursor.bowlingTeamId === you.team.teamId;
        // On the bowling side, "until my turn" stops only where the human Cricketer can bowl: at the start of an over
        // they are eligible for, or mid-over if they are the bowler. Overs they cannot bowl (just bowled, spell
        // over, not a bowler) are played by a teammate chosen by the engine.
        if (request.mode === 'until_my_turn' && yours) {
          if (cursor.bowlerId === null) {
            if (engine.eligibleBowlers().includes(scope.playerId)) break;
          } else if (cursor.bowlerId === scope.playerId) break;
        }
        // the human's Cricketer is on strike: that ball is theirs to play
        if (
          request.mode === 'until_my_turn' &&
          cursor.battingTeamId === you.team.teamId &&
          cursor.strikerId === scope.playerId
        )
          break;
        if (request.mode === 'over' && cursor.bowlerId === null) {
          if (simulated.length) break;
          const chosen = yours ? request.bowlerId : undefined;
          if (chosen && !engine.eligibleBowlers().includes(chosen))
            throw conflict(
              'BOWLER_NOT_ELIGIBLE',
              'That bowler cannot bowl this over.',
            );
          // "simulate this over" is for the overs the player does not want to bowl: without a named bowler a teammate
          // bowls it, and the Cricketer only if nobody else is eligible
          const eligible = engine.eligibleBowlers();
          engine.selectBowler(
            chosen ?? (replay.input.ai ? chooseBowlerFor(engine, replay.input, { eligiblePlayerIds: eligible.some((id) => id !== scope.playerId) ? eligible.filter((id) => id !== scope.playerId) : eligible }).intent.playerId : eligible.find((id) => id !== scope.playerId) ?? eligible[0]!),
          );
        }
        const ball = (replay.input.ai ? stepSimulationAI : stepSimulation)(engine, replay.input);
        await this.persist(repos, loaded, ball, false);
        const shown = presentDelivery(
          this.context(engine, engine.replay(), scope.playerId),
          ball,
          false,
        );
        simulated.push({
          sequence: ball.sequenceNumber,
          inningsNumber: ball.inningsNumber,
          label: shown.match.thisOver.at(-1)?.label ?? '',
          headline: shown.outcome.headline,
          over: `${ball.overNumber - 1}.${ball.ballInOver}`,
          score: `${ball.scoreAfter}/${ball.wicketsAfter}`,
        });
        if (request.mode === 'over' && engine.cursor().bowlerId === null) break;
      }
      const state = engine.snapshot();
      if (
        !simulated.length &&
        state.innings.length === before.innings.length &&
        state.status === before.status
      )
        throw conflict(
          'NOTHING_TO_SIMULATE',
          'There is nothing to simulate right now.',
        );
      await repos.matches.saveEngineSession(
        matchId,
        loaded.session.revision,
        engine.replay(),
        state,
      );
      return {
        simulated,
        match: this.present(engine, engine.replay(), scope.playerId),
      };
    });
  }

  /**
   * The delivery the AI bowler is about to bowl at the human batter. The server picks the bowler for
   * a new over, chooses the delivery from its own seeded stream (before the batter has decided
   * anything) and resolves it with the engine's real delivery function, but resolves NO shot, so
   * nothing about contact, runs or a wicket is revealed. Calling it twice returns the same delivery.
   */
  async nextBall(
    scope: PlayerScope,
    matchId: string,
  ): Promise<DeliveryPreviewDto> {
    if (!isUuid(matchId)) throw missing();
    return this.transact('match.next_ball', async (repos, events) => {
      const loaded = await this.load(repos, scope, matchId, true, events);
      const { engine, replay } = loaded;
      const you = findPlayer(replay.input, scope.playerId)!;
      let state = engine.snapshot();
      if (state.status === 'innings_break')
        throw conflict('NOT_YOUR_TURN_TO_BAT', 'Start the next innings first.');
      if (state.status !== 'in_progress')
        throw conflict('MATCH_FINISHED', 'The match is not in play.');
      let innings = state.innings[state.currentInningsIndex]!;
      if (
        innings.battingTeamId !== you.team.teamId ||
        innings.strikerId !== scope.playerId
      )
        throw conflict(
          'NOT_YOUR_TURN_TO_BAT',
          'You are not on strike right now.',
        );
      let changed = false;
      if (!innings.currentBowlerId) {
        engine.selectBowler(replay.input.ai ? chooseBowlerFor(engine, replay.input).intent.playerId : engine.eligibleBowlers()[0]!);
        changed = true;
        state = engine.snapshot();
        innings = state.innings[state.currentInningsIndex]!;
      }
      const bowler = findPlayer(replay.input, innings.currentBowlerId!)!.player;
      const sequence = state.sequence + 1;
      const intent = replay.input.ai ? chooseDeliveryIntent(engine, replay.input).intent : aiBowlerIntent(replay.input.rngSeed, bowler, sequence);
      const delivery = engine.previewDelivery(sequence, intent);
      if (changed)
        await repos.matches.saveEngineSession(
          matchId,
          loaded.session.revision,
          engine.replay(),
          state,
        );
      const over = innings.overs.at(-1)!;
      return presentPreview(
        this.context(engine, engine.replay(), scope.playerId),
        {
          sequence,
          inningsNumber: innings.inningsNumber,
          overNumber: over.overNumber,
          ballInOver: over.balls.length + 1,
          bowlerId: bowler.playerId,
          strikerId: scope.playerId,
          delivery,
        },
      );
    });
  }

  /**
   * The human batter plays the delivery announced by `nextBall`. The browser sends a shot, a
   * direction and a timing error; the server rebuilds the AI bowler's delivery from the same seeded
   * stream, applies the batter's skill and the assist level to the timing, and lets the engine
   * decide contact, runs and wicket. Retrying the same actionId returns the stored ball.
   */
  async shoot(
    scope: PlayerScope,
    matchId: string,
    request: ShotRequest,
  ): Promise<DeliveryResultDto> {
    if (!isUuid(matchId)) throw missing();
    return this.transact('match.shot', async (repos, events) => {
      const loaded = await this.load(repos, scope, matchId, true, events);
      const { engine, replay } = loaded;
      const you = findPlayer(replay.input, scope.playerId)!;
      const raw = request.battingIntent;
      const human = {
        input: raw.timingInput,
        assist: raw.assist,
        label: timingLabel(raw.timingInput),
      } as const;
      if (!SHOTS.some((shot) => shot.id === raw.shotId))
        throw new MatchPlayError(
          'INVALID_SHOT',
          'That shot does not exist.',
          400,
        );

      // A retry of an action the server already processed returns the stored ball.
      const previous = replay.commands.find(
        (c) => c.type === 'ball' && c.action.actionId === request.actionId,
      );
      if (previous && previous.type === 'ball') {
        const first = previous.action;
        const ball = engine.resolveBall(first);
        // the same action id must mean the same input: rebuild the engine intent from this request
        // (using the speed of the ball it was played against) and compare it with what was stored
        const expected = humanShotIntent(
          {
            shotId: raw.shotId,
            direction: raw.direction,
            timing: raw.timingInput,
            assist: raw.assist,
          },
          you.player,
          ball.delivery,
        );
        const stored = first.battingIntent;
        if (
          first.expectedSequence !== request.expectedSequence ||
          expected.shotId !== stored.shotId ||
          expected.directionInput !== stored.directionInput ||
          expected.timingInput !== stored.timingInput
        )
          throw conflict(
            'ACTION_ID_REUSED',
            'That action id was already used for a different shot.',
          );
        return presentDelivery(
          this.context(engine, replay, scope.playerId),
          ball,
          true,
          human,
        );
      }

      const state = engine.snapshot();
      if (state.status !== 'in_progress')
        throw conflict('MATCH_FINISHED', 'The match is not in play.');
      const innings = state.innings[state.currentInningsIndex]!;
      if (
        innings.battingTeamId !== you.team.teamId ||
        innings.strikerId !== scope.playerId
      )
        throw conflict(
          'NOT_YOUR_TURN_TO_BAT',
          'You are not on strike right now.',
        );
      if (request.expectedSequence !== state.sequence + 1)
        throw conflict(
          'STALE_SEQUENCE',
          'The match has moved on; reload its state.',
        );
      if (!innings.currentBowlerId)
        throw conflict(
          'BOWLER_REQUIRED',
          'Ask for the next delivery before playing a shot.',
        );
      const bowler = findPlayer(replay.input, innings.currentBowlerId)!.player;
      const sequence = state.sequence + 1;
      const deliveryIntent = replay.input.ai ? chooseDeliveryIntent(engine, replay.input).intent : aiBowlerIntent(
        replay.input.rngSeed,
        bowler,
        sequence,
      );
      const preview = engine.previewDelivery(sequence, deliveryIntent);
      const action: BallAction = {
        actionId: request.actionId,
        expectedSequence: request.expectedSequence,
        deliveryIntent,
        battingIntent: humanShotIntent(
          {
            shotId: raw.shotId,
            direction: raw.direction,
            timing: raw.timingInput,
            assist: raw.assist,
          },
          you.player,
          preview,
        ),
      };
      const ball = engine.resolveBall(action);
      await this.persist(repos, loaded, ball);
      return presentDelivery(
        this.context(engine, engine.replay(), scope.playerId),
        ball,
        false,
        human,
      );
    });
  }

  /** Developer batting lab: one stateless ball through the real engine. Never persists. */
  battingLab(request: BattingLabRequest) {
    if (!this.options.devTools)
      throw new MatchPlayError('LAB_DISABLED', 'Not available.', 404);
    const input: CreateMatchInput = createTestMatch({
      matchId: 'batting-lab',
      formatId: 'format.5_over',
      pitchId: request.pitchId,
      rngSeed: request.seed,
    });
    const bowler = input.teamB.players[5]!;
    bowler.bowlingStyle = request.bowlingStyle;
    bowler.fatigue = 0;
    for (const key of Object.keys(bowler.bowling))
      (bowler.bowling as unknown as Record<string, number>)[key] =
        request.bowlerRating;
    const batter = input.teamA.players[0]!;
    batter.battingHand = request.battingHand;
    for (const key of Object.keys(batter.batting))
      (batter.batting as unknown as Record<string, number>)[key] =
        request.batterRating;
    for (const key of Object.keys(batter.physical))
      (batter.physical as unknown as Record<string, number>)[key] =
        request.batterRating;
    const overrides = request.batterOverrides;
    for (const key of [
      'timing',
      'power',
      'placement',
      'footwork',
      'defence',
    ] as const)
      if (overrides[key] !== undefined)
        (batter.batting as unknown as Record<string, number>)[key] =
          overrides[key]!;
    if (overrides.reflex !== undefined)
      (batter.physical as unknown as Record<string, number>).reflex =
        overrides.reflex;
    const definition = DELIVERIES.find((d) => d.id === request.variationId);
    if (
      !definition ||
      !definition.eligibleStyles.includes(request.bowlingStyle)
    )
      throw new MatchPlayError(
        'INVALID_DELIVERY',
        'That delivery is not available to this bowler.',
        400,
      );
    if (!SHOTS.some((shot) => shot.id === request.shotId))
      throw new MatchPlayError(
        'INVALID_SHOT',
        'That shot does not exist.',
        400,
      );
    const engine = createMatchEngine();
    engine.startMatch(input, {
      winnerTeamId: input.teamA.teamId,
      decision: 'bat',
    });
    engine.selectBowler(bowler.playerId);
    const deliveryIntent = this.intentFrom({
      deliveryIntent: {
        variationId: request.variationId,
        target: request.target,
      },
    });
    const preview = engine.previewDelivery(1, deliveryIntent);
    const battingIntent = humanShotIntent(
      {
        shotId: request.shotId,
        direction: request.direction,
        timing: request.timingInput,
        assist: request.assist,
      },
      batter,
      preview,
    );
    const ball = engine.resolveBall({
      actionId: 'lab-1',
      expectedSequence: 1,
      deliveryIntent,
      battingIntent,
    });
    const presented = presentDelivery(
      this.context(engine, engine.replay(), batter.playerId),
      ball,
      false,
      {
        input: request.timingInput,
        assist: request.assist,
        label: timingLabel(request.timingInput),
      },
    );
    return {
      delivery: presented.delivery,
      shot: presented.shot,
      outcome: presented.outcome,
      batting: presented.batting!,
      engineTimingInput: battingIntent.timingInput ?? null,
      engineDirectionInput: battingIntent.directionInput ?? 0,
    };
  }

  /** Developer bowling lab: one stateless ball through the real engine. Never persists. */
  lab(request: BowlingLabRequest) {
    if (!this.options.devTools)
      throw new MatchPlayError('LAB_DISABLED', 'Not available.', 404);
    const input: CreateMatchInput = createTestMatch({
      matchId: 'bowling-lab',
      formatId: 'format.5_over',
      pitchId: request.pitchId,
      rngSeed: request.seed,
    });
    const bowler = input.teamB.players[5]!;
    bowler.bowlingStyle = request.bowlingStyle;
    bowler.fatigue = request.fatigue;
    for (const key of Object.keys(bowler.bowling))
      (bowler.bowling as unknown as Record<string, number>)[key] =
        request.rating;
    const batter = input.teamA.players[0]!;
    batter.battingHand = request.battingHand;
    for (const key of Object.keys(batter.batting))
      (batter.batting as unknown as Record<string, number>)[key] =
        request.batterRating;
    const engine = createMatchEngine();
    engine.startMatch(input, {
      winnerTeamId: input.teamA.teamId,
      decision: 'bat',
    });
    engine.selectBowler(bowler.playerId);
    const definition = DELIVERIES.find((d) => d.id === request.variationId);
    if (
      !definition ||
      !definition.eligibleStyles.includes(request.bowlingStyle)
    )
      throw new MatchPlayError(
        'INVALID_DELIVERY',
        'That delivery is not available to this bowler.',
        400,
      );
    const intent = this.intentFrom({
      deliveryIntent: {
        variationId: request.variationId,
        target: request.target,
        ...(request.executionInput !== undefined
          ? { executionInput: request.executionInput }
          : {}),
      },
    });
    const ball = engine.resolveBall({
      actionId: 'lab-1',
      expectedSequence: 1,
      deliveryIntent: intent,
      battingIntent: chooseShotIntent(engine, input, intent).intent,
    });
    const presented = presentDelivery(
      this.context(engine, engine.replay(), input.teamA.players[0]!.playerId),
      ball,
      false,
    );
    return {
      delivery: presented.delivery,
      shot: presented.shot,
      outcome: presented.outcome,
      deliveries: deliveriesFor(request.bowlingStyle).map(deliveryCard),
    };
  }

  // ---- internals ---------------------------------------------------------------------------

  private intentFrom(request: {
    deliveryIntent: DeliveryRequest['deliveryIntent'];
  }): DeliveryIntent {
    const { variationId, target, executionInput } = request.deliveryIntent;
    return {
      variationId: variationId as DeliveryIntent['variationId'],
      line: classifyLine(target.x),
      length: classifyLength(target.y),
      target: { x: target.x, y: target.y },
      ...(executionInput !== undefined ? { executionInput } : {}),
    };
  }

  private async load(
    repos: Repositories,
    scope: PlayerScope,
    matchId: string,
    lock: boolean,
    events: DomainEvent[] = [],
  ): Promise<Loaded> {
    // Existence and ownership are indistinguishable to the caller: both are "not found".
    const summary = await repos.matches
      .getMatchForPlayer(scope.playerId, matchId)
      .catch(() => {
        throw missing();
      });
    if (lock) await repos.matches.lockMatch(matchId);
    const session = await repos.matches.getEngineSession(matchId);
    if (!session) throw missing();
    const replay = session.replay as MatchReplay;
    const engine = replayMatch(replay);
    // before the toss has been decided there is no innings to play: the flow service owns that stage
    if (['created', 'ready'].includes(engine.snapshot().status))
      throw conflict('MATCH_NOT_STARTED', 'The toss has not been completed.');
    return {
      repos,
      matchId,
      fixtureId: summary.match.fixtureId ?? null,
      playerId: scope.playerId,
      events,
      session,
      replay,
      engine,
    };
  }

  private context(
    engine: HeadlessMatchEngine,
    replay: MatchReplay,
    playerId: string,
  ): PlayContext {
    const state: EngineMatchState = engine.snapshot();
    const format = MATCH_FORMATS.find((f) => f.id === state.formatId)!;
    return {
      input: replay.input,
      state,
      youPlayerId: playerId,
      eligibleBowlers: engine.eligibleBowlers(),
      maxOversPerBowler: format.maxOversPerBowler,
    };
  }

  private present(
    engine: HeadlessMatchEngine,
    replay: MatchReplay,
    playerId: string,
  ): MatchPlayStateDto {
    return presentMatch(this.context(engine, replay, playerId));
  }

  /** Persist the ball; the session row is saved once per request unless `save` is false. */
  private async persist(
    repos: Repositories,
    loaded: Loaded,
    ball: EngineBallResult,
    save = true,
  ): Promise<void> {
    const state = loaded.engine.snapshot();
    await persistBall(repos, state, ball, loaded.session.participantMap);
    await completeMatchIfFinished(
      repos,
      state,
      loaded.replay.input,
      loaded.session.participantMap,
      loaded.fixtureId,
    );
    if (state.status === 'completed') {
      // stats, form, fatigue, rewards: once, in this same transaction, gated by the result row
      const applied = await this.completion.apply({
        repos,
        matchId: loaded.matchId,
        playerId: loaded.playerId,
        state,
        input: loaded.replay.input,
        now: new Date(),
      });
      loaded.events.push(...applied.events);
    }
    if (save)
      await repos.matches.saveEngineSession(
        loaded.matchId,
        loaded.session.revision,
        loaded.engine.replay(),
        state,
      );
  }
}
