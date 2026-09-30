import type { CareerTierId, PlayerAttributes } from '@the-cricketer/game-core';
import type { Database } from './connection';
import type {
  CareerRecord,
  InventoryItemRecord,
  PlayerAppearanceRecord,
  PlayerProfileRecord,
  PlayerStateRecord,
  WalletBalanceRecord,
} from './records';
import type {
  CreatePlayerAppearanceInput,
  CreatePlayerProfileInput,
} from './repositories/player.repository';
import type { Repositories } from './repositories/index';

/**
 * Everything a brand-new cricketer needs, supplied as already-decided values. Choosing the
 * archetype, starter kit and starting funds is the character-creator module's job (Module 4+);
 * this only persists them atomically.
 */
export interface PlayerFoundationInput {
  /** Existing users row (Module 3 owns account creation). */
  readonly userId: string;
  readonly profile: Omit<CreatePlayerProfileInput, 'userId'>;
  readonly appearance: CreatePlayerAppearanceInput;
  readonly attributes: PlayerAttributes;
  readonly level?: number;
  readonly currentXp?: number;
  readonly career: {
    readonly tier: CareerTierId;
    readonly teamDefinitionId?: string;
  };
  readonly startingBalances: { readonly coins: number; readonly gems: number };
  readonly starterItems: readonly {
    readonly itemDefinitionId: string;
    readonly equip?: boolean;
  }[];
  readonly starterAchievementIds?: readonly string[];
  /** Namespaces idempotency keys for ledger/inventory rows; defaults to `starter:<userId>`. */
  readonly idempotencyPrefix?: string;
}

export interface PlayerFoundation {
  readonly profile: PlayerProfileRecord;
  readonly appearance: PlayerAppearanceRecord;
  readonly state: PlayerStateRecord;
  readonly career: CareerRecord;
  readonly balances: readonly WalletBalanceRecord[];
  readonly items: readonly InventoryItemRecord[];
}

/**
 * Create profile, appearance, attributes, personality, state, wallets (with starter-grant ledger
 * entries), career (+history), team membership, starter inventory/equipment and achievement rows.
 * `repos` MUST be bound to a transaction (see createPlayerFoundationAtomic) so a failure at any
 * step leaves no partial player behind.
 */
export async function createPlayerFoundationIn(
  repos: Repositories,
  input: PlayerFoundationInput,
): Promise<PlayerFoundation> {
  const prefix = input.idempotencyPrefix ?? `starter:${input.userId}`;
  const profile = await repos.players.create({
    userId: input.userId,
    ...input.profile,
  });
  const appearance = await repos.players.createAppearance(
    profile.id,
    input.appearance,
  );
  await repos.players.createAttributes(profile.id, input.attributes);
  const state = await repos.players.createState(profile.id, {
    ...(input.level !== undefined ? { level: input.level } : {}),
    ...(input.currentXp !== undefined ? { currentXp: input.currentXp } : {}),
  });
  await repos.players.applyStatsDelta(profile.id, {}); // empty all-time stats row

  await repos.wallet.ensureBalances(profile.id);
  const reference = { type: 'starter', id: profile.id };
  for (const currency of ['coins', 'gems'] as const) {
    const amount = input.startingBalances[currency];
    if (amount > 0)
      await repos.wallet.credit({
        playerId: profile.id,
        currency,
        amount,
        type: 'starter_grant',
        reference,
        idempotencyKey: `${prefix}:${currency}`,
      });
  }

  let teamId: string | undefined;
  if (input.career.teamDefinitionId) {
    const [team] = await repos.teams.ensureCanonicalTeams([
      input.career.teamDefinitionId,
    ]);
    teamId = team?.id;
  }
  let career = await repos.careers.create({
    playerId: profile.id,
    tier: input.career.tier,
    ...(teamId ? { teamId } : {}),
  });
  if (teamId) {
    await repos.teams.joinTeam({
      playerId: profile.id,
      teamId,
      shirtNumber: input.profile.jerseyNumber,
    });
    await repos.careers.appendHistory({
      careerId: career.id,
      eventType: 'team_joined',
      referenceId: teamId,
    });
    career = (await repos.careers.getActiveCareer(profile.id)) ?? career;
  }

  const items: InventoryItemRecord[] = [];
  for (const [index, starter] of input.starterItems.entries()) {
    const { item } = await repos.inventory.grantItem({
      playerId: profile.id,
      itemDefinitionId: starter.itemDefinitionId,
      source: 'starter',
      idempotencyKey: `${prefix}:item:${index}`,
    });
    items.push(item);
    if (starter.equip) await repos.inventory.equipItem(profile.id, item.id);
  }
  for (const achievementId of input.starterAchievementIds ?? [])
    await repos.achievements.ensure(profile.id, achievementId);

  return {
    profile,
    appearance,
    state,
    career,
    balances: await repos.wallet.getBalances(profile.id),
    items,
  };
}

/** Run createPlayerFoundationIn in its own transaction. */
export function createPlayerFoundationAtomic(
  database: Database,
  input: PlayerFoundationInput,
  options: { readonly requestId?: string } = {},
): Promise<PlayerFoundation> {
  return database.transaction(
    (tx) => createPlayerFoundationIn(database.repositories(tx), input),
    {
      operation: 'player.create_foundation',
      ...(options.requestId ? { requestId: options.requestId } : {}),
    },
  );
}
