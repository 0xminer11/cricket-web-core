import { PLAYER_CONFIG, xpToNextLevel } from '../config/player.config';

export interface LevelChange {
  readonly from: number;
  readonly to: number;
}
export interface PlayerXpApplication {
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly xpBefore: number;
  readonly xpAfter: number;
  /** XP actually credited: 0 at the level cap. */
  readonly gained: number;
  /** XP needed for the next level, null at the cap. */
  readonly xpToNext: number | null;
  readonly maxed: boolean;
  readonly levelChanges: readonly LevelChange[];
}

/**
 * Add Player XP (Module 0 curve `xpToNextLevel`): handles zero, one or many level-ups in a single
 * call, carries the remainder, and stops at the level cap (XP at the cap is not credited). Pure;
 * every module that grants Player XP should use this rather than re-deriving the loop.
 */
export function applyPlayerXp(input: {
  readonly level: number;
  readonly xp: number;
  readonly gain: number;
}): PlayerXpApplication {
  const cap = PLAYER_CONFIG.levelCap;
  const xpBefore = Math.max(0, Math.floor(input.xp));
  if (input.level >= cap || input.gain <= 0)
    return {
      levelBefore: input.level,
      levelAfter: input.level,
      xpBefore,
      xpAfter: input.level >= cap ? 0 : xpBefore,
      gained: 0,
      xpToNext: input.level >= cap ? null : xpToNextLevel(input.level),
      maxed: input.level >= cap,
      levelChanges: [],
    };
  let level = input.level;
  let xp = xpBefore + Math.floor(input.gain);
  const changes: LevelChange[] = [];
  while (level < cap && xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    changes.push({ from: level, to: level + 1 });
    level += 1;
  }
  const maxed = level >= cap;
  return {
    levelBefore: input.level,
    levelAfter: level,
    xpBefore,
    xpAfter: maxed ? 0 : xp,
    gained: Math.floor(input.gain),
    xpToNext: maxed ? null : xpToNextLevel(level),
    maxed,
    levelChanges: changes,
  };
}
