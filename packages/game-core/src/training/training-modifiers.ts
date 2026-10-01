import { TRAINING_RULES } from '../config/training.config';

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));
const unit = (stat: number) => clamp((stat - 1) / 99, 0, 1);

/** Skill/Player XP multiplier from fatigue (Module 0 guardrail). Drills are blocked at/above `blockedFatigue`. */
export function fatigueEfficiency(fatigue: number): number {
  const step = TRAINING_RULES.fatigueEfficiency.find((s) => fatigue < s.below);
  return step?.multiplier ?? 0;
}
export const isFatigueBlocked = (fatigue: number): boolean =>
  fatigue >= TRAINING_RULES.blockedFatigue;

/** Multiplier for the next drill given how many drills were completed so far today (UTC). */
export function dailyLoadMultiplier(sessionsToday: number): number {
  const next = sessionsToday + 1;
  const { fullEffectSessions, steps, floor } = TRAINING_RULES.dailyLoad;
  if (next <= fullEffectSessions) return 1;
  for (const s of steps) if (next <= s.upToSession) return s.multiplier;
  return floor;
}

/** Stamina lowers the fatigue a drill adds (1.0 at stamina 1 down to the floor at 100). */
export function staminaFatigueFactor(stamina: number): number {
  return 1 - (1 - TRAINING_RULES.staminaFatigueFloor) * unit(stamina);
}
/** Discipline nudges Skill XP by a few percent either way. */
export function disciplineMultiplier(discipline: number): number {
  const { min, max } = TRAINING_RULES.discipline;
  return min + (max - min) * unit(discipline);
}
/**
 * Optional performance score from a future training minigame (0..1). Absent means "no score" and
 * has no effect. Present, it scales XP between 0.8 and 1.2.
 */
export function performanceMultiplier(score: number | undefined): number {
  if (score === undefined || !Number.isFinite(score)) return 1;
  return 0.8 + 0.4 * clamp(score, 0, 1);
}
export const clampEffectiveness = (n: number): number =>
  clamp(
    n,
    TRAINING_RULES.effectivenessClamp.min,
    TRAINING_RULES.effectivenessClamp.max,
  );

/** Fatigue removed by a rest, given how many rests happened today and the Recovery stat. */
export function recoveryReduction(input: {
  readonly fatigue: number;
  readonly restsToday: number;
  readonly recoveryStat: number;
}): { readonly reduction: number; readonly multiplier: number } {
  const r = TRAINING_RULES.recovery;
  const next = input.restsToday + 1;
  let multiplier: number = r.floorMultiplier;
  if (next <= r.fullEffectRests) multiplier = 1;
  else
    for (const s of r.steps)
      if (next <= s.upToRest) {
        multiplier = s.multiplier;
        break;
      }
  const stat =
    r.statFactor.min +
    (r.statFactor.max - r.statFactor.min) * unit(input.recoveryStat);
  const raw = Math.round(r.baseFatigueReduction * multiplier * stat);
  const reduction = Math.min(input.fatigue, Math.max(r.minimumReduction, raw));
  return { reduction: Math.max(0, reduction), multiplier };
}
