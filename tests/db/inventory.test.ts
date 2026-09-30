import { expect, it } from 'vitest';
import {
  OwnershipViolationError,
  InvalidInputError,
  UnknownDefinitionError,
} from '../../packages/database/src/index';
import { createTestPlayer } from '../../packages/database/src/testing/factories';
import { sql } from '../../packages/database/src/testing/harness';
import { describeDb } from '../support/db';

describeDb('inventory and equipment', (ctx) => {
  const repos = () => ctx().database.repositories();
  const grant = (playerId: string, itemDefinitionId: string) =>
    repos()
      .inventory.grantItem({ playerId, itemDefinitionId, source: 'shop' })
      .then((r) => r.item);

  it('grants item instances that store only the definition id', async () => {
    const { profile } = await createTestPlayer(repos());
    const item = await grant(profile.id, 'item.bat.pro_willow_01');
    expect(item).toMatchObject({
      itemDefinitionId: 'item.bat.pro_willow_01',
      quantity: 1,
      upgradeLevel: 0,
      status: 'active',
      acquisitionSource: 'shop',
    });
    expect(Object.keys(item)).not.toContain('name');
    const duplicate = await grant(profile.id, 'item.bat.pro_willow_01'); // duplicateItemsAllowed
    expect(duplicate.id).not.toBe(item.id);
  });

  it('validates definitions and single-instance rules', async () => {
    const { profile } = await createTestPlayer(repos());
    await expect(
      grant(profile.id, 'item.bat.does_not_exist'),
    ).rejects.toBeInstanceOf(UnknownDefinitionError);
    await expect(
      repos().inventory.grantItem({
        playerId: profile.id,
        itemDefinitionId: 'item.bat.street_willow_01',
        source: 'shop',
        quantity: 3,
      }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(
      repos().inventory.grantItem({
        playerId: profile.id,
        itemDefinitionId: 'item.bat.street_willow_01',
        source: 'shop',
        upgradeLevel: 6,
      }),
    ).rejects.toBeInstanceOf(InvalidInputError); // max 5
  });

  it('makes grants idempotent by key', async () => {
    const { profile } = await createTestPlayer(repos());
    const args = {
      playerId: profile.id,
      itemDefinitionId: 'item.helmet.core_guard_01',
      source: 'starter' as const,
      idempotencyKey: `grant-${profile.id}`,
    };
    const first = await repos().inventory.grantItem(args);
    const second = await repos().inventory.grantItem(args);
    expect(first.replayed).toBe(false);
    expect(second).toMatchObject({ replayed: true });
    expect(second.item.id).toBe(first.item.id);
    expect(
      (await repos().inventory.getOwnedItems(profile.id)).items,
    ).toHaveLength(1);
  });

  it("never resolves another player's inventory item", async () => {
    const alice = await createTestPlayer(repos());
    const mallory = await createTestPlayer(repos());
    const item = await grant(alice.profile.id, 'item.bat.street_willow_01');
    await expect(
      repos().inventory.getItem(mallory.profile.id, item.id),
    ).rejects.toBeInstanceOf(OwnershipViolationError);
    await expect(
      repos().inventory.equipItem(mallory.profile.id, item.id),
    ).rejects.toBeInstanceOf(OwnershipViolationError);
    await expect(
      repos().inventory.removeItem(mallory.profile.id, item.id, 'sold'),
    ).rejects.toBeInstanceOf(OwnershipViolationError);
    await expect(
      repos().inventory.setUpgradeLevel({
        playerId: mallory.profile.id,
        inventoryItemId: item.id,
        expectedLevel: 0,
        newLevel: 1,
      }),
    ).rejects.toBeInstanceOf(OwnershipViolationError);
    expect(
      await repos().inventory.getEquipped(mallory.profile.id),
    ).toHaveLength(0);
    expect(
      (await repos().inventory.getItem(alice.profile.id, item.id)).status,
    ).toBe('active');
  });

  it('enforces the same-owner rule inside PostgreSQL even if application code is bypassed', async () => {
    const alice = await createTestPlayer(repos());
    const mallory = await createTestPlayer(repos());
    const item = await grant(alice.profile.id, 'item.bat.street_willow_01');
    await expect(
      ctx().database.db.execute(
        sql`INSERT INTO equipped_items (player_id, equipment_slot, inventory_item_id) VALUES (${mallory.profile.id}::uuid, 'bat', ${item.id}::uuid)`,
      ),
    ).rejects.toThrow();
  });

  it('allows one item per slot per player and replaces the occupant', async () => {
    const { profile } = await createTestPlayer(repos());
    const first = await grant(profile.id, 'item.bat.street_willow_01');
    const second = await grant(profile.id, 'item.bat.club_edge_01');
    const helmet = await grant(profile.id, 'item.helmet.core_guard_01');
    await repos().inventory.equipItem(profile.id, first.id);
    await repos().inventory.equipItem(profile.id, helmet.id);
    await repos().inventory.equipItem(profile.id, second.id); // replaces first in the bat slot
    const equipped = await repos().inventory.getEquipped(profile.id);
    expect(equipped.map((e) => [e.equipmentSlot, e.inventoryItemId])).toEqual([
      ['bat', second.id],
      ['helmet', helmet.id],
    ]);
    // the raw uniqueness rule, independent of the repository:
    await expect(
      ctx().database.db.execute(
        sql`INSERT INTO equipped_items (player_id, equipment_slot, inventory_item_id) VALUES (${profile.id}::uuid, 'bat', ${first.id}::uuid)`,
      ),
    ).rejects.toThrow();
    expect(await repos().inventory.unequipItem(profile.id, 'bat')).toBe(true);
    expect(await repos().inventory.unequipItem(profile.id, 'bat')).toBe(false);
  });

  it('retires items (sold) by unequipping them and keeping the row', async () => {
    const { profile } = await createTestPlayer(repos());
    const bat = await grant(profile.id, 'item.bat.street_willow_01');
    await repos().inventory.equipItem(profile.id, bat.id);
    const sold = await repos().inventory.removeItem(profile.id, bat.id, 'sold');
    expect(sold.status).toBe('sold');
    expect(await repos().inventory.getEquipped(profile.id)).toHaveLength(0);
    expect(
      (await repos().inventory.getOwnedItems(profile.id)).items,
    ).toHaveLength(0);
    expect(
      (await repos().inventory.getOwnedItems(profile.id, { status: 'sold' }))
        .items,
    ).toHaveLength(1);
    await expect(
      repos().inventory.equipItem(profile.id, bat.id),
    ).rejects.toBeInstanceOf(OwnershipViolationError); // not active any more
  });

  it('upgrades with compare-and-set on the current level', async () => {
    const { profile } = await createTestPlayer(repos());
    const bat = await grant(profile.id, 'item.bat.street_willow_01');
    const up = await repos().inventory.setUpgradeLevel({
      playerId: profile.id,
      inventoryItemId: bat.id,
      expectedLevel: 0,
      newLevel: 1,
    });
    expect(up.upgradeLevel).toBe(1);
    await expect(
      repos().inventory.setUpgradeLevel({
        playerId: profile.id,
        inventoryItemId: bat.id,
        expectedLevel: 0,
        newLevel: 2,
      }),
    ).rejects.toMatchObject({ code: 'STALE_WRITE' });
    await expect(
      repos().inventory.setUpgradeLevel({
        playerId: profile.id,
        inventoryItemId: bat.id,
        expectedLevel: 1,
        newLevel: 6,
      }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('pages owned items with a cursor', async () => {
    const { profile } = await createTestPlayer(repos());
    for (let i = 0; i < 7; i += 1)
      await grant(profile.id, 'item.helmet.core_guard_01');
    const a = await repos().inventory.getOwnedItems(profile.id, { limit: 3 });
    const b = await repos().inventory.getOwnedItems(profile.id, {
      limit: 3,
      cursor: a.nextCursor ?? '',
    });
    const c = await repos().inventory.getOwnedItems(profile.id, {
      limit: 3,
      cursor: b.nextCursor ?? '',
    });
    expect([a.items.length, b.items.length, c.items.length]).toEqual([3, 3, 1]);
    expect(c.nextCursor).toBeNull();
    expect(
      new Set([...a.items, ...b.items, ...c.items].map((i) => i.id)).size,
    ).toBe(7);
  });
});
