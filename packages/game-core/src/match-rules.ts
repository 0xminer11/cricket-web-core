import type {
  DeliveryLength,
  DeliveryLine,
  ShotDefinition,
} from './types/index';

/**
 * How well a shot fits a delivery's line and length: 0, 0.5 or 1 (half for each of the two things that match).
 * It lives in game-core so the match engine (which resolves contact with it) and the AI (which chooses shots with it) read
 * ONE definition and can never disagree about which shot suits which ball.
 */
export function shotSuitability(
  shot: ShotDefinition,
  line: DeliveryLine,
  length: DeliveryLength,
): number {
  return (
    (Number(shot.idealLines.includes(line)) +
      Number(shot.idealLengths.includes(length))) /
    2
  );
}

export type FieldRegionName =
  | 'straight'
  | 'cover'
  | 'point'
  | 'third_man'
  | 'mid_wicket'
  | 'square_leg'
  | 'fine_leg';

/** The part of the ground a shot direction (degrees, + = off side, relative to the batter's hand) goes to. */
export function fieldRegion(degrees: number): FieldRegionName {
  if (Math.abs(degrees) <= 18) return 'straight';
  if (degrees > 0)
    return degrees < 60 ? 'cover' : degrees < 90 ? 'point' : 'third_man';
  return degrees > -60
    ? 'mid_wicket'
    : degrees > -90
      ? 'square_leg'
      : 'fine_leg';
}
