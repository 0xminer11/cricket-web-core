import { clamp } from './vec';

/**
 * Bowling execution meter. A cursor sweeps back and forth; pressing BOWL freezes it. The nearer the
 * cursor is to the centre, the better the execution. The size of the "perfect" window comes from the
 * bowler's own Accuracy, Control and Consistency, so training those skills makes the mini-game
 * more forgiving. The score only feeds the engine as a bounded 0..1 input (0.5 is neutral): it can
 * shrink the error radius, never replace the bowler's skill.
 */
export const METER = {
  baseHalfWindow: 0.05,
  skillHalfWindow: 0.13,
  assistHalfBonus: 0.08,
  maxHalfWindow: 0.3,
  difficultyHalfPenalty: { low: 0, medium: 0.012, high: 0.025 },
  /** Seconds for one full left-to-right-to-left sweep. */
  period: { low: 1.9, medium: 1.5, high: 1.2 },
} as const;
export type Difficulty = keyof typeof METER.period;

export interface MeterSkills {
  readonly accuracy: number;
  readonly control: number;
  readonly consistency: number;
}

/** Half-width of the perfect window, in 0..0.5 meter units. */
export function executionWindow(
  skills: MeterSkills,
  difficulty: Difficulty,
  assist: boolean,
): number {
  const skill = (skills.accuracy + skills.control + skills.consistency) / 300;
  return clamp(
    METER.baseHalfWindow +
      METER.skillHalfWindow * clamp(skill) -
      METER.difficultyHalfPenalty[difficulty] +
      (assist ? METER.assistHalfBonus : 0),
    0.02,
    METER.maxHalfWindow,
  );
}

/** Triangle wave 0..1 over `period` seconds. Deterministic in elapsed time. */
export function meterCursor(elapsedSeconds: number, period: number): number {
  if (!(period > 0) || !Number.isFinite(elapsedSeconds)) return 0.5;
  const phase = (((elapsedSeconds / period) % 1) + 1) % 1;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

/** 1 inside the window, falling linearly to 0 at the ends of the meter. */
export function executionScore(cursor: number, halfWindow: number): number {
  const distance = Math.abs(clamp(cursor) - 0.5);
  if (distance <= halfWindow) return 1;
  return clamp(1 - (distance - halfWindow) / (0.5 - halfWindow));
}

/** Plain-language description of a frozen execution for the result line. */
export function executionLabel(score: number): string {
  return score >= 0.95
    ? 'Perfect timing'
    : score >= 0.7
      ? 'Good timing'
      : score >= 0.4
        ? 'Rushed'
        : 'Mistimed';
}
