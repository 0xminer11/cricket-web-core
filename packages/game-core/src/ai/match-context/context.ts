import { AI_TUNING } from '../config/tuning';
import { clamp01, normalCdf } from '../core/math';
import type { BallRecord, MatchPhase, MatchSituation } from '../types';

const T = AI_TUNING.context;

/** Everything the AI works out about the state of the match before it decides anything. */
export interface MatchContext {
  readonly phase: MatchPhase;
  /** Fraction of the innings' legal balls already bowled. */
  readonly progress: number;
  readonly ballsRemaining: number;
  readonly wicketsRemaining: number;
  readonly runsNeeded: number | null;
  readonly chasing: boolean;
  /** Runs per over so far, and needed per over (null when batting first / nothing to chase). */
  readonly currentRate: number | null;
  readonly requiredRate: number | null;
  readonly parRunsPerBall: number;
  readonly finalOver: boolean;
  readonly lastBall: boolean;
  readonly lastWicket: boolean;
  /** 0..1: how steep the chase is (required rate against par, scaled by the resources left). */
  readonly chaseDifficulty: number;
  /** 0..1: scoring pressure from the rate, the wickets and dot balls in a row. */
  readonly pressure: number;
  /** 0..1: how much of the innings' scoring capacity is still available. */
  readonly resources: number;
  readonly dotStreak: number;
}

export function parRunsPerBall(formatId: string): number {
  return T.parRunsPerBall.byFormat[formatId] ?? T.parRunsPerBall.default;
}

export function phaseOf(progress: number): MatchPhase {
  return progress < T.phase.earlyUntil
    ? 'early'
    : progress >= T.phase.deathFrom
      ? 'death'
      : 'middle';
}

const phaseMultiplier = (phase: MatchPhase): number => T.phaseScoring[phase];

/**
 * The runs the AI expects its side to make from the remaining balls at par, phase by phase (the end of an innings scores
 * faster than the start). Used only for strategy; the engine decides what actually happens.
 */
export function remainingParRuns(
  legalBalls: number,
  maxBalls: number,
  parPerBall: number,
): number {
  let runs = 0;
  const segments: [MatchPhase, number, number][] = [
    ['early', 0, T.phase.earlyUntil * maxBalls],
    ['middle', T.phase.earlyUntil * maxBalls, T.phase.deathFrom * maxBalls],
    ['death', T.phase.deathFrom * maxBalls, maxBalls],
  ];
  for (const [phase, from, to] of segments) {
    const balls = Math.max(0, to - Math.max(from, legalBalls));
    runs += balls * parPerBall * phaseMultiplier(phase);
  }
  return runs;
}

/** Share of the remaining scoring that wickets in hand allow (1 = unconstrained, 0 = no wickets left). */
export function wicketResource(
  wicketsLeft: number,
  ballsRemaining: number,
): number {
  if (wicketsLeft <= 0 || ballsRemaining <= 0) return 0;
  const expectedLosses = Math.max(0.05, ballsRemaining * T.wicketsPerBall);
  return 1 - Math.exp(-wicketsLeft / expectedLosses);
}

/** Expected runs still to come for the batting side. */
export function projectedRemainingRuns(
  s: Pick<MatchSituation, 'maxBalls' | 'maxWickets' | 'formatId'>,
  legalBalls: number,
  wickets: number,
): number {
  const ballsLeft = s.maxBalls - legalBalls;
  const wicketsLeft = s.maxWickets - wickets;
  if (ballsLeft <= 0 || wicketsLeft <= 0) return 0;
  return (
    remainingParRuns(legalBalls, s.maxBalls, parRunsPerBall(s.formatId)) *
    wicketResource(wicketsLeft, ballsLeft)
  );
}

/** Consecutive dot balls (no runs, legal) at the end of the history faced by this batter. */
export function dotStreak(history: readonly BallRecord[], strikerId: string): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const b = history[i]!;
    if (b.strikerId !== strikerId) break;
    if (!b.legal) continue;
    if (b.runsOffBat + b.extras > 0 || b.wicket) break;
    streak++;
  }
  return streak;
}

