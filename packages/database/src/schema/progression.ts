import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  createdAt,
  definitionIdIn,
  iff,
  nonNegative,
  ts,
  updatedAt,
} from './helpers';
import { playerProfiles } from './player';

/** Progress toward static `achievement.*` definitions (definitions stay in game-core). */
export const playerAchievements = pgTable(
  'player_achievements',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => playerProfiles.id, { onDelete: 'restrict' }),
    achievementDefinitionId: text('achievement_definition_id').notNull(),
    progress: bigint('progress', { mode: 'number' }).notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    completedAt: ts('completed_at'),
    rewardClaimed: boolean('reward_claimed').notNull().default(false),
    rewardClaimedAt: ts('reward_claimed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({
      name: 'player_achievements_pk',
      columns: [t.playerId, t.achievementDefinitionId],
    }),
    index('player_achievements_player_idx').on(t.playerId),
    check(
      'player_achievements_definition_check',
      definitionIdIn(t.achievementDefinitionId, 'achievement'),
    ),
    check('player_achievements_progress_check', nonNegative(t.progress)),
    check(
      'player_achievements_completed_at_check',
      iff(sql`${t.completed}`, sql`${t.completedAt} IS NOT NULL`),
    ),
    check(
      'player_achievements_claimed_check',
      iff(sql`${t.rewardClaimed}`, sql`${t.rewardClaimedAt} IS NOT NULL`),
    ),
    check(
      'player_achievements_claim_requires_completion_check',
      sql`NOT ${t.rewardClaimed} OR ${t.completed}`,
    ),
  ],
);

/**
 * One row per (player, onboarding step) once the player has seen or skipped it (Module 6 Career
 * Home intro). Deliberately separate from player attributes/state: it is UX state, not progression.
 */
export const playerOnboarding = pgTable(
  'player_onboarding',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => playerProfiles.id, { onDelete: 'cascade' }),
    step: text('step').notNull(),
    completedAt: ts('completed_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({
      name: 'player_onboarding_pk',
      columns: [t.playerId, t.step],
    }),
    check(
      'player_onboarding_step_check',
      sql`${t.step} ~ '^[a-z][a-z0-9_]{1,39}$'`,
    ),
  ],
);
