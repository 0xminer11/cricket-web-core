import { and, eq, sql } from 'drizzle-orm';
import type { Executor } from '../connection';
import type { AchievementRecord } from '../records';
import { playerAchievements } from '../schema/index';
import type { RepositoryContext } from './shared';
import { assertSafeInt, assertUuid, Repository, requireRow } from './shared';

const toAchievement = (
  row: typeof playerAchievements.$inferSelect,
): AchievementRecord => ({
  playerId: row.playerId,
  achievementDefinitionId: row.achievementDefinitionId,
  progress: row.progress,
  completed: row.completed,
  completedAt: row.completedAt,
  rewardClaimed: row.rewardClaimed,
  rewardClaimedAt: row.rewardClaimedAt,
});

/**
 * Progress + completion bookkeeping. Thresholds live in the static definitions; the reward
 * itself is paid through RewardRepository (one grant per player+achievement).
 */
export class AchievementRepository extends Repository {
  constructor(
    private readonly db: Executor,
    private readonly ctx: RepositoryContext,
  ) {
    super();
  }

  list(playerId: string): Promise<readonly AchievementRecord[]> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const rows = await this.db
        .select()
        .from(playerAchievements)
        .where(eq(playerAchievements.playerId, playerId))
        .orderBy(playerAchievements.achievementDefinitionId);
      return rows.map(toAchievement);
    });
  }

  get(
    playerId: string,
    achievementDefinitionId: string,
  ): Promise<AchievementRecord | null> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(playerAchievements)
        .where(
          and(
            eq(playerAchievements.playerId, playerId),
            eq(
              playerAchievements.achievementDefinitionId,
              achievementDefinitionId,
            ),
          ),
        );
      return rows[0] ? toAchievement(rows[0]) : null;
    });
  }

  /** Create the tracking row if missing (unique per player + definition). Safe to repeat. */
  ensure(
    playerId: string,
    achievementDefinitionId: string,
  ): Promise<AchievementRecord> {
    return this.run(async () => {
      this.ctx.catalog.achievement(achievementDefinitionId);
      await this.db
        .insert(playerAchievements)
        .values({ playerId, achievementDefinitionId })
        .onConflictDoNothing();
      const rows = await this.db
        .select()
        .from(playerAchievements)
        .where(
          and(
            eq(playerAchievements.playerId, playerId),
            eq(
              playerAchievements.achievementDefinitionId,
              achievementDefinitionId,
            ),
          ),
        );
      return toAchievement(requireRow(rows, 'Achievement'));
    });
  }

  /** Atomic upsert-increment; concurrent increments add up. */
  incrementProgress(
    playerId: string,
    achievementDefinitionId: string,
    delta: number,
  ): Promise<AchievementRecord> {
    return this.run(async () => {
      this.ctx.catalog.achievement(achievementDefinitionId);
      assertSafeInt(delta, 'delta', { min: 1 });
      const rows = await this.db
        .insert(playerAchievements)
        .values({ playerId, achievementDefinitionId, progress: delta })
        .onConflictDoUpdate({
          target: [
            playerAchievements.playerId,
            playerAchievements.achievementDefinitionId,
          ],
          set: { progress: sql`${playerAchievements.progress} + ${delta}` },
        })
        .returning();
      return toAchievement(requireRow(rows, 'Achievement'));
    });
  }

  /** Returns true only for the call that flipped completed false -> true. */
  markCompleted(
    playerId: string,
    achievementDefinitionId: string,
  ): Promise<boolean> {
    return this.run(async () => {
      this.ctx.catalog.achievement(achievementDefinitionId);
      await this.db
        .insert(playerAchievements)
        .values({ playerId, achievementDefinitionId })
        .onConflictDoNothing();
      const rows = await this.db
        .update(playerAchievements)
        .set({ completed: true, completedAt: this.ctx.clock.now() })
        .where(
          and(
            eq(playerAchievements.playerId, playerId),
            eq(
              playerAchievements.achievementDefinitionId,
              achievementDefinitionId,
            ),
            eq(playerAchievements.completed, false),
          ),
        )
        .returning({ id: playerAchievements.playerId });
      return rows.length > 0;
    });
  }

  /** Returns true only for the call that flipped reward_claimed false -> true (requires completed). */
  markRewardClaimed(
    playerId: string,
    achievementDefinitionId: string,
  ): Promise<boolean> {
    return this.run(async () => {
      const rows = await this.db
        .update(playerAchievements)
        .set({ rewardClaimed: true, rewardClaimedAt: this.ctx.clock.now() })
        .where(
          and(
            eq(playerAchievements.playerId, playerId),
            eq(
              playerAchievements.achievementDefinitionId,
              achievementDefinitionId,
            ),
            eq(playerAchievements.completed, true),
            eq(playerAchievements.rewardClaimed, false),
          ),
        )
        .returning({ id: playerAchievements.playerId });
      return rows.length > 0;
    });
  }
}
