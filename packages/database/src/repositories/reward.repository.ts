import { and, eq } from 'drizzle-orm';
import { GAME_BALANCE_VERSION } from '@the-cricketer/game-core';
import type { Executor } from '../connection';
import type {
  AcquisitionSource,
  RewardSourceType,
  SkillStatKey,
  WalletTransactionType,
} from '../enums';
import { IdempotencyConflictError, InvalidInputError } from '../errors';
import type { RewardGrantRecord } from '../records';
import { rewardGrants } from '../schema/index';
import type { CareerRepository } from './career.repository';
import type { InventoryRepository } from './inventory.repository';
import type { PlayerRepository } from './player.repository';
import { assertSafeInt, assertUuid, Repository, requireRow } from './shared';
import type { WalletRepository } from './wallet.repository';

/** A fully computed reward. Persistence applies it; it never decides amounts. */
export interface RewardPayload {
  readonly coins?: number;
  readonly gems?: number;
  readonly playerXp?: number;
  readonly fans?: number;
  readonly reputation?: number;
  readonly selectorInterest?: number;
  readonly skillXp?: readonly {
    readonly statKey: SkillStatKey;
    readonly amount: number;
  }[];
  readonly items?: readonly { readonly itemDefinitionId: string }[];
}

export interface GrantRewardInput {
  readonly playerId: string;
  readonly sourceType: RewardSourceType;
  /** The thing that earned it (match id, achievement id, ...). One grant per player + source. */
  readonly sourceId: string;
  readonly rewardDefinitionId?: string;
  readonly idempotencyKey: string;
  readonly payload: RewardPayload;
}

const WALLET_TYPE_BY_SOURCE: Readonly<
  Partial<Record<RewardSourceType, WalletTransactionType>>
> = {
  match: 'match_reward',
  achievement: 'achievement_reward',
  career_event: 'career_event_reward',
  contract: 'contract_payment',
  sponsorship: 'sponsor_payout',
  starter: 'starter_grant',
  admin: 'admin_adjustment',
};
const ITEM_SOURCE_BY_SOURCE: Readonly<
  Record<RewardSourceType, AcquisitionSource>
> = {
  match: 'reward',
  achievement: 'achievement',
  career_event: 'reward',
  contract: 'contract',
  sponsorship: 'sponsor',
  training: 'reward',
  starter: 'starter',
  admin: 'admin_grant',
};

const toGrant = (row: typeof rewardGrants.$inferSelect): RewardGrantRecord => ({
  id: row.id,
  playerId: row.playerId,
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  rewardDefinitionId: row.rewardDefinitionId,
  status: row.status,
  idempotencyKey: row.idempotencyKey,
  payloadSnapshot: row.payloadSnapshot,
  gameBalanceVersion: row.gameBalanceVersion,
  grantedAt: row.grantedAt,
});

/**
 * Applies a reward at most once per (player, source). The reward_grants insert is the gate:
 * a duplicate request hits ON CONFLICT DO NOTHING and applies nothing, so coins, XP and items are
 * never duplicated. Every effect runs in the caller's transaction (or a savepoint/new one).
 */
export interface RewardDependencies {
  readonly wallet: WalletRepository;
  readonly players: PlayerRepository;
  readonly careers: CareerRepository;
  readonly inventory: InventoryRepository;
}

export class RewardRepository extends Repository {
  /**
   * `bind` builds the sibling repositories on a given executor. grantOnce calls it with its own
   * transaction so every effect shares one connection and one atomic unit of work; using the
   * outer executor here would commit effects on a separate connection and defeat rollback.
   */
  constructor(
    private readonly db: Executor,
    private readonly bind: (executor: Executor) => RewardDependencies,
  ) {
    super();
  }

  grantOnce(
    input: GrantRewardInput,
  ): Promise<{ granted: boolean; grant: RewardGrantRecord }> {
    return this.run(async () => {
      assertUuid(input.playerId, 'playerId');
      const { payload } = input;
      for (const [k, v] of Object.entries({
        coins: payload.coins,
        gems: payload.gems,
        playerXp: payload.playerXp,
      }))
        if (v !== undefined) assertSafeInt(v, k);
      if (
        (payload.coins || payload.gems) &&
        !WALLET_TYPE_BY_SOURCE[input.sourceType]
      )
        throw new InvalidInputError(
          `Source ${input.sourceType} cannot pay currency`,
        );

      return this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(rewardGrants)
          .values({
            playerId: input.playerId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            ...(input.rewardDefinitionId
              ? { rewardDefinitionId: input.rewardDefinitionId }
              : {}),
            idempotencyKey: input.idempotencyKey,
            payloadSnapshot: { ...payload },
            gameBalanceVersion: GAME_BALANCE_VERSION,
          })
          .onConflictDoNothing()
          .returning();
        if (!inserted[0]) {
          const existing = await tx
            .select()
            .from(rewardGrants)
            .where(
              and(
                eq(rewardGrants.playerId, input.playerId),
                eq(rewardGrants.sourceType, input.sourceType),
                eq(rewardGrants.sourceId, input.sourceId),
              ),
            );
          // Same key reused for a different source is a caller bug, not a replay.
          if (!existing[0]) throw new IdempotencyConflictError();
          return { granted: false, grant: toGrant(existing[0]) };
        }

        const grant = toGrant(requireRow(inserted, 'Reward grant'));
        const reference = { type: input.sourceType, id: input.sourceId };
        const walletType = WALLET_TYPE_BY_SOURCE[input.sourceType];
        const { wallet, players, careers, inventory } = this.bind(tx);
        if (payload.coins && walletType)
          await wallet.credit({
            playerId: input.playerId,
            currency: 'coins',
            amount: payload.coins,
            type: walletType,
            reference,
            idempotencyKey: `${input.idempotencyKey}:coins`,
          });
        if (payload.gems && walletType)
          await wallet.credit({
            playerId: input.playerId,
            currency: 'gems',
            amount: payload.gems,
            type: walletType,
            reference,
            idempotencyKey: `${input.idempotencyKey}:gems`,
          });
        if (payload.playerXp)
          await players.awardXp(input.playerId, payload.playerXp);
        for (const skill of payload.skillXp ?? [])
          await players.addSkillXp(input.playerId, skill.statKey, skill.amount);
        if (payload.fans || payload.reputation || payload.selectorInterest) {
          const careerId = await careers.requireActiveCareerId(input.playerId);
          await careers.applyProgressDelta(careerId, {
            ...(payload.fans ? { fans: payload.fans } : {}),
            ...(payload.reputation ? { reputation: payload.reputation } : {}),
            ...(payload.selectorInterest
              ? { selectorInterest: payload.selectorInterest }
              : {}),
          });
        }
        for (const [index, item] of (payload.items ?? []).entries())
          await inventory.grantItem({
            playerId: input.playerId,
            itemDefinitionId: item.itemDefinitionId,
            source: ITEM_SOURCE_BY_SOURCE[input.sourceType],
            idempotencyKey: `${input.idempotencyKey}:item:${index}`,
            metadata: { rewardGrantId: grant.id },
          });
        return { granted: true, grant };
      });
    });
  }

  getGrant(
    playerId: string,
    sourceType: RewardSourceType,
    sourceId: string,
  ): Promise<RewardGrantRecord | null> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(rewardGrants)
        .where(
          and(
            eq(rewardGrants.playerId, playerId),
            eq(rewardGrants.sourceType, sourceType),
            eq(rewardGrants.sourceId, sourceId),
          ),
        );
      return rows[0] ? toGrant(rows[0]) : null;
    });
  }
}