export function analyzeContext(
  s: MatchSituation,
  history: readonly BallRecord[] = [],
  strikerId: string | null = null,
): MatchContext {
  const ballsRemaining = Math.max(0, s.maxBalls - s.legalBalls);
  const wicketsRemaining = Math.max(0, s.maxWickets - s.wickets);
  const progress = s.maxBalls > 0 ? clamp01(s.legalBalls / s.maxBalls) : 1;
  const par = parRunsPerBall(s.formatId);
  const chasing = s.target !== null;
  const runsNeeded = chasing ? Math.max(0, s.target! - s.runs) : null;
  const overs = s.legalBalls / s.ballsPerOver;
  const currentRate = overs > 0 ? s.runs / overs : null;
  const requiredRate =
    chasing && ballsRemaining > 0
      ? (runsNeeded! * s.ballsPerOver) / ballsRemaining
      : null;
  const resources = wicketResource(wicketsRemaining, ballsRemaining);
  const parPerOver = par * s.ballsPerOver;
  const chaseDifficulty =
    chasing && ballsRemaining > 0
      ? clamp01(
          (requiredRate! / (parPerOver * Math.max(0.2, resources)) - 0.6) /
            (T.hardChaseRatio - 0.6),
        )
      : chasing && runsNeeded! > 0
        ? 1
        : 0;
  const streak = strikerId ? dotStreak(history, strikerId) : 0;
  const ratePressure =
    requiredRate !== null
      ? clamp01((requiredRate / parPerOver - 0.7) / 1.2)
      : clamp01(progress * 0.4);
  const wicketPressure = clamp01(
    (s.wickets / Math.max(1, s.maxWickets)) * (0.5 + progress),
  );
  const dotPressure = clamp01(streak / T.pressure.dotStreakCap);
  const pressure = clamp01(
    T.pressure.weights.rate * ratePressure +
      T.pressure.weights.wickets * wicketPressure +
      T.pressure.weights.dots * dotPressure,
  );
  return {
    phase: phaseOf(progress),
    progress,
    ballsRemaining,
    wicketsRemaining,
    runsNeeded,
    chasing,
    currentRate,
    requiredRate,
    parRunsPerBall: par,
    finalOver: ballsRemaining > 0 && ballsRemaining <= s.ballsPerOver,
    lastBall: ballsRemaining === 1,
    lastWicket: wicketsRemaining === 1,
    chaseDifficulty,
    pressure,
    resources,
    dotStreak: streak,
  };
}

/**
 * How good the position is for the batting side: the probability of winning a chase, or (batting first) the projected total
 * in runs. The AI scores an outcome by how much it changes this number.
 */
export function stateValue(
  s: MatchSituation,
  runs: number,
  wickets: number,
  legalBalls: number,
): number {
  const ballsLeft = s.maxBalls - legalBalls;
  const wicketsLeft = s.maxWickets - wickets;
  if (s.target !== null) {
    const need = s.target - runs;
    if (need <= 0) return 1;
    if (ballsLeft <= 0 || wicketsLeft <= 0) return 0;
    const mean =
      projectedRemainingRuns(s, legalBalls, wickets) -
      AI_TUNING.value.wicketFloor * wickets;
    const effective = Math.max(
      1,
      ballsLeft * wicketResource(wicketsLeft, ballsLeft),
    );
    const sd = AI_TUNING.context.ballSd * Math.sqrt(effective);
    return 1 - normalCdf((need - 0.5 - mean) / sd);
  }
  return (
    runs +
    projectedRemainingRuns(s, legalBalls, wickets) -
    AI_TUNING.value.wicketFloor * wickets
  );
}

/** The scale that turns a change of `stateValue` into the AI's unit utility. */
export const valueScale = (s: MatchSituation): number =>
  s.target !== null
    ? AI_TUNING.value.chaseScale
    : 1 / AI_TUNING.value.totalRunsScale;
