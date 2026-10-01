import { clone, canonicalJson } from '../state/clone';
import {
  MATCH_FORMATS,
  PITCHES,
  DATA_SCHEMA_VERSION,
  ENGINE_BALANCE as B,
  DELIVERIES,
} from '@the-cricketer/game-core';
import type { MatchFormat, PitchDefinition } from '@the-cricketer/game-core';
import type {
  EngineConfig,
  CreateMatchInput,
  EngineMatchState,
  TossDecision,
  EngineBallResult,
  BallAction,
  MatchReplay,
  EngineCommand,
  MatchEvent,
  EngineInnings,
} from '../state/types';
import { MatchRandom, RNG_ALGORITHM_VERSION } from '../rng/seeded';
import {
  calculateEffectiveMatchAttributes,
  clamp,
} from '../modifiers/effective';
import { resolveDelivery } from '../bowling/resolve';
import { resolveShot } from '../batting/resolve';
import { resolveOutcome } from '../outcomes/resolve';
import { applyScore } from '../rules/scoring';
import {
  assert,
  validateInput,
  validateAction,
  validateMatchState,
} from '../validation/validate';
export class HeadlessMatchEngine {
  private input!: CreateMatchInput;
  private state!: EngineMatchState;
  private format!: MatchFormat;
  private pitch!: PitchDefinition;
  private commands: EngineCommand[] = [];
  private readonly actions = new Map<
    string,
    { action: BallAction; result: EngineBallResult }
  >();
  constructor(private readonly config: EngineConfig = {}) {}
  createMatch(input: CreateMatchInput): void {
    assert(!this.state, 'Engine already initialized');
    const format = (this.config.formats ?? MATCH_FORMATS).find(
      (f) => f.id === input.formatId,
    );
    const pitch = (this.config.pitches ?? PITCHES).find(
      (p) => p.id === input.pitchId,
    );
    assert(format && pitch, 'Unknown format/pitch');
    validateInput(input, format);
    this.input = clone(input);
    this.format = clone(format);
    this.pitch = clone(pitch);
    this.state = {
      matchId: input.matchId,
      status: 'created',
      formatId: input.formatId,
      pitchId: input.pitchId,
      versions: {
        matchEngineVersion: input.matchEngineVersion,
        gameBalanceVersion: input.balanceVersion,
        schemaVersion: DATA_SCHEMA_VERSION,
      },
      toss: null,
      innings: [],
      currentInningsIndex: -1,
      sequence: 0,
      events: [],
      result: null,
    };
  }
  markReady(): void {
    assert(this.state?.status === 'created', 'Match not created');
    this.state.status = 'ready';
    this.commands.push({ type: 'ready' });
  }
  startMatch(input?: CreateMatchInput, toss?: TossDecision): void {
    if (input) this.createMatch(input);
    assert(
      this.state && ['created', 'ready'].includes(this.state.status),
      'Match cannot start',
    );
    const rng = new MatchRandom(`${this.input.rngSeed}:toss`);
    const selected = toss ??
      this.input.toss ?? {
        winnerTeamId:
          rng.next() < 0.5 ? this.input.teamA.teamId : this.input.teamB.teamId,
        decision: rng.next() < 0.5 ? 'bat' : 'bowl',
      };
    assert(
      [this.input.teamA.teamId, this.input.teamB.teamId].includes(
        selected.winnerTeamId,
      ) && ['bat', 'bowl'].includes(selected.decision),
      'Invalid toss',
    );
    this.state.toss = clone(selected);
    this.state.status = 'innings_break';
    this.commands.push({ type: 'start', toss: clone(selected) });
    this.emit('MATCH_STARTED');
    this.emit('TOSS_COMPLETED');
    this.startNextInnings();
  }
  private emit(
    type: MatchEvent['type'],
    extra: { playerId?: string; runs?: number } = {},
  ): void {
    this.state.events.push({
      sequence: this.state.events.length + 1,
      type,
      inningsNumber: this.state.currentInningsIndex + 1,
      deliverySequence: this.state.sequence,
      ...extra,
    });
  }
  startNextInnings(): void {
    assert(this.state.status === 'innings_break', 'Not an innings break');
    const number = this.state.innings.length + 1;
    let battingId: string;
    if (number === 1) {
      const toss = this.state.toss!;
      battingId =
        toss.decision === 'bat'
          ? toss.winnerTeamId
          : this.other(toss.winnerTeamId).teamId;
    } else battingId = this.state.innings.at(-1)!.bowlingTeamId;
    // In the one-round tie-break, the original chasing side bats first.
    if (number === 3) battingId = this.state.innings[1]!.battingTeamId;
    const team = this.team(battingId);
    const bowling = this.other(battingId);
    const superOver = number > 2;
    const inning: EngineInnings = {
      inningsNumber: number,
      battingTeamId: battingId,
      bowlingTeamId: bowling.teamId,
      isSuperOver: superOver,
      maxBalls:
        (superOver ? B.superOver.overs : this.format.oversPerInnings!) *
        this.format.ballsPerOver,
      maxWickets: superOver ? B.superOver.wickets : this.format.maxWickets,
      runs: 0,
      wickets: 0,
      extras: 0,
      legalBalls: 0,
      target: number % 2 === 0 ? this.state.innings.at(-1)!.runs + 1 : null,
      strikerId: team.battingOrder[0]!,
      nonStrikerId: team.battingOrder[1]!,
      currentBowlerId: null,
      nextBatterIndex: 2,
      completed: false,
      overs: [],
      batting: team.battingOrder.map((playerId) => ({
        playerId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dismissal: null,
      })),
      bowling: bowling.bowlingOrder.map((playerId) => ({
        playerId,
        legalBalls: 0,
        runs: 0,
        wickets: 0,
        extras: 0,
        maidens: 0,
        dots: 0,
      })),
    };
    this.state.innings.push(inning);
    this.state.currentInningsIndex++;
    this.state.status = 'in_progress';
    // start already includes opening innings; later transitions are explicit replay commands.
    if (number > 1) this.commands.push({ type: 'innings' });
    this.emit('INNINGS_STARTED');
  }
  private team(id: string) {
    return this.input.teamA.teamId === id ? this.input.teamA : this.input.teamB;
  }
  private other(id: string) {
    return this.input.teamA.teamId === id ? this.input.teamB : this.input.teamA;
  }
  private current() {
    return this.state.innings[this.state.currentInningsIndex]!;
  }
  eligibleBowlers(): string[] {
    if (this.state.status !== 'in_progress') return [];
    const inning = this.current();
    if (inning.currentBowlerId) return [];
    const cap = inning.isSuperOver ? 1 : this.format.maxOversPerBowler;
    return this.team(inning.bowlingTeamId).bowlingOrder.filter(
      (id) =>
        id !== inning.overs.at(-1)?.bowlerId &&
        (cap === null ||
          inning.overs.filter((o) => o.bowlerId === id).length < cap),
    );
  }
  selectBowler(playerId: string): void {
    assert(
      this.eligibleBowlers().includes(playerId),
      'Ineligible bowler selection',
    );
    const inning = this.current();
    inning.currentBowlerId = playerId;
    inning.overs.push({
      overNumber: inning.overs.length + 1,
      bowlerId: playerId,
      runs: 0,
      conceded: 0,
      wickets: 0,
      legalBalls: 0,
      completed: false,
      balls: [],
    });
    this.commands.push({ type: 'bowler', playerId });
    this.emit('OVER_STARTED', { playerId });
  }
  resolveBall(action: BallAction): EngineBallResult {
    const prior = this.actions.get(action.actionId);
    if (prior) {
      assert(
        canonicalJson(prior.action) === canonicalJson(action),
        'Action ID reused with different input',
      );
      return clone(prior.result);
    }
    assert(this.state.status === 'in_progress', 'Match is not accepting balls');
    assert(
      action.expectedSequence === this.state.sequence + 1,
      'Stale/out-of-order action',
    );
    const inning = this.current();
    assert(inning.currentBowlerId, 'Select bowler first');
    const batter = this.team(inning.battingTeamId).players.find(
      (p) => p.playerId === inning.strikerId,
    )!;
    const bowler = this.team(inning.bowlingTeamId).players.find(
      (p) => p.playerId === inning.currentBowlerId,
    )!;
    validateAction(action, bowler);
    const over = inning.overs.at(-1)!;
    assert(over.balls.length < 1000, 'Delivery safety limit exceeded');
    const workload = inning.bowling.find(
      (b) => b.playerId === bowler.playerId,
    )!.legalBalls;
    const effectiveBowler = calculateEffectiveMatchAttributes({
      ...bowler,
      fatigue: clamp(
        bowler.fatigue +
          workload *
            B.fatiguePerDelivery *
            DELIVERIES.find((d) => d.id === action.deliveryIntent.variationId)!
              .staminaCost *
            (1 - bowler.physical.stamina / 200),
        0,
        100,
      ),
    });
    const effectiveBatter = calculateEffectiveMatchAttributes(batter);
    const seed = `${this.input.rngSeed}:ball:${action.expectedSequence}`;
    const delivery = resolveDelivery(
      action.deliveryIntent,
      effectiveBowler,
      this.pitch,
      new MatchRandom(`${seed}:delivery`),
    );
    const shot = resolveShot(
      action.battingIntent,
      effectiveBatter,
      delivery,
      this.pitch,
      new MatchRandom(`${seed}:contact`),
    );
    const outcome = resolveOutcome(
      delivery,
      shot,
      effectiveBatter,
      new MatchRandom(`${seed}:outcome`),
    );
    const beforeRuns = inning.batting.find(
      (b) => b.playerId === batter.playerId,
    )!.runs;
    const eventStart = this.state.events.length;
    const ball: EngineBallResult = {
      ...outcome,
      sequenceNumber: ++this.state.sequence,
      inningsSequence: inning.overs.reduce((s, o) => s + o.balls.length, 0) + 1,
      inningsNumber: inning.inningsNumber,
      overNumber: over.overNumber,
      ballInOver: over.balls.length + 1,
      strikerId: batter.playerId,
      nonStrikerId: inning.nonStrikerId!,
      bowlerId: bowler.playerId,
      delivery,
      shot,
      scoreAfter: 0,
      wicketsAfter: 0,
      strikerAfter: null,
      nonStrikerAfter: null,
      events: [],
    };
    applyScore(
      inning,
      ball,
      this.team(inning.battingTeamId),
      this.format.ballsPerOver,
    );
    this.emit('BALL_COMPLETED', {
      playerId: batter.playerId,
      runs: ball.runsOffBat + ball.extras,
    });
    if (ball.runsOffBat === 4 || ball.runsOffBat === 6)
      this.emit(ball.runsOffBat === 6 ? 'SIX' : 'BOUNDARY', {
        playerId: batter.playerId,
      });
    if (ball.wicketType) this.emit('WICKET', { playerId: batter.playerId });
    for (const milestone of [50, 100])
      if (beforeRuns < milestone && beforeRuns + ball.runsOffBat >= milestone)
        this.emit(milestone === 50 ? 'FIFTY' : 'HUNDRED', {
          playerId: batter.playerId,
        });
    if (over.completed) this.emit('OVER_COMPLETED');
    if (inning.completed) {
      if (inning.target !== null && inning.runs >= inning.target)
        this.emit('TARGET_REACHED');
      this.emit('INNINGS_COMPLETED');
      this.finishInnings();
    }
    ball.events = clone(this.state.events.slice(eventStart));
    this.commands.push({ type: 'ball', action: clone(action) });
    this.actions.set(action.actionId, { action: clone(action), result: ball });
    if (this.config.validateAfterBall !== false)
      validateMatchState(this.state, this.input);
    return clone(ball);
  }
  private finishInnings(): void {
    const inning = this.current();
    if (inning.inningsNumber % 2 !== 0) {
      this.state.status = 'innings_break';
      return;
    }
    const first = this.state.innings[this.state.currentInningsIndex - 1]!;
    if (
      inning.runs === first.runs &&
      this.format.tieRule === 'super_over' &&
      this.format.superOverEnabled &&
      !inning.isSuperOver
    ) {
      this.state.status = 'innings_break';
      return;
    }
    const chased = inning.runs > first.runs;
    const tied = inning.runs === first.runs;
    this.state.result = {
      type: tied ? 'tie' : 'win',
      winnerTeamId: tied
        ? null
        : chased
          ? inning.battingTeamId
          : first.battingTeamId,
      margin: tied
        ? 0
        : chased
          ? inning.maxWickets - inning.wickets
          : first.runs - inning.runs,
      marginType: tied ? null : chased ? 'wickets' : 'runs',
      superOver: inning.isSuperOver,
    };
    this.state.status = 'completed';
    this.emit('MATCH_COMPLETED');
  }
  abandon(): void {
    assert(
      this.state && !['completed', 'abandoned'].includes(this.state.status),
      'Cannot abandon',
    );
    this.state.status = 'abandoned';
    this.commands.push({ type: 'abandon' });
    this.emit('MATCH_ABANDONED');
  }
  /** Small detached view for AI orchestration; avoids cloning the growing history per ball. */
  cursor() {
    assert(this.state, 'Match not initialized');
    const innings = this.state.innings[this.state.currentInningsIndex];
    return {
      status: this.state.status,
      sequence: this.state.sequence,
      battingTeamId: innings?.battingTeamId ?? null,
      bowlingTeamId: innings?.bowlingTeamId ?? null,
      strikerId: innings?.strikerId ?? null,
      bowlerId: innings?.currentBowlerId ?? null,
    };
  }
  snapshot(): EngineMatchState {
    assert(this.state, 'Match not initialized');
    return clone(this.state);
  }
  replay(): MatchReplay {
    return clone({
      schemaVersion: 1,
      rngAlgorithmVersion: RNG_ALGORITHM_VERSION,
      input: this.input,
      commands: this.commands,
    });
  }
}
export const createMatchEngine = (
  config: EngineConfig = {},
): HeadlessMatchEngine => new HeadlessMatchEngine(config);
