import { MATCH_PROGRESSION as P } from './config';

/** A player's figures in one finished match (super-over balls excluded, as the engine's performance does). */
export interface PlayerMatchFigures {
  readonly batting: {
    readonly runs: number;
    readonly balls: number;
    readonly fours: number;
    readonly sixes: number;
    /** True when they were given out (anything else, including not having faced a ball, is not out). */
    readonly dismissed: boolean;
  } | null;
  readonly bowling: {
    readonly legalBalls: number;
    readonly runs: number;
    readonly wickets: number;
    readonly maidens: number;
  } | null;
}

/** Counters to add to a career stats row; the same shape the database applies (`StatsDelta`). */
export interface PlayerStatsDelta {
  readonly matches: number;
  readonly matchesWon: number;
  readonly inningsBatted: number;
  readonly runs: number;
  readonly ballsFaced: number;
  readonly fours: number;
  readonly sixes: number;
  readonly fifties: number;
  readonly hundreds: number;
  readonly highestScore: number;
  readonly notOuts: number;
  readonly ballsBowled: number;
  readonly runsConceded: number;
  readonly wickets: number;
  readonly maidens: number;
  readonly bestBowling?: { readonly wickets: number; readonly runs: number };
}

/** A batter has "batted" once they faced a ball or were dismissed. */
export const hasBatted = (b: PlayerMatchFigures['batting']): boolean =>
  b !== null && (b.balls > 0 || b.dismissed);
export const hasBowled = (b: PlayerMatchFigures['bowling']): boolean =>
  b !== null && b.legalBalls > 0;
/** Faced or bowled at least a ball: only then do they have a performance rating and a form update. */
export const tookPart = (f: PlayerMatchFigures): boolean =>
  (f.batting?.balls ?? 0) + (f.bowling?.legalBalls ?? 0) >=
  P.involvementMinBalls;

/**
 * Pure: what one match adds to a player's career counters. Only base counters are stored; averages, strike
 * rates and economy are derived from them elsewhere. Every counter is exact cricket arithmetic:
 * `notOuts` counts innings batted that ended without a dismissal, so batting average is runs / (innings - notOuts).
 */
export function deriveStatsDelta(
  figures: PlayerMatchFigures,
  won: boolean,
): PlayerStatsDelta {
  const batting = hasBatted(figures.batting) ? figures.batting! : null;
  const bowling = hasBowled(figures.bowling) ? figures.bowling! : null;
  const runs = batting?.runs ?? 0;
  return {
    matches: 1,
    matchesWon: won ? 1 : 0,
    inningsBatted: batting ? 1 : 0,
    runs,
    ballsFaced: batting?.balls ?? 0,
    fours: batting?.fours ?? 0,
    sixes: batting?.sixes ?? 0,
    fifties: runs >= 50 && runs < 100 ? 1 : 0,
    hundreds: runs >= 100 ? 1 : 0,
    highestScore: runs,
    notOuts: batting && !batting.dismissed ? 1 : 0,
    ballsBowled: bowling?.legalBalls ?? 0,
    runsConceded: bowling?.runs ?? 0,
    wickets: bowling?.wickets ?? 0,
    maidens: bowling?.maidens ?? 0,
    ...(bowling
      ? { bestBowling: { wickets: bowling.wickets, runs: bowling.runs } }
      : {}),
  };
}

/** Is `candidate` better bowling than `best`: more wickets, then fewer runs for the same wickets. */
export const isBetterBowling = (
  candidate: { readonly wickets: number; readonly runs: number },
  best: { readonly wickets: number; readonly runs: number },
): boolean =>
  candidate.wickets > best.wickets ||
  (candidate.wickets === best.wickets &&
    candidate.wickets > 0 &&
    candidate.runs < best.runs);
