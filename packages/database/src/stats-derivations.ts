import type { PlayerStatsRecord } from './records';

/**
 * Derived statistics. Only base counters are stored; these are pure functions of them.
 * Returns null where the ratio is undefined (no dismissals / no balls).
 */
type BattingCounters = Pick<
  PlayerStatsRecord,
  'runs' | 'inningsBatted' | 'notOuts' | 'ballsFaced'
>;
type BowlingCounters = Pick<
  PlayerStatsRecord,
  'runsConceded' | 'wickets' | 'ballsBowled'
>;

export const battingAverage = (s: BattingCounters): number | null => {
  const dismissals = s.inningsBatted - s.notOuts;
  return dismissals > 0 ? s.runs / dismissals : null;
};
export const strikeRate = (s: BattingCounters): number | null =>
  s.ballsFaced > 0 ? (s.runs / s.ballsFaced) * 100 : null;
export const bowlingAverage = (s: BowlingCounters): number | null =>
  s.wickets > 0 ? s.runsConceded / s.wickets : null;
export const economyRate = (
  s: BowlingCounters,
  ballsPerOver = 6,
): number | null =>
  s.ballsBowled > 0 ? (s.runsConceded / s.ballsBowled) * ballsPerOver : null;
export const bowlingStrikeRate = (s: BowlingCounters): number | null =>
  s.wickets > 0 ? s.ballsBowled / s.wickets : null;
/** Whole overs and remaining balls, e.g. 14 balls => "2.2". */
export const oversBowled = (ballsBowled: number, ballsPerOver = 6): string =>
  `${Math.floor(ballsBowled / ballsPerOver)}.${ballsBowled % ballsPerOver}`;
