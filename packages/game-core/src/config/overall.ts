import type {
  BowlingStyle,
  PlayerAttributes,
  PlayerRole,
} from '../types/player.types';
import { ROLE_WEIGHTS } from './player.config';
import { BOWLING_STYLE_WEIGHTS } from './bowling.config';

/** Module 0 chapter 15: batting overall weights (sum to 1). */
export const BATTING_OVERALL_WEIGHTS = {
  timing: 0.18,
  technique: 0.16,
  shotSelection: 0.15,
  placement: 0.14,
  footwork: 0.12,
  defence: 0.1,
  power: 0.08,
  consistency: 0.07,
} as const;
/** Module 0 chapter 15: physical overall weights (sum to 1). */
export const PHYSICAL_OVERALL_WEIGHTS = {
  stamina: 0.22,
  fitness: 0.2,
  reflex: 0.17,
  agility: 0.16,
  strength: 0.14,
  recovery: 0.11,
} as const;

const weighted = (
  values: object,
  weights: Readonly<Record<string, number>>,
): number =>
  Object.entries(weights).reduce(
    (sum, [key, weight]) =>
      sum + ((values as Record<string, number>)[key] ?? 0) * weight,
    0,
  );

/** Overalls are display/selection aids rounded to integers; they are never stored. */
export const battingOverall = (a: PlayerAttributes): number =>
  Math.round(weighted(a.batting, BATTING_OVERALL_WEIGHTS));
export const physicalOverall = (a: PlayerAttributes): number =>
  Math.round(weighted(a.physical, PHYSICAL_OVERALL_WEIGHTS));
/** Bowling overall uses the weights of the bowler's style; no style means no bowling rating. */
export const bowlingOverall = (
  a: PlayerAttributes,
  style: BowlingStyle | null | undefined,
): number =>
  style ? Math.round(weighted(a.bowling, BOWLING_STYLE_WEIGHTS[style])) : 0;
/** Role-weighted Player Overall (`ROLE_WEIGHTS`), drawn directly from the underlying stats. */
export function playerOverall(a: PlayerAttributes, role: PlayerRole): number {
  const sum = Object.entries(ROLE_WEIGHTS[role]).reduce(
    (total, [path, weight]) => {
      const [group, key] = path.split('.') as [
        'batting' | 'bowling' | 'physical',
        string,
      ];
      return (
        total +
        (a[group] as unknown as Record<string, number>)[key as string]! * weight
      );
    },
    0,
  );
  return Math.round(sum);
}
