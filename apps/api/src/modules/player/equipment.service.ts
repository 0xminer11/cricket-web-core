import { OwnershipViolationError } from '@the-cricketer/database';
import type { Database, InventoryItemRecord } from '@the-cricketer/database';
import {
  DRESSING_ROOM_SLOTS,
  ITEMS,
  validateAppearanceChoice,
} from '@the-cricketer/game-core';
import type { EquipmentSlot } from '@the-cricketer/game-core';
import type {
  EquipmentEntry,
  InventoryItemDto,
  UpdateAppearanceRequest,
} from '@the-cricketer/shared-types';
import {
  CreationChoiceError,
  InvalidEquipmentSlotError,
  ItemNotOwnedError,
  ItemRequirementNotMetError,
  ItemSlotMismatchError,
  ItemUnavailableError,
} from './player.errors';
import type { PlayerTelemetry } from './player.events';

const DEFINITIONS = new Map<string, (typeof ITEMS)[number]>(
  ITEMS.map((i) => [i.id, i]),
);
const SLOTS: readonly string[] = DRESSING_ROOM_SLOTS;

export interface PlayerScope {
  readonly playerId: string;
  readonly userId: string;
}

/**
 * Inventory/equipment/appearance for the caller's own cricketer. The player comes from the
 * session (`PlayerScope`), never from the request. Equipping NEVER touches base attributes:
 * item modifiers are applied on top of base skill by future gameplay code, not stored.
 */
export class EquipmentService {
  constructor(
    private readonly database: Database,
    private readonly telemetry: PlayerTelemetry,
  ) {}

  async inventory(scope: PlayerScope): Promise<InventoryItemDto[]> {
    const repos = this.database.repositories();
    const equipped = new Map(
      (await repos.inventory.getEquipped(scope.playerId)).map((e) => [
        e.inventoryItemId,
        e.equipmentSlot,
      ]),
    );
    const items: InventoryItemRecord[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const result = await repos.inventory.getOwnedItems(scope.playerId, {
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
      items.push(...result.items);
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return items
      .filter((i) => DEFINITIONS.has(i.itemDefinitionId))
      .map((i) => ({
        inventoryItemId: i.id,
        itemId: i.itemDefinitionId,
        upgradeLevel: i.upgradeLevel,
        equippedSlot: equipped.get(i.id) ?? null,
      }));
  }

  async equipment(scope: PlayerScope): Promise<EquipmentEntry[]> {
    const rows = await this.database
      .repositories()
      .inventory.getEquipped(scope.playerId);
    return rows.map((r) => ({
      slot: r.equipmentSlot,
      inventoryItemId: r.inventoryItemId,
      itemId: r.itemDefinitionId,
    }));
  }

  /**
   * Validation order matters for what an attacker can learn: an id that is not yours (or does not
   * exist) is `ITEM_NOT_OWNED` either way. Slot, availability and level are checked against the
   * static definition, never against anything the client sent.
   */
  async equip(
    scope: PlayerScope,
    slot: string,
    inventoryItemId: string,
  ): Promise<EquipmentEntry> {
    if (!SLOTS.includes(slot)) throw new InvalidEquipmentSlotError();
    const repos = this.database.repositories();
    let item: InventoryItemRecord;
    try {
      item = await repos.inventory.getItem(scope.playerId, inventoryItemId);
    } catch (error) {
      if (error instanceof OwnershipViolationError)
        throw new ItemNotOwnedError();
      throw error;
    }
    if (item.status !== 'active') throw new ItemUnavailableError();
    const definition = DEFINITIONS.get(item.itemDefinitionId);
    if (!definition) throw new ItemUnavailableError();
    if (definition.category === 'consumable' || definition.slot !== slot)
      throw new ItemSlotMismatchError();
    const state = await repos.players.getState(scope.playerId);
    if (!state) throw new ItemUnavailableError();
    if (definition.levelRequirement > state.level)
      throw new ItemRequirementNotMetError(definition.levelRequirement);
    try {
      // One row per (player, slot): the repository replaces the occupant atomically.
      const row = await repos.inventory.equipItem(
        scope.playerId,
        inventoryItemId,
      );
      this.telemetry.track('equipment_equipped', {
        userId: scope.userId,
        slot: row.equipmentSlot as EquipmentSlot,
      });
      return {
        slot: row.equipmentSlot,
        inventoryItemId: row.inventoryItemId,
        itemId: row.itemDefinitionId,
      };
    } catch (error) {
      // The item was retired between the check and the write.
      if (error instanceof OwnershipViolationError)
        throw new ItemNotOwnedError();
      throw error;
    }
  }

  async appearance(scope: PlayerScope) {
    const a = await this.database
      .repositories()
      .players.getAppearance(scope.playerId);
    if (!a) throw new ItemUnavailableError();
    return {
      bodyPresetId: a.bodyPresetId,
      facePresetId: a.facePresetId,
      skinToneId: a.skinToneId,
      hairStyleId: a.hairStyleId,
      hairColorId: a.hairColorId,
      beardStyleId: a.beardStyleId ?? 'appearance.beard.none',
      heightScale: a.heightScale,
    };
  }

  /**
   * Save confirmed cosmetic choices. The merged result is validated against the registry (unknown
   * and locked ids refused), so partial patches cannot smuggle an invalid combination. Colours and
   * meshes are ids resolved by trusted config; no URL, file or colour string is ever accepted.
   */
  async updateAppearance(scope: PlayerScope, patch: UpdateAppearanceRequest) {
    const current = await this.appearance(scope);
    // Drop absent keys so a partial patch can only override what it names.
    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as Partial<typeof current>;
    const merged = { ...current, ...defined };
    const problem = validateAppearanceChoice(merged);
    if (problem)
      throw new CreationChoiceError('INVALID_APPEARANCE_OPTION', problem);
    await this.database
      .repositories()
      .players.updateAppearance(scope.playerId, {
        ...patch,
        ...(patch.heightScale !== undefined
          ? { heightScale: Number(patch.heightScale.toFixed(3)) }
          : {}),
      });
    this.telemetry.track('appearance_changed', {
      userId: scope.userId,
      fields: Object.keys(patch).length,
    });
    return this.appearance(scope);
  }
}
