import { BOWLING_STYLE_WEIGHTS } from '../config/bowling.config';
import { TRAINING_RULES } from '../config/training.config';
import { PLAYER_CONFIG } from '../config/player.config';
import { TRAINABLE_SKILL_KEYS, isTrainableSkill } from './skills';
import {
  TRAINING_DEFINITIONS,
  REST_TRAINING_ID,
  bowlingSkillAllowed,
  isRecovery,
  minimumLevel,
} from './training-definitions';
import type { BowlingStyle } from '../types/player.types';

/** Static checks on the drill catalogue and the rules (called from validateGameDefinitions). */
export function validateTrainingConfig(): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const primary = new Set<string>();
  const styles = Object.keys(BOWLING_STYLE_WEIGHTS) as BowlingStyle[];
  for (const d of TRAINING_DEFINITIONS) {
    if (ids.has(d.id)) errors.push(`Duplicate training id ${d.id}`);
    ids.add(d.id);
    if (!/^training\.[a-z_]+\.[a-z_]+$/.test(d.id))
      errors.push(`${d.id}: malformed id`);
    if (!d.displayName || !d.description)
      errors.push(`${d.id}: missing name or description`);
    if (!Number.isInteger(d.version) || d.version < 1)
      errors.push(`${d.id}: bad version`);
    if (!Number.isInteger(d.playerXp) || d.playerXp < 0)
      errors.push(`${d.id}: bad player XP`);
    if (!Number.isInteger(d.cost.amount) || d.cost.amount < 0)
      errors.push(`${d.id}: bad cost`);
    if (d.cost.currency !== 'coins')
      errors.push(`${d.id}: training must not cost premium currency`);
    if (
      !Number.isInteger(d.fatigueGain) ||
      d.fatigueGain < 0 ||
      d.fatigueGain > 100
    )
      errors.push(`${d.id}: bad fatigue`);
    if (d.cooldownMatches !== 0)
      errors.push(
        `${d.id}: match cooldowns are not wired until the match module`,
      );
    if (minimumLevel(d) === null)
      errors.push(`${d.id}: unsupported prerequisite`);
    else if ((minimumLevel(d) ?? 1) > PLAYER_CONFIG.levelCap)
      errors.push(`${d.id}: minimum level above the cap`);
    if (isRecovery(d)) {
      if (d.grants.length || d.playerXp || d.fatigueGain)
        errors.push(`${d.id}: recovery must not grant XP or add fatigue`);
      continue;
    }
    if (!d.grants.length) errors.push(`${d.id}: a drill with no effect`);
    const seen = new Set<string>();
    for (const [i, g] of d.grants.entries()) {
      if (!isTrainableSkill(g.statKey))
        errors.push(`${d.id}: ${g.statKey} is not trainable`);
      if (!Number.isInteger(g.skillXp) || g.skillXp <= 0)
        errors.push(`${d.id}: bad XP for ${g.statKey}`);
      if (seen.has(g.statKey))
        errors.push(`${d.id}: duplicate skill ${g.statKey}`);
      seen.add(g.statKey);
      if (i === 0) primary.add(g.statKey);
    }
    if (
      d.grants[0] &&
      d.grants.slice(1).some((g) => g.skillXp > d.grants[0]!.skillXp)
    )
      errors.push(`${d.id}: first grant must be the primary skill`);
    if (
      !styles.some((s) =>
        d.grants.every((g) => bowlingSkillAllowed(g.statKey, s)),
      )
    )
      errors.push(`${d.id}: no bowling style can use this drill`);
  }
  for (const key of TRAINABLE_SKILL_KEYS)
    if (!primary.has(key))
      errors.push(`No drill trains ${key} as its primary skill`);
  if (!ids.has(REST_TRAINING_ID)) errors.push('The rest action is missing');
  const r = TRAINING_RULES;
  const nonIncreasing = (xs: readonly number[]) =>
    xs.every((v, i) => i === 0 || v <= xs[i - 1]!);
  if (!nonIncreasing(r.fatigueEfficiency.map((s) => s.multiplier)))
    errors.push('Fatigue efficiency must not increase with fatigue');
  if (r.blockedFatigue <= r.fatigueEfficiency.at(-1)!.below - 1)
    errors.push('Blocked fatigue must be above the last efficiency band');
  if (r.recovery.minimumReduction < 1)
    errors.push('A rest must always recover something');
  if (!(r.dailyLoad.floor > 0 && r.recovery.floorMultiplier > 0))
    errors.push('Load and recovery floors must stay above zero (no lock-outs)');
  return errors;
}
