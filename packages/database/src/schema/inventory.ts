import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ACQUISITION_SOURCES,
  EQUIPMENT_SLOTS,
  INVENTORY_STATUSES,
} from '../enums';
import {
  createdAt,
  definitionIdIn,
  inList,
  nonNegative,
  pk,
  positive,
  ts,
  updatedAt,
} from './helpers';
import { playerProfiles } from './player';

/**
 * Owned item instances. Stores only the definition id + player-specific state; name, rarity,
 * price and modifiers stay in game-core. Rule: equipment/cosmetics are unique instances
 * (quantity 1, enforced by InventoryRepository against the definition's category); quantity > 1
 * is reserved for future stackable consumables.
 */
export const playerInventory = pgTable(
  'player_inventory',
  {
    id: pk(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => playerProfiles.id, { onDelete: 'restrict' }),
    itemDefinitionId: text('item_definition_id').notNull(),
    upgradeLevel: integer('upgrade_level').notNull().default(0),
    quantity: integer('quantity').notNull().default(1),
    status: text('status', { enum: INVENTORY_STATUSES })
      .notNull()
      .default('active'),
    acquisitionSource: text('acquisition_source', {
      enum: ACQUISITION_SOURCES,
    }).notNull(),
    /** Optional grant idempotency (e.g. starter:<player>:<item>) so replays never duplicate items. */
    idempotencyKey: text('idempotency_key'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    acquiredAt: ts('acquired_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Target of the composite FK from equipped_items: proves an instance belongs to the player.
    unique('player_inventory_id_player_uniq').on(t.id, t.playerId),
    index('player_inventory_player_status_idx').on(t.playerId, t.status),
    index('player_inventory_player_item_idx').on(
      t.playerId,
      t.itemDefinitionId,
    ),
    uniqueIndex('player_inventory_idempotency_uniq')
      .on(t.playerId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    check(
      'player_inventory_item_definition_check',
      definitionIdIn(t.itemDefinitionId, 'item'),
    ),
    check('player_inventory_upgrade_level_check', nonNegative(t.upgradeLevel)),
    check('player_inventory_quantity_check', positive(t.quantity)),
    check(
      'player_inventory_status_check',
      inList(t.status, INVENTORY_STATUSES),
    ),
    check(
      'player_inventory_source_check',
      inList(t.acquisitionSource, ACQUISITION_SOURCES),
    ),
    check(
      'player_inventory_idempotency_key_check',
      sql`${t.idempotencyKey} IS NULL OR char_length(${t.idempotencyKey}) BETWEEN 8 AND 128`,
    ),
  ],
);

/**
 * One item per slot per player. The composite FK makes "inventory item belongs to the same
 * player" a database guarantee; slot-vs-definition compatibility is checked in the repository
 * (PostgreSQL cannot see game-core definitions).
 */
export const equippedItems = pgTable(
  'equipped_items',
  {
    playerId: uuid('player_id').notNull(),
    equipmentSlot: text('equipment_slot', { enum: EQUIPMENT_SLOTS }).notNull(),
    inventoryItemId: uuid('inventory_item_id').notNull(),
    equippedAt: ts('equipped_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: 'equipped_items_pk',
      columns: [t.playerId, t.equipmentSlot],
    }),
    unique('equipped_items_inventory_item_uniq').on(t.inventoryItemId),
    check(
      'equipped_items_slot_check',
      inList(t.equipmentSlot, EQUIPMENT_SLOTS),
    ),
    foreignKey({
      name: 'equipped_items_inventory_owner_fk',
      columns: [t.inventoryItemId, t.playerId],
      foreignColumns: [playerInventory.id, playerInventory.playerId],
    }).onDelete('cascade'),
  ],
);
