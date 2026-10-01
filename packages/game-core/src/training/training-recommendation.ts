import { PLAYER_CONFIG, ROLE_WEIGHTS } from '../config/player.config';
import { TRAINING_RULES } from '../config/training.config';
import { attributeValue, skillLabel } from './skills';
import { MAX_SKILL_VALUE, getSkillXpRequired } from './skill-xp';
import { trainingAvailability } from './training-availability';
import type { TrainingPlayerSnapshot } from './training-availability';
import {
  REST_TRAINING_ID,
  TRAINING_DEFINITIONS,
  isRecovery,
} from './training-definitions';

export type RecommendationReason =
  'weakest_role_skill' | 'close_to_next_point' | 'recover_first' | 'no_options';

export interface TrainingRecommendation {
  readonly trainingId: string;
  readonly reason: RecommendationReason;
  /** The skill that decided it (absent for rest). */
  readonly statKey?: string;
  readonly statLabel?: string;
  readonly statValue?: number;
  /** Module 0 role weight of that skill. */
  readonly roleWeight?: number;
  /** Plain-language, data-driven explanation (never "AI" wording). */
  readonly explanation: string;
  /** Next best options, best first. */
  readonly alternatives: readonly string[];
}

/**
 * Deterministic, explainable recommendation.
 *
 *   priority(drill) = sum over its skills of
 *       (skill's share of the drill's XP) x (Module 0 role weight of the skill) x (100 - value)/99
 *       x 1.15 if the skill is within 30% of its next point
 *
 * Only drills the player can do right now are considered. If fatigue is in the "strongly reduced"
 * range (or nothing else is available) the answer is to rest. Ties go to the drill id so the same
 * player always gets the same answer.
 */
export function recommendTraining(
  player: TrainingPlayerSnapshot,
): TrainingRecommendation | null {
  const rules = TRAINING_RULES.recommendation;
  const rest = REST_TRAINING_ID;
  const restOk = trainingAvailability(
    player,
    TRAINING_DEFINITIONS.find((d) => d.id === rest) ?? TRAINING_DEFINITIONS[0]!,
  ).available;
  if (player.fatigue >= rules.restFromFatigue && restOk)
    return {
      trainingId: rest,
      reason: 'recover_first',
      explanation:
        'Your fatigue is high, so drills would be much less effective right now. Rest first.',
      alternatives: [],
    };

  const weights = ROLE_WEIGHTS[player.role];
  const scored = TRAINING_DEFINITIONS.filter(
    (d) => !isRecovery(d) && trainingAvailability(player, d).available,
  )
    .map((d) => {
      const total = d.grants.reduce((a, g) => a + g.skillXp, 0) || 1;
      let score = 0;
      let top: {
        key: string;
        part: number;
        value: number;
        weight: number;
      } | null = null;
      let near = false;
      for (const g of d.grants) {
        const value = attributeValue(player.attributes, g.statKey);
        if (value >= MAX_SKILL_VALUE) continue;
        const weight = weights[g.statKey] ?? rules.nonRoleWeight;
        const need = getSkillXpRequired(value) ?? 1;
        const closeness = (player.skillXp[g.statKey] ?? 0) / need;
        const isNear = closeness >= rules.nearPointShare;
        const part =
          (g.skillXp / total) *
          weight *
          ((PLAYER_CONFIG.statMax - value) / (PLAYER_CONFIG.statMax - 1)) *
          (isNear ? rules.nearPointBoost : 1);
        score += part;
        if (!top || part > top.part) {
          top = { key: g.statKey, part, value, weight };
          near = isNear;
        }
      }
      return { d, score, top, near };
    })
    .filter((x) => x.top)
    .sort((a, b) => b.score - a.score || a.d.id.localeCompare(b.d.id));

  const best = scored[0];
  if (!best || !best.top) {
    return restOk
      ? {
          trainingId: rest,
          reason: 'no_options',
          explanation:
            'No drill is available right now. A rest will freshen you up.',
          alternatives: [],
        }
      : null;
  }
  const { key, value, weight } = best.top;
  return {
    trainingId: best.d.id,
    reason: best.near ? 'close_to_next_point' : 'weakest_role_skill',
    statKey: key,
    statLabel: skillLabel(key),
    statValue: value,
    roleWeight: weight,
    explanation: best.near
      ? `${skillLabel(key)} (${value}) is close to its next point and matters for your role.`
      : `${skillLabel(key)} (${value}) is one of the skills your role relies on most and has the most room to grow.`,
    alternatives: scored.slice(1, 4).map((x) => x.d.id),
  };
}
