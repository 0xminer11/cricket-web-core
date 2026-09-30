import { and, desc, eq, sql } from 'drizzle-orm';
import type { EquipmentSlot } from '@the-cricketer/game-core';
import type { Executor } from '../connection';
import type { AcquisitionSource, InventoryStatus } from '../enums';
import {
  InvalidInputError,
  OwnershipViolationError,
  StaleWriteError,
} from '../errors';
import {
  clampLimit,
  encodeTimeCursor,
  keysetDesc,
  toPage,
} from '../pagination';
import type { Page, PageRequest } from '../pagination';
import type { EquippedItemRecord, InventoryItemRecord } from '../records';
import { equippedItems, playerInventory } from '../schema/index';
import type { RepositoryContext } from './shared';
import { assertSafeInt, assertUuid, Repository, requireRow } from './shared';

const toItem = (
  row: typeof playerInventory.$inferSelect,
): InventoryItemRecord => ({
  id: row.id,
  playerId: row.playerId,
  itemDefinitionId: row.itemDefinitionId,
  upgradeLevel: row.upgradeLevel,
  quantity: row.quantity,
  status: row.status,
  acquisitionSource: row.acquisitionSource,
  acquiredAt: row.acquiredAt,
  metadata: row.metadata,
});

export interface GrantItemInput {
  readonly playerId: string;
  readonly itemDefinitionId: string;
  readonly source: AcquisitionSource;
  readonly quantity?: number;
  readonly upgradeLevel?: number;
  /** Repeating a grant with the same key returns the original item instead of a duplicate. */
  readonly idempotencyKey?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Every read or write of an owned item takes the acting playerId, so an inventory item id supplied
 * by a client can only ever resolve to that player's own rows. There is deliberately no
 * getItemById(itemId) without a player.
 */
export class InventoryRepository extends Repository {
  constructor(
    private readonly db: Executor,
    private readonly ctx: RepositoryContext,
  ) {
    super();
  }

