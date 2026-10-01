import { PLAYER_CONFIG, skillXpToNextPoint } from '../config/player.config';

export const MAX_SKILL_VALUE = PLAYER_CONFIG.statMax;

/**
 * Skill XP needed to raise a skill from `value` to `value + 1`, or null at the cap. This is the one
 * place the curve is read: `skillXpToNextPoint` (Module 0, quadratic, so high skills need much more
 * XP and diminishing returns happen by construction). Server and client both use this function.
 */
export function getSkillXpRequired(value: number): number | null {
  return value >= MAX_SKILL_VALUE ? null : skillXpToNextPoint(value);
}

export interface SkillProgressView {
  readonly value: number;
  /** XP already earned toward the next point (0 at the cap). */
  readonly xp: number;
  /** null when maxed */
  readonly xpToNext: number | null;
  readonly maxed: boolean;
}
export function skillProgressState(
  value: number,
  xp: number,
): SkillProgressView {
  const maxed = value >= MAX_SKILL_VALUE;
  return {
    value,
    xp: maxed ? 0 : Math.max(0, Math.floor(xp)),
    xpToNext: getSkillXpRequired(value),
    maxed,
  };
}

export interface SkillXpApplication {
  readonly valueBefore: number;
  readonly valueAfter: number;
  readonly xpBefore: number;
  readonly xpAfter: number;
  /** XP actually credited (0 when the skill is already maxed). */
  readonly xpApplied: number;
  readonly pointsGained: number;
  readonly maxed: boolean;
}

/**
 * Add Skill XP to a skill: cross thresholds as many times as the XP allows (carrying the
 * remainder), never past the cap, and never credit XP to a maxed skill.
 */
export function applySkillXp(
  value: number,
  xp: number,
  gain: number,
): SkillXpApplication {
  const startXp = Math.max(0, Math.floor(xp));
  if (value >= MAX_SKILL_VALUE || gain <= 0)
    return {
      valueBefore: value,
      valueAfter: value,
      xpBefore: value >= MAX_SKILL_VALUE ? 0 : startXp,
      xpAfter: value >= MAX_SKILL_VALUE ? 0 : startXp,
      xpApplied: 0,
      pointsGained: 0,
      maxed: value >= MAX_SKILL_VALUE,
    };
  let v = value;
  let remaining = startXp + Math.floor(gain);
  let need = getSkillXpRequired(v);
  while (need !== null && remaining >= need) {
    remaining -= need;
    v += 1;
    need = getSkillXpRequired(v);
  }
  const maxed = v >= MAX_SKILL_VALUE;
  return {
    valueBefore: value,
    valueAfter: v,
    xpBefore: startXp,
    xpAfter: maxed ? 0 : remaining,
    xpApplied: Math.floor(gain),
    pointsGained: v - value,
    maxed,
  };
}
