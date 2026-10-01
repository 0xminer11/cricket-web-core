import { BOWLING_STYLE_WEIGHTS } from '../config/bowling.config';
import { TRAINING_DEFINITIONS } from '../config/training.config';
import type {
  TrainingCategory,
  TrainingDefinition,
} from '../types/training.types';
import type { BowlingStyle } from '../types/player.types';

export { TRAINING_DEFINITIONS };
export const TRAINING_BY_ID: ReadonlyMap<string, TrainingDefinition> = new Map(
  TRAINING_DEFINITIONS.map((d) => [d.id, d]),
);
export const TRAINING_CATEGORIES: readonly TrainingCategory[] = [
  'batting',
  'bowling',
  'physical',
];
export const TRAINING_CATEGORY_NAMES: Readonly<
  Record<TrainingCategory, string>
> = {
  batting: 'Batting',
  bowling: 'Bowling',
  physical: 'Physical',
};
export const REST_TRAINING_ID = 'training.physical.rest';

export const isRecovery = (d: TrainingDefinition): boolean =>
  d.kind === 'recovery';

/**
 * Minimum player level from the Module 0 `playerLevel>=N` prerequisite. `null` means a
 * prerequisite this build cannot evaluate; such a drill is unavailable rather than silently open.
 */
export function minimumLevel(d: TrainingDefinition): number | null {
  let needed = 1;
  for (const p of d.prerequisites) {
    const m = /^playerLevel>=(\d+)$/.exec(p);
    if (!m) return null;
    needed = Math.max(needed, Number(m[1]));
  }
  return needed;
}

const STYLE_IDS = Object.keys(BOWLING_STYLE_WEIGHTS) as BowlingStyle[];
/**
 * Whether a bowling skill is trainable for a bowling style, derived from the Module 0 style
 * weights (a skill a style has zero weight for - Spin for a fast bowler, Pace for a spinner - is
 * not trainable). A player with no bowling style may only train skills every style uses
 * (accuracy, control, variation, consistency).
 */
export function bowlingSkillAllowed(
  skillKey: string,
  style: BowlingStyle | null,
): boolean {
  if (!skillKey.startsWith('bowling.')) return true;
  const name = skillKey.slice('bowling.'.length);
  const weight = (s: BowlingStyle) =>
    (BOWLING_STYLE_WEIGHTS[s] as Readonly<Record<string, number>>)[name] ?? 0;
  return style ? weight(style) > 0 : STYLE_IDS.every((s) => weight(s) > 0);
}

export const drillsByCategory = (
  category: TrainingCategory,
): readonly TrainingDefinition[] =>
  TRAINING_DEFINITIONS.filter((d) => d.category === category);