  /** Newest first. Defaults to active items. */
  getOwnedItems(
    playerId: string,
    options: PageRequest & { status?: InventoryStatus } = {},
  ): Promise<Page<InventoryItemRecord>> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const limit = clampLimit(options.limit);
      const rows = await this.db
        .select()
        .from(playerInventory)
        .where(
          and(
            eq(playerInventory.playerId, playerId),
            eq(playerInventory.status, options.status ?? 'active'),
            keysetDesc(
              playerInventory.acquiredAt,
              playerInventory.id,
              options.cursor,
            ),
          ),
        )
        .orderBy(desc(playerInventory.acquiredAt), desc(playerInventory.id))
        .limit(limit + 1);
      return toPage(rows.map(toItem), limit, (r) =>
        encodeTimeCursor(r.acquiredAt, r.id),
      );
    });
  }

  /** Throws OwnershipViolationError unless the item belongs to `playerId`. */
  getItem(
    playerId: string,
    inventoryItemId: string,
  ): Promise<InventoryItemRecord> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      assertUuid(inventoryItemId, 'inventoryItemId');
      const rows = await this.db
        .select()
        .from(playerInventory)
        .where(
          and(
            eq(playerInventory.id, inventoryItemId),
            eq(playerInventory.playerId, playerId),
          ),
        );
      if (!rows[0]) throw new OwnershipViolationError('Inventory item');
      return toItem(rows[0]);
    });
  }

  /**
   * Create an owned item. Validates the definition against game-core; equipment and cosmetics are
   * always single instances (quantity 1). Returns replayed=true when the idempotency key was seen.
   */
  grantItem(
    input: GrantItemInput,
  ): Promise<{ item: InventoryItemRecord; replayed: boolean }> {
    return this.run(async () => {
      assertUuid(input.playerId, 'playerId');
      const definition = this.ctx.catalog.item(input.itemDefinitionId);
      const quantity = input.quantity ?? 1;
      assertSafeInt(quantity, 'quantity', { min: 1 });
      if (definition.category !== 'consumable' && quantity !== 1)
        throw new InvalidInputError(
          'Equipment and cosmetic items are single instances',
        );
      const upgradeLevel = input.upgradeLevel ?? 0;
      assertSafeInt(upgradeLevel, 'upgradeLevel', {
        min: 0,
        max: definition.maxUpgradeLevel,
      });

      const inserted = await this.db
        .insert(playerInventory)
        .values({
          playerId: input.playerId,
          itemDefinitionId: input.itemDefinitionId,
          acquisitionSource: input.source,
          quantity,
          upgradeLevel,
          ...(input.idempotencyKey
            ? { idempotencyKey: input.idempotencyKey }
            : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        })
        // Only the idempotency index can conflict (ids are fresh UUIDs).
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) return { item: toItem(inserted[0]), replayed: false };

      const existing = await this.db
        .select()
        .from(playerInventory)
        .where(
          and(
            eq(playerInventory.playerId, input.playerId),
            eq(playerInventory.idempotencyKey, input.idempotencyKey ?? ''),
          ),
        );
      return {
        item: toItem(requireRow(existing, 'Inventory item')),
        replayed: true,
      };
    });
  }

  /**
   * Retire an owned item (sold/consumed/removed): unequips it and keeps the row for history.
   * Any currency for a sale is a separate WalletRepository credit in the same transaction.
   */
  removeItem(
    playerId: string,
    inventoryItemId: string,
    status: Exclude<InventoryStatus, 'active'>,
  ): Promise<InventoryItemRecord> {
    return this.run(async () =>
      this.db.transaction(async (tx) => {
        assertUuid(inventoryItemId, 'inventoryItemId');
        const rows = await tx
          .update(playerInventory)
          .set({ status })
          .where(
            and(
              eq(playerInventory.id, inventoryItemId),
              eq(playerInventory.playerId, playerId),
              eq(playerInventory.status, 'active'),
            ),
          )
          .returning();
        if (!rows[0]) throw new OwnershipViolationError('Inventory item');
        await tx
          .delete(equippedItems)
          .where(eq(equippedItems.inventoryItemId, inventoryItemId));
        return toItem(rows[0]);
      }),
    );
  }

  /** Compare-and-set upgrade level (level chosen by game logic, cost charged via the wallet). */
  setUpgradeLevel(input: {
    readonly playerId: string;
    readonly inventoryItemId: string;
    readonly expectedLevel: number;
    readonly newLevel: number;
  }): Promise<InventoryItemRecord> {
    return this.run(async () => {
      const current = await this.getItem(input.playerId, input.inventoryItemId);
      const definition = this.ctx.catalog.item(current.itemDefinitionId);
      assertSafeInt(input.newLevel, 'upgradeLevel', {
        min: 0,
        max: definition.maxUpgradeLevel,
      });
      const rows = await this.db
        .update(playerInventory)
        .set({ upgradeLevel: input.newLevel })
        .where(
          and(
            eq(playerInventory.id, input.inventoryItemId),
            eq(playerInventory.playerId, input.playerId),
            eq(playerInventory.status, 'active'),
            eq(playerInventory.upgradeLevel, input.expectedLevel),
          ),
        )
        .returning();
      if (!rows[0]) throw new StaleWriteError('Inventory item');
      return toItem(rows[0]);
    });
  }

  /**
   * Equip an owned, active item into the slot dictated by its static definition (the slot is never
   * taken from the client). Replaces whatever occupied the slot. The composite foreign key
   * (inventory_item_id, player_id) re-checks ownership inside PostgreSQL.
   */
  equipItem(
    playerId: string,
    inventoryItemId: string,
  ): Promise<EquippedItemRecord> {
    return this.run(async () =>
      this.db.transaction(async (tx) => {
        assertUuid(playerId, 'playerId');
        assertUuid(inventoryItemId, 'inventoryItemId');
        const owned = await tx
          .select()
          .from(playerInventory)
          .where(
            and(
              eq(playerInventory.id, inventoryItemId),
              eq(playerInventory.playerId, playerId),
              eq(playerInventory.status, 'active'),
            ),
          )
          .for('update');
        if (!owned[0]) throw new OwnershipViolationError('Inventory item');
        const definition = this.ctx.catalog.item(owned[0].itemDefinitionId);
        if (definition.category === 'consumable')
          throw new InvalidInputError('Consumables cannot be equipped');
        const rows = await tx
          .insert(equippedItems)
          .values({ playerId, equipmentSlot: definition.slot, inventoryItemId })
          .onConflictDoUpdate({
            target: [equippedItems.playerId, equippedItems.equipmentSlot],
            set: { inventoryItemId, equippedAt: sql`now()` },
          })
          .returning();
        const row = requireRow(rows, 'Equipped item');
        return { ...row, itemDefinitionId: owned[0].itemDefinitionId };
      }),
    );
  }

  unequipItem(playerId: string, slot: EquipmentSlot): Promise<boolean> {
    return this.run(async () => {
      const rows = await this.db
        .delete(equippedItems)
        .where(
          and(
            eq(equippedItems.playerId, playerId),
            eq(equippedItems.equipmentSlot, slot),
          ),
        )
        .returning({ slot: equippedItems.equipmentSlot });
      return rows.length > 0;
    });
  }

  getEquipped(playerId: string): Promise<readonly EquippedItemRecord[]> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const rows = await this.db
        .select({
          playerId: equippedItems.playerId,
          equipmentSlot: equippedItems.equipmentSlot,
          inventoryItemId: equippedItems.inventoryItemId,
          itemDefinitionId: playerInventory.itemDefinitionId,
          equippedAt: equippedItems.equippedAt,
        })
        .from(equippedItems)
        .innerJoin(
          playerInventory,
          eq(playerInventory.id, equippedItems.inventoryItemId),
        )
        .where(eq(equippedItems.playerId, playerId))
        .orderBy(equippedItems.equipmentSlot);
      return rows;
    });
  }
}
