import { isUuid } from '@the-cricketer/database';
import type { Database, Repositories } from '@the-cricketer/database';
import {
  COMPETITION_BY_ID,
  MATCH_FORMATS,
  PITCH_BY_ID,
  PITCH_PRESENTATION,
  ROLE_DISPLAY_NAMES,
  VENUE_BY_TEAM,
  chooseTossDecision,
  isSpinStyle,
  coinFromRoll,
  playerOverall,
  resolveToss,
  tossSummary,
} from '@the-cricketer/game-core';
import type { DomainEvent, TossCall } from '@the-cricketer/game-core';
import { MatchRandom, replayMatch } from '@the-cricketer/match-engine';
import type {
  CreateMatchInput,
  EngineMatchState,
  HeadlessMatchEngine,
  MatchReplay,
  MatchTeamSnapshot,
} from '@the-cricketer/match-engine';
import { AppError } from '@the-cricketer/server-kit';
import type {
  MatchFlowDto,
  MatchResultDto,
  ScorecardDto,
  TeamSheetDto,
  TossCallRequest,
  TossDecisionRequest,
  TossDto,
} from '@the-cricketer/shared-types';
import type { PlayerScope } from '../player/equipment.service';
import type { DomainEventPublisher } from '../player/player.events';
import { newDomainEvent } from '../player/player.events';
import {
  MatchCompletionService,
  presentMatchResult,
} from './match-completion.service';
import type { StoredCareerResult } from './match-completion.service';
import { STYLE_NAMES, findPlayer } from './match-play.presenter';
import { buildScorecard } from './match-scorecard';

class FlowError extends AppError {}
const missing = () => new FlowError('MATCH_NOT_FOUND', 'Match not found.', 404);
const conflict = (code: string, message: string) =>
  new FlowError(code, message, 409);

/** What the toss has decided so far; persisted in `match_engine_sessions.flow` (never recomputed from the client). */
export interface TossFlow {
  readonly callerTeamId: string;
  /** What the AI calls when it is the caller. */
  readonly aiCall?: TossCall;
  readonly call?: TossCall;
  readonly coin?: TossCall;
  readonly winnerTeamId?: string;
  readonly decision?: 'bat' | 'bowl';
  readonly decidedBy?: 'you' | 'ai';
}
interface FlowJson {
  toss?: TossFlow;
}

interface Loaded {
  readonly repos: Repositories;
  readonly matchId: string;
  readonly summary: Awaited<
    ReturnType<Repositories['matches']['getMatchSummary']>
  >;
  readonly session: NonNullable<
    Awaited<ReturnType<Repositories['matches']['getEngineSession']>>
  >;
  readonly replay: MatchReplay;
  readonly engine: HeadlessMatchEngine;
  readonly state: EngineMatchState;
  readonly flow: FlowJson;
  readonly yourTeam: MatchTeamSnapshot;
  readonly opponent: MatchTeamSnapshot;
  readonly input: CreateMatchInput;
}

/** The mean of a team's batting or bowling attributes: the AI's own strengths when it decides the toss. */
function strength(
  team: MatchTeamSnapshot,
  group: 'batting' | 'bowling',
): number {
  const values = team.players.filter((p) => group === "batting" ? team.battingOrder.indexOf(p.playerId) < 6 : team.bowlingOrder.includes(p.playerId)).flatMap((p) =>
    Object.values(p[group] as unknown as Record<string, number>),
  );
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}

/**
 * Team sheets, the toss, and the read models of a match (flow, scorecard, result). The toss is decided on
 * the server from the match seed: the browser can only make the one call it is asked for and the one
 * bat/bowl choice it is entitled to, and both are idempotent.
 */
