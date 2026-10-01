import type { PlayerAttributes } from '../types/player.types';

/**
 * Every skill that can receive Skill XP, in "group.key" form (Module 0). Mirrors
 * `SKILL_STAT_KEYS` in the database package (a test keeps them identical). Reputation, fans,
 * form, selector interest and personality are deliberately NOT trainable.
 */
export const TRAINABLE_SKILL_KEYS = [
  'batting.timing',
  'batting.power',
  'batting.placement',
  'batting.defence',
  'batting.footwork',
  'batting.shotSelection',
  'batting.technique',
  'batting.consistency',
  'bowling.pace',
  'bowling.accuracy',
  'bowling.swing',
  'bowling.seam',
  'bowling.spin',
  'bowling.control',
  'bowling.variation',
  'bowling.consistency',
  'physical.fitness',
  'physical.stamina',
  'physical.strength',
  'physical.agility',
  'physical.reflex',
  'physical.recovery',
] as const;
export type TrainableSkillKey = (typeof TRAINABLE_SKILL_KEYS)[number];

export const isTrainableSkill = (key: string): key is TrainableSkillKey =>
  (TRAINABLE_SKILL_KEYS as readonly string[]).includes(key);

export const SKILL_LABELS: Readonly<Record<TrainableSkillKey, string>> = {
  'batting.timing': 'Timing',
  'batting.power': 'Power',
  'batting.placement': 'Placement',
  'batting.defence': 'Defence',
  'batting.footwork': 'Footwork',
  'batting.shotSelection': 'Shot selection',
  'batting.technique': 'Technique',
  'batting.consistency': 'Batting consistency',
  'bowling.pace': 'Pace',
  'bowling.accuracy': 'Accuracy',
  'bowling.swing': 'Swing',
  'bowling.seam': 'Seam',
  'bowling.spin': 'Spin',
  'bowling.control': 'Control',
  'bowling.variation': 'Variation',
  'bowling.consistency': 'Bowling consistency',
  'physical.fitness': 'Fitness',
  'physical.stamina': 'Stamina',
  'physical.strength': 'Strength',
  'physical.agility': 'Agility',
  'physical.reflex': 'Reflexes',
  'physical.recovery': 'Recovery',
};
export const skillLabel = (key: string): string =>
  (SKILL_LABELS as Readonly<Record<string, string>>)[key] ??
  key.split('.').pop() ??
  key;

/** What each skill does (docs/game-design/02-player-attributes.md), shown in the skill detail. */
export const SKILL_DESCRIPTIONS: Readonly<Record<TrainableSkillKey, string>> = {
  'batting.timing':
    'Widens your good and perfect shot windows and reduces mistimed shots.',
  'batting.power':
    'Raises how hard you can hit the ball safely. It does not rescue poor contact.',
  'batting.placement': 'Directional accuracy: finding gaps in the field.',
  'batting.defence': 'Control and wicket protection when you play defensively.',
  'batting.footwork':
    'Reduces the penalty for awkward lines and lengths and helps front/back-foot movement.',
  'batting.shotSelection':
    'Better outcomes when the shot you pick suits the delivery.',
  'batting.technique':
    'Baseline contact stability, especially for conventional shots.',
  'batting.consistency':
    'Less variation in how well you execute from ball to ball.',
  'bowling.pace': 'Velocity potential for pace and medium-pace bowlers.',
  'bowling.accuracy': 'Shrinks your target-point error: hitting your spot.',
  'bowling.swing': 'Movement in the air for eligible pace and medium bowlers.',
  'bowling.seam':
    'Movement off the pitch for eligible pace and medium bowlers.',
  'bowling.spin': 'Turn and revolutions for spin bowlers.',
  'bowling.control': 'Reduces penalties on line, length and variations.',
  'bowling.variation':
    'How effective and well disguised your non-stock deliveries are.',
  'bowling.consistency': 'Less delivery-to-delivery variation.',
  'physical.fitness': 'Holds your performance up under workload.',
  'physical.stamina': 'Slows fatigue build-up in matches and training.',
  'physical.strength': 'Adds to batting power and bowling endurance.',
  'physical.agility': 'Supports footwork and, later, running and fielding.',
  'physical.reflex': 'Helps your reaction window and, later, fielding.',
  'physical.recovery': 'How well you recover fatigue between activities.',
};

type Group = 'batting' | 'bowling' | 'physical';
/** Current value of a skill ("group.key") on a player's attributes, 0 when unknown. */
export function attributeValue(
  attributes: PlayerAttributes,
  key: string,
): number {
  const [group, name] = key.split('.') as [Group, string];
  const bag = attributes[group] as unknown as
    Readonly<Record<string, number>> | undefined;
  return bag?.[name] ?? 0;
}
export const skillGroup = (key: string): Group => key.split('.')[0] as Group;
/** Alias kept for Module 6 callers. */
export const statLabel = skillLabel;
