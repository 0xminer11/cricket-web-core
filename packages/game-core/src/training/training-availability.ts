import { TRAINING_RULES } from '../config/training.config';
import type { TrainingDefinition } from '../types/training.types';
import type {
  BowlingStyle,
  PlayerAttributes,
  PlayerRole,
} from '../types/player.types';
import { attributeValue } from './skills';
import { MAX_SKILL_VALUE } from './skill-xp';
import {
  bowlingSkillAllowed,
  isRecovery,
  minimumLevel,
} from './training-definitions';
import { isFatigueBlocked } from './training-modifiers';

export type TrainingUnavailableReason =
  | 'locked_level'
  | 'locked_role'
  | 'locked_style'
  | 'cooldown'
  | 'maxed_skill'
  | 'blocked_fatigue'
  | 'already_fresh'
  | 'insufficient_coins'
  | 'unsupported_requirement';

/** Everything the pure engine needs to know about a player (a snapshot, never a database row). */
export interface TrainingPlayerSnapshot {
  readonly level: number;
  /** Player XP toward the next level. */
  readonly xp: number;
  readonly role: PlayerRole;
  readonly bowlingStyle: BowlingStyle | null;
  readonly attributes: PlayerAttributes;
  /** Skill XP toward the next point, by "group.key" (sparse: missing means 0). */
  readonly skillXp: Readonly<Record<string, number>>;
  readonly fatigue: number;
  readonly coins: number;
  /** Drills completed today (UTC), excluding rests. */
  readonly sessionsToday: number;
  /** Rests taken today (UTC). */
  readonly restsToday: number;
  /** Career matches since this drill was last completed; null when never. Only used for cooldowns. */
  readonly matchesSinceLast?: number | null;
}

export interface Availability {
  readonly available: boolean;
  readonly reason?: TrainingUnavailableReason;
  /** Human-usable specifics for the reason (required level, coins, fatigue ...). */
  readonly detail?: {
    readonly requiredLevel?: number;
    readonly requiredCoins?: number;
    readonly haveCoins?: number;
    readonly fatigue?: number;
    readonly matchesRemaining?: number;
  };
}

/**
 * Why a drill can or cannot be done right now. Order of checks is the order a player would want to
 * hear about them: what they can't change yet (level, role, style), then what they can (fatigue,
 * coins). Rest is never blocked by fatigue; it is only "not needed" at zero fatigue.
 */
export function trainingAvailability(
  player: TrainingPlayerSnapshot,
  training: TrainingDefinition,
): Availability {
  const need = minimumLevel(training);
  if (need === null)
    return { available: false, reason: 'unsupported_requirement' };
  if (player.level < need)
    return {
      available: false,
      reason: 'locked_level',
      detail: { requiredLevel: need },
    };
  if (
    training.requiredRoles?.length &&
    !training.requiredRoles.includes(player.role)
  )
    return { available: false, reason: 'locked_role' };
  if (
    !training.grants.every((g) =>
      bowlingSkillAllowed(g.statKey, player.bowlingStyle),
    )
  )
    return { available: false, reason: 'locked_style' };
  if (training.cooldownMatches > 0 && player.matchesSinceLast != null) {
    const remaining = training.cooldownMatches - player.matchesSinceLast;
    if (remaining > 0)
      return {
        available: false,
        reason: 'cooldown',
        detail: { matchesRemaining: remaining },
      };
  }
  if (isRecovery(training)) {
    return player.fatigue <= 0
      ? {
          available: false,
          reason: 'already_fresh',
          detail: { fatigue: player.fatigue },
        }
      : { available: true };
  }
  if (
    training.grants.length > 0 &&
    training.grants.every(
      (g) => attributeValue(player.attributes, g.statKey) >= MAX_SKILL_VALUE,
    )
  )
    return { available: false, reason: 'maxed_skill' };
  if (isFatigueBlocked(player.fatigue))
    return {
      available: false,
      reason: 'blocked_fatigue',
      detail: { fatigue: player.fatigue },
    };
  if (training.cost.amount > player.coins)
    return {
      available: false,
      reason: 'insufficient_coins',
      detail: { requiredCoins: training.cost.amount, haveCoins: player.coins },
    };
  return { available: true };
}

export const FATIGUE_WARNING_FROM = TRAINING_RULES.fatigueEfficiency[0].below;
