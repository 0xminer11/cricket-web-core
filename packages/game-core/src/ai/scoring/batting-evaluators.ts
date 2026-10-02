import { AI_TUNING } from '../config/tuning';
import type { ShotDefinition } from '../../types/index';
import type { AIMatchMemory } from '../memory/memory';
import type { BattingTemperament } from '../personality/personality';
import type { AIBatterView, BattingMode } from '../types';

const T = AI_TUNING.batting;

/** How well a shot's category plays to the batter's own strengths relative to their average: roughly -0.3..+0.3. */
export function strengthAffinity(
  shot: Pick<ShotDefinition, 'category'>,
  batter: Pick<AIBatterView, 'batting'>,
): number {
  const weights = T.strengthAffinity[shot.category];
  if (!weights) return 0;
  const a = batter.batting as unknown as Record<string, number>;
  const values = Object.values(a);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  let total = 0;
  for (const [key, w] of Object.entries(weights))
    total += w * ((a[key] ?? mean) - mean);
  return total / 50;
}

/** Risk-takers like risky shots, cautious batters do not (Module 0 Risk Appetite). */
export function personalityAffinity(
  shot: Pick<ShotDefinition, 'risk' | 'category'>,
  temperament: BattingTemperament,
): number {
  const risk = shot.risk - 0.32;
  return (
    temperament.riskTilt * risk * 1.4 +
    temperament.confidenceTilt * 0.25 * (shot.category === 'lofted' ? 0.4 : shot.category === 'defensive' ? -0.3 : 0.1)
  );
}

/** A shot type that has been working for this batter in this match is slightly more attractive; one that has not, less. */
export function memoryAffinity(
  shot: Pick<ShotDefinition, 'category'>,
  memory: AIMatchMemory,
  confidenceScale: number,
): number {
  const success = memory.shotSuccess[shot.category];
  if (success === undefined) return 0;
  return success * confidenceScale;
}

export function modeAffinity(
  shot: Pick<ShotDefinition, 'category'>,
  mode: BattingMode,
): number {
  return T.modeAffinity[mode][shot.category as 'defensive'] ?? 0;
}
