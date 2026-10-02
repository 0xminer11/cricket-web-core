import type { PlayerRole } from '../types/player.types';

/**
 * Module 10: how a human's batting input becomes an engine ShotIntent. These are PRESENTATION and
 * INPUT-INTERPRETATION constants; every cricket outcome is still decided by the Module 8 engine.
 *
 * Timing is measured against the ball: the client records when the bat would meet the ball relative
 * to when the ball arrives (seconds on the presentation clock), divides by `windowSeconds` and clamps
 * to -1 (very early) .. +1 (very late). The server then interprets that number with the batter's own
 * Timing and Reaction and the chosen assist level before handing it to the engine.
 */
export const BATTING_INPUT = {
  /** A contact-time error of this many presentation seconds maps to +/-1. */
  windowSeconds: 0.3,
  /** Normalized |timing| thresholds for the labels Perfect / Early|Late / Very early|Very late. */
  timingLabels: { perfect: 0.14, near: 0.5 },
  /**
   * Assist widens how a timing error is interpreted (it never changes base stats). `auto` sends no
   * timing at all, so the engine times the ball like an AI batter: a lower reward ceiling.
   */
  assist: {
    off: { scale: 1, cue: false, shotHint: false },
    normal: { scale: 0.85, cue: true, shotHint: true },
    high: { scale: 0.65, cue: true, shotHint: true },
    auto: { scale: 1, cue: true, shotHint: true },
  },
  /** How much of a timing error better skill forgives: error * (1 - timing*a - reaction*b*pace). */
  tolerance: { timing: 0.3, reaction: 0.12, referenceSpeed: 38 },
  /** A direction input of +/-1 asks for this many degrees (positive = the off side). */
  directionDegrees: 70,
  /** A tap this soon before the shot becomes available is remembered instead of dropped. */
  inputBufferSeconds: 0.15,
  /** Direction bands for the simplified shot controls. */
  directionBands: { legBelow: -0.34, offAbove: 0.34 },
} as const;
export type BattingAssist = keyof typeof BATTING_INPUT.assist;
export const BATTING_ASSISTS = Object.keys(
  BATTING_INPUT.assist,
) as readonly BattingAssist[];

/**
 * Where a Cricketer bats, by role (0 = opens). Capped by the format's wicket count so they always
 * get a turn before the innings can end.
 */
export const ROLE_BATTING_SLOT: Readonly<Record<PlayerRole, number>> = {
  opening_batter: 0,
  top_order_batter: 1,
  wicketkeeper_batter: 2,
  middle_order_batter: 2,
  batting_all_rounder: 3,
  finisher: 3,
  bowling_all_rounder: 4,
  swing_bowler: 5,
  fast_bowler: 5,
  spin_bowler: 5,
};
export const battingSlot = (role: PlayerRole, maxWickets: number): number =>
  Math.min(ROLE_BATTING_SLOT[role] ?? 2, Math.max(1, maxWickets - 1));