export class MatchFlowService {
  private readonly completion = new MatchCompletionService();
  constructor(
    private readonly database: Database,
    private readonly events: DomainEventPublisher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---- reads ---------------------------------------------------------------------------------------

  async flow(scope: PlayerScope, matchId: string): Promise<MatchFlowDto> {
    if (!isUuid(matchId)) throw missing();
    const repos = this.database.repositories();
    const loaded = await this.load(repos, scope, matchId, false);
    return this.present(loaded, scope);
  }

  async scorecard(
    scope: PlayerScope,
    matchId: string,
    options: { timeline: boolean },
  ): Promise<ScorecardDto> {
    if (!isUuid(matchId)) throw missing();
    const repos = this.database.repositories();
    const loaded = await this.load(repos, scope, matchId, false);
    if (loaded.state.status === 'created' || loaded.state.status === 'ready')
      throw conflict('MATCH_NOT_STARTED', 'The toss has not been completed.');
    return buildScorecard({
      matchId,
      state: loaded.state,
      createInput: loaded.input,
      youPlayerId: scope.playerId,
      timeline: options.timeline,
      tossText: this.tossDto(loaded, scope.playerId).summary,
    });
  }

  /**
   * The persisted result. If the match is complete but its career effects were never applied (a match that
   * finished before Module 11, or a completion that has not run), they are applied now, once, and the result
   * is returned; asking again returns exactly the same thing.
   */
  async result(scope: PlayerScope, matchId: string): Promise<MatchResultDto> {
    if (!isUuid(matchId)) throw missing();
    const read = this.database.repositories();
    const loaded = await this.load(read, scope, matchId, false);
    if (loaded.state.status !== 'completed')
      throw conflict('INVALID_MATCH_STAGE', 'The match is not finished yet.');
    let stored = await read.matches.getCareerResult(matchId, scope.playerId);
    if (!stored) {
      const events = await this.database.transaction(
        async (tx) => {
          const repos = this.database.repositories(tx);
          await repos.matches.lockMatch(matchId);
          const again = await this.load(repos, scope, matchId, true);
          return (
            await this.completion.apply({
              repos,
              matchId,
              playerId: scope.playerId,
              state: again.state,
              input: again.input,
              now: this.now(),
            })
          ).events;
        },
        { operation: 'match.result.process' },
      );
      this.publish(events);
      stored = await read.matches.getCareerResult(matchId, scope.playerId);
    }
    return presentMatchResult({
      matchId,
      state: loaded.state,
      createInput: loaded.input,
      playerId: scope.playerId,
      stored:
        (stored?.summary as unknown as StoredCareerResult | undefined) ?? null,
    });
  }

  // ---- the toss ------------------------------------------------------------------------------------

  /** Make (or look up) the toss. Idempotent: the same result however many times it is asked. */
  async callToss(
    scope: PlayerScope,
    matchId: string,
    request: TossCallRequest,
  ): Promise<MatchFlowDto> {
    if (!isUuid(matchId)) throw missing();
    const events: DomainEvent[] = [];
    const flow = await this.database.transaction(
      async (tx) => {
        const repos = this.database.repositories(tx);
        const loaded = await this.load(repos, scope, matchId, true);
        const toss = loaded.flow.toss;
        if (!toss) {
          // a match that started before the toss existed already has its toss in the replay
          return this.present(loaded, scope);
        }
        if (toss.call) return this.present(loaded, scope); // already tossed: the same persisted result
        if (
          loaded.state.status !== 'created' &&
          loaded.state.status !== 'ready'
        )
          throw conflict(
            'INVALID_TOSS_STATE',
            'The toss has already been made.',
          );
        const youCall = toss.callerTeamId === loaded.yourTeam.teamId;
        if (youCall && !request.call)
          throw conflict('INVALID_TOSS_STATE', 'Call heads or tails.');
        const call: TossCall = youCall ? request.call! : toss.aiCall!;
        const coin = coinFromRoll(
          new MatchRandom(`${loaded.input.rngSeed}:toss:coin`).next(),
        );
        const outcome = resolveToss({
          callerTeamId: toss.callerTeamId,
          otherTeamId:
            toss.callerTeamId === loaded.yourTeam.teamId
              ? loaded.opponent.teamId
              : loaded.yourTeam.teamId,
          call,
          coin,
        });
        let next: TossFlow = {
          ...toss,
          call,
          coin,
          winnerTeamId: outcome.winnerTeamId,
        };
        if (outcome.winnerTeamId === loaded.opponent.teamId) {
          const summarize = (team: MatchTeamSnapshot) => ({ battingStrength: strength(team, "batting"), bowlingStrength: strength(team, "bowling"), paceBowlers: team.players.filter((p) => p.bowlingStyle && !isSpinStyle(p.bowlingStyle)).length, spinBowlers: team.players.filter((p) => p.bowlingStyle && isSpinStyle(p.bowlingStyle)).length });
          const { decision } = chooseTossDecision({
            pitchId: loaded.state.pitchId,
            formatId: loaded.state.formatId,
            own: summarize(loaded.opponent),
            opponent: summarize(loaded.yourTeam),
          }, new MatchRandom(`${loaded.input.rngSeed}:ai:toss`));
          next = { ...next, decision, decidedBy: 'ai' };
          return this.start(loaded, scope, next, events);
        }
        await repos.matches.saveEngineSession(
          matchId,
          loaded.session.revision,
          loaded.session.replay,
          loaded.session.state,
          { toss: next },
        );
        return this.present(
          {
            ...loaded,
            flow: { toss: next },
            session: {
              ...loaded.session,
              revision: loaded.session.revision + 1,
            },
          },
          scope,
        );
      },
      { operation: 'match.toss.call' },
    );
    this.publish(events);
    return flow;
  }

  /** The winner's bat/bowl choice. Allowed once, only for the winner, only before the first innings starts. */
  async decide(
    scope: PlayerScope,
    matchId: string,
    request: TossDecisionRequest,
  ): Promise<MatchFlowDto> {
    if (!isUuid(matchId)) throw missing();
    const events: DomainEvent[] = [];
    const flow = await this.database.transaction(
      async (tx) => {
        const repos = this.database.repositories(tx);
        const loaded = await this.load(repos, scope, matchId, true);
        const toss = loaded.flow.toss;
        const started =
          loaded.state.status !== 'created' && loaded.state.status !== 'ready';
        if (started) {
          // the decision cannot be changed once the first innings exists; the same choice is simply confirmed
          const decided = loaded.state.toss?.decision;
          if (decided === request.decision && toss?.decidedBy === 'you')
            return this.present(loaded, scope);
          throw conflict(
            'INVALID_TOSS_DECISION',
            'The toss decision has already been made.',
          );
        }
        if (!toss?.call || !toss.winnerTeamId)
          throw conflict(
            'INVALID_TOSS_STATE',
            'The toss has not been made yet.',
          );
        if (toss.winnerTeamId !== loaded.yourTeam.teamId)
          throw conflict(
            'INVALID_TOSS_DECISION',
            'Only the side that won the toss chooses.',
          );
        return this.start(
          loaded,
          scope,
          { ...toss, decision: request.decision, decidedBy: 'you' },
          events,
        );
      },
      { operation: 'match.toss.decision' },
    );
    this.publish(events);
    return flow;
  }

  // ---- internals -----------------------------------------------------------------------------------

  /** Starts the engine with the decided toss: the first innings now exists. */
  private async start(
    loaded: Loaded,
    scope: PlayerScope,
    toss: TossFlow,
    events: DomainEvent[],
  ): Promise<MatchFlowDto> {
    const engine = replayMatch(loaded.replay);
    engine.startMatch(undefined, {
      winnerTeamId: toss.winnerTeamId!,
      decision: toss.decision!,
    });
    await loaded.repos.matches.startMatch(loaded.matchId);
    await loaded.repos.matches.saveEngineSession(
      loaded.matchId,
      loaded.session.revision,
      engine.replay(),
      engine.snapshot(),
      { toss },
    );
    events.push(
      newDomainEvent(
        'match.toss_completed',
        {
          matchId: loaded.matchId,
          winnerTeamId: toss.winnerTeamId!,
          decision: toss.decision!,
        },
        this.now(),
      ),
    );
    return this.present(
      {
        ...loaded,
        engine,
        state: engine.snapshot(),
        flow: { toss },
        replay: engine.replay(),
        session: { ...loaded.session, revision: loaded.session.revision + 1 },
      },
      scope,
    );
  }

  private publish(events: readonly DomainEvent[]): void {
    for (const event of events) this.events.publish(event);
  }

  private async load(
    repos: Repositories,
    scope: PlayerScope,
    matchId: string,
    lock: boolean,
  ): Promise<Loaded> {
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
    const found = findPlayer(replay.input, scope.playerId);
    if (!found)
      throw new FlowError(
        'PLAYER_NOT_PARTICIPANT',
        'You are not part of this match.',
        403,
      );
    const yourTeam = found.team;
    const opponent =
      replay.input.teamA.teamId === yourTeam.teamId
        ? replay.input.teamB
        : replay.input.teamA;
    return {
      repos,
      matchId,
      summary,
      session,
      replay,
      engine,
      state: engine.snapshot(),
      flow: (session.flow ?? {}) as FlowJson,
      yourTeam,
      opponent,
      input: replay.input,
    };
  }

  private tossDto(loaded: Loaded, youPlayerId: string): TossDto {
    void youPlayerId;
    const { state, flow, yourTeam, input } = loaded;
    const name = (teamId: string) =>
      (input.teamA.teamId === teamId ? input.teamA : input.teamB).displayName;
    const stored = flow.toss;
    // The away side calls. A match started before the toss existed has no stored toss: its replay does.
    const callerTeamId = stored?.callerTeamId ?? input.teamB.teamId;
    const legacy = state.toss;
    const winnerTeamId = stored?.winnerTeamId ?? legacy?.winnerTeamId ?? null;
    const decision = stored?.decision ?? legacy?.decision ?? null;
    const decidedBy = stored?.decidedBy ?? null;
    const called = stored?.call ?? null;
    return {
      callerTeamId,
      callerName: name(callerTeamId),
      youCall: callerTeamId === yourTeam.teamId,
      call: called,
      // the coin is never revealed before the call is made
      coin: called ? (stored?.coin ?? null) : null,
      winnerTeamId,
      winnerName: winnerTeamId ? name(winnerTeamId) : null,
      youWon: winnerTeamId ? winnerTeamId === yourTeam.teamId : null,
      decision,
      decidedBy,
      summary:
        winnerTeamId && decision
          ? tossSummary({ winnerName: name(winnerTeamId), decision })
          : winnerTeamId
            ? `${name(winnerTeamId)} won the toss.`
            : null,
    };
  }

  private sheet(
    team: MatchTeamSnapshot,
    isYours: boolean,
    youPlayerId: string,
  ): TeamSheetDto {
    return {
      teamId: team.teamId,
      name: team.displayName,
      isYours,
      players: team.battingOrder.map((id, index) => {
        const p = team.players.find((x) => x.playerId === id)!;
        return {
          playerId: p.playerId,
          name: p.displayName,
          role: p.role,
          roleName: ROLE_DISPLAY_NAMES[p.role],
          battingPosition: index + 1,
          battingHand: p.battingHand,
          bowlingStyleName: p.bowlingStyle ? STYLE_NAMES[p.bowlingStyle] : null,
          // your own side's overall; the opposition's attributes are not scouted
          overall: isYours
            ? Math.round(
                playerOverall(
                  {
                    batting: p.batting,
                    bowling: p.bowling,
                    physical: p.physical,
                    personality: p.personality,
                  } as never,
                  p.role,
                ),
              )
            : null,
          isYou: p.playerId === youPlayerId,
        };
      }),
    };
  }

  private async present(
    loaded: Loaded,
    scope: PlayerScope,
  ): Promise<MatchFlowDto> {
    const { state, input, summary, repos } = loaded;
    const format = MATCH_FORMATS.find((f) => f.id === state.formatId)!;
    const pitch = PITCH_BY_ID.get(state.pitchId as never)!;
    const fixture = summary.match.fixtureId
      ? await repos.teams.getFixture(summary.match.fixtureId)
      : null;
    const home = await repos.teams.getById(summary.match.homeTeamId);
    const venue = home ? VENUE_BY_TEAM.get(home.definitionId) : undefined;
    const competition = fixture
      ? COMPETITION_BY_ID.get(fixture.competitionDefinitionId)
      : undefined;
    const you = findPlayer(input, scope.playerId)!;
    const started = state.status !== 'created' && state.status !== 'ready';
    const toss = this.tossDto(loaded, scope.playerId);
    const stage: MatchFlowDto['stage'] =
      state.status === 'completed'
        ? 'completed'
        : state.status === 'abandoned'
          ? 'abandoned'
          : state.status === 'innings_break'
            ? 'innings_break'
            : started
              ? 'in_progress'
              : toss.winnerTeamId
                ? 'toss_decision'
                : 'toss';
    const stats = await repos.players.getStats(scope.playerId);
    return {
      matchId: loaded.matchId,
      stage,
      format: {
        id: format.id,
        name: format.displayName,
        oversPerInnings: format.oversPerInnings,
        ballsPerOver: format.ballsPerOver,
        maxWickets: format.maxWickets,
      },
      pitch: {
        id: pitch.id,
        name: pitch.displayName,
        kind: pitch.id.replace('pitch.', '') as 'green' | 'hard' | 'dry',
        hint: PITCH_PRESENTATION[pitch.id] ?? '',
      },
      venueName: venue?.name ?? null,
      competitionName: competition?.name ?? null,
      you: {
        playerId: you.player.playerId,
        name: you.player.displayName,
        role: you.player.role,
        roleName: ROLE_DISPLAY_NAMES[you.player.role],
        fatigue: Math.round(you.player.fatigue),
        form: Math.round(you.player.form),
      },
      yourTeam: this.sheet(loaded.yourTeam, true, scope.playerId),
      opponentTeam: this.sheet(loaded.opponent, false, scope.playerId),
      toss,
      firstMatch: (stats?.matches ?? 0) === 0,
      started,
    };
  }
}
