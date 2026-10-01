import { clone } from '../state/clone';
import { BATTING_MODIFIER_LIMITS as LIMITS } from '@the-cricketer/game-core';
import type { MatchPlayerSnapshot } from '../state/types';
export const clamp = (n: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, n));
export const ratingToNormalized = (n: number): number => clamp(n / 100);
export const normalizedToRating = (n: number): number => clamp(n * 100, 1, 100);
export function calculateEffectiveMatchAttributes(
  player: MatchPlayerSnapshot,
): MatchPlayerSnapshot {
  const result = clone(player);
  const form =
    LIMITS.form[0] + (player.form / 100) * (LIMITS.form[1] - LIMITS.form[0]);
  const fitness =
    LIMITS.fitness[0] +
    (player.physical.fitness / 100) * (LIMITS.fitness[1] - LIMITS.fitness[0]);
  const fatigue = 1 - (player.fatigue / 100) * (1 - LIMITS.context[0]);
  for (const group of ['batting', 'bowling', 'physical'] as const) {
    const values = result[group] as unknown as Record<string, number>;
    for (const [key, base] of Object.entries(values)) {
      const bonus = clamp(
        player.equipmentModifiers[`${group}.${key}`] ?? 0,
        0,
        base * (LIMITS.equipment[1] - 1),
      );
      values[key] = clamp(
        (base + bonus) * form * fitness * fatigue,
        ...LIMITS.finalEffectiveSkill,
      );
    }
  }
  return result;
}
