import { expect, it } from 'vitest';
import { execRaw } from '../../packages/database/src/testing/harness';
import { STARTER_LOADOUT } from '../../packages/game-core/src/index';
import { describeDb } from '../support/db';
import { Browser, buildAuthApp } from '../support/auth';
import {
  PLAYER_URL,
  STARTER_APPEARANCE,
  authenticatedGuest,
  createPlayer,
  createTestPlayerCreationRequest as request,
} from '../support/player';

const ITEMS_URL = `${PLAYER_URL}/inventory`;
const EQUIP_URL = `${PLAYER_URL}/equipment`;
const GRANT = '/api/v1/dev/player/grant-sample-gear';

async function player(
  app: Awaited<ReturnType<typeof buildAuthApp>>['app'],
  name = 'Gear Tester',
) {
  const b = await authenticatedGuest(app);
  const r = await createPlayer(b, request({ displayName: name }));
  expect(r.statusCode).toBe(201);
  return {
    b,
    player: r.json().data.player,
    playerId: r.json().data.player.summary.id as string,
  };
}
type Item = {
  inventoryItemId: string;
  itemId: string;
  equippedSlot: string | null;
};
const inventory = async (b: Browser) =>
  (await b.get(ITEMS_URL)).json().data.items as Item[];
const idOf = (items: Item[], itemId: string) =>
  items.find((i) => i.itemId === itemId)?.inventoryItemId as string;

describeDb('inventory, equipment and appearance APIs (Module 5)', (ctx) => {
  it('lists the real starter inventory and equipment, and needs authentication and a cricketer', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      for (const path of [ITEMS_URL, EQUIP_URL, `${PLAYER_URL}/appearance`])
        expect((await new Browser(app).get(path)).statusCode).toBe(401);
      const fresh = await authenticatedGuest(app);
      for (const path of [ITEMS_URL, EQUIP_URL, `${PLAYER_URL}/appearance`]) {
        const r = await fresh.get(path);
        expect(r.statusCode).toBe(404);
        expect(r.json().error.code).toBe('CRICKETER_NOT_FOUND');
      }
      const { b } = await player(app);
      const items = await inventory(b);
      expect(items.map((i) => i.itemId).sort()).toEqual(
        Object.values(STARTER_LOADOUT).sort(),
      );
      for (const i of items)
        expect(i.equippedSlot).toBe(
          Object.entries(STARTER_LOADOUT).find(
            ([, id]) => id === i.itemId,
          )?.[0],
        );
      const eq = (await b.get(EQUIP_URL)).json().data.equipment as Array<{
        slot: string;
        itemId: string;
        inventoryItemId: string;
      }>;
      expect(eq.map((e) => e.slot).sort()).toEqual(
        Object.keys(STARTER_LOADOUT).sort(),
      );
      for (const e of eq)
        expect(
          items.find((i) => i.inventoryItemId === e.inventoryItemId)?.itemId,
        ).toBe(e.itemId);
      // nothing but ids: no wallet, ledger, names or database internals
      expect(JSON.stringify(items)).not.toMatch(
        /coins|balance|userId|playerId|status|acquisition/i,
      );
      expect((await b.get(ITEMS_URL)).headers['cache-control']).toBe(
        'no-store',
      );
    } finally {
      await app.close();
    }
  });

  it('equips an owned item server-side, replaces the occupant and leaves base attributes untouched', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, player: p } = await player(app);
      expect((await b.post(GRANT)).statusCode).toBe(200);
      const items = await inventory(b);
      expect(items).toHaveLength(14);
      const ash = idOf(items, 'item.bat.backyard_ash_01');
      const willow = idOf(items, 'item.bat.street_willow_01');
      const before = (await b.get(PLAYER_URL)).json().data.player;
      const r = await b.put(`${EQUIP_URL}/bat`, { inventoryItemId: ash });
      expect(r.statusCode).toBe(200);
      expect(r.json().data).toEqual({
        slot: 'bat',
        inventoryItemId: ash,
        itemId: 'item.bat.backyard_ash_01',
      });
      const eq = (await b.get(EQUIP_URL)).json().data.equipment as Array<{
        slot: string;
        itemId: string;
      }>;
      expect(eq.filter((e) => e.slot === 'bat')).toEqual([
        expect.objectContaining({ itemId: 'item.bat.backyard_ash_01' }),
      ]);
      const after = await inventory(b);
      expect(
        after.find((i) => i.inventoryItemId === willow)?.equippedSlot,
      ).toBeNull(); // still owned, not worn
      expect(after.find((i) => i.inventoryItemId === ash)?.equippedSlot).toBe(
        'bat',
      );
      // equipping is idempotent
      expect(
        (await b.put(`${EQUIP_URL}/bat`, { inventoryItemId: ash })).statusCode,
      ).toBe(200);
      // base attributes never move; equipped state shows in the profile
      const read = (await b.get(PLAYER_URL)).json().data.player;
      expect(read.attributes).toEqual(before.attributes);
      expect(read.overall).toEqual(before.overall);
      expect(
        read.equipped.find((e: { slot: string }) => e.slot === 'bat').itemId,
      ).toBe('item.bat.backyard_ash_01');
      expect(p.attributes).toEqual(read.attributes);
      // every other slot too
      for (const [slot, itemId] of [
        ['gloves', 'item.gloves.quick_touch_01'],
        ['pads', 'item.pads.mobile_guard_01'],
        ['shoes', 'item.shoes.sprint_spikes_01'],
        ['jersey', 'item.jersey.midnight_01'],
      ] as const) {
        const ok = await b.put(`${EQUIP_URL}/${slot}`, {
          inventoryItemId: idOf(after, itemId),
        });
        expect(ok.statusCode, slot).toBe(200);
        expect(ok.json().data.itemId).toBe(itemId);
      }
    } finally {
      await app.close();
    }
  });

  it('refuses unowned, foreign, unknown and mismatched items with stable codes', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const a = await player(app, 'Owner Alpha');
      const other = await player(app, 'Owner Bravo');
      await a.b.post(GRANT);
      const aItems = await inventory(a.b);
      const aBat = idOf(aItems, 'item.bat.backyard_ash_01');
      // user B tries A's inventory item: indistinguishable from a missing one
      const foreign = await other.b.put(`${EQUIP_URL}/bat`, {
        inventoryItemId: aBat,
      });
      expect(foreign.statusCode).toBe(404);
      expect(foreign.json().error.code).toBe('ITEM_NOT_OWNED');
      const missing = await other.b.put(`${EQUIP_URL}/bat`, {
        inventoryItemId: '00000000-0000-4000-8000-000000000001',
      });
      expect(missing.json().error).toMatchObject({
        code: 'ITEM_NOT_OWNED',
        message: foreign.json().error.message,
      });
      const bEq = (await other.b.get(EQUIP_URL)).json().data
        .equipment as Array<{ slot: string; inventoryItemId: string }>;
      expect(bEq.find((e) => e.slot === 'bat')?.inventoryItemId).not.toBe(aBat); // B's bat unchanged
      // helmet into the bat slot, bat into the helmet slot
      const helmet = idOf(aItems, 'item.helmet.core_guard_01');
      expect(
        (await a.b.put(`${EQUIP_URL}/bat`, { inventoryItemId: helmet })).json()
          .error.code,
      ).toBe('ITEM_SLOT_MISMATCH');
      expect(
        (await a.b.put(`${EQUIP_URL}/helmet`, { inventoryItemId: aBat }))
          .statusCode,
      ).toBe(409);
      // slots that are not exposed, or invented
      for (const slot of [
        'bat_grip',
        'wristband',
        'glasses',
        'nonsense',
        'BAT',
        '__proto__',
      ]) {
        const r = await a.b.put(`${EQUIP_URL}/${slot}`, {
          inventoryItemId: aBat,
        });
        expect(r.statusCode, slot).toBe(400);
        expect(r.json().error.code).toBe('INVALID_EQUIPMENT_SLOT');
      }
      // malformed bodies and smuggled fields
      for (const body of [
        {},
        { inventoryItemId: 'abc' },
        { inventoryItemId: aBat, itemId: 'item.bat.pro_willow_01' },
        { inventoryItemId: aBat, slot: 'helmet' },
        {
          inventoryItemId: aBat,
          modifiers: [{ stat: 'batting.power', flatBonus: 99 }],
        },
        { inventoryItemId: aBat, modelUrl: 'https://evil.example/x.glb' },
      ]) {
        const r = await a.b.put(`${EQUIP_URL}/bat`, body);
        expect(r.statusCode, JSON.stringify(body)).toBe(400);
      }
      // retired item
      const repos = ctx().database.repositories();
      await repos.inventory.removeItem(a.playerId, aBat, 'removed');
      expect(
        (await a.b.put(`${EQUIP_URL}/bat`, { inventoryItemId: aBat })).json()
          .error.code,
      ).toBe('ITEM_UNAVAILABLE');
      // nothing was changed by any of the rejected attempts
      expect(
        (await a.b.get(EQUIP_URL))
          .json()
          .data.equipment.find((e: { slot: string }) => e.slot === 'bat')
          .itemId,
      ).toBe('item.bat.street_willow_01');
    } finally {
      await app.close();
    }
  });

  it('enforces Module 0 level requirements', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await player(app);
      const repos = ctx().database.repositories();
      const { item } = await repos.inventory.grantItem({
        playerId,
        itemDefinitionId: 'item.bat.pro_willow_01',
        source: 'reward',
      });
      const r = await b.put(`${EQUIP_URL}/bat`, { inventoryItemId: item.id });
      expect(r.statusCode).toBe(403);
      expect(r.json().error).toMatchObject({
        code: 'ITEM_REQUIREMENT_NOT_MET',
        message: 'Requires level 14.',
      });
      expect(
        (await b.get(EQUIP_URL))
          .json()
          .data.equipment.find((e: { slot: string }) => e.slot === 'bat')
          .itemId,
      ).toBe('item.bat.street_willow_01');
      await b.post(GRANT); // lifts to level 20
      expect(
        (await b.put(`${EQUIP_URL}/bat`, { inventoryItemId: item.id }))
          .statusCode,
      ).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('keeps exactly one item per slot under concurrent equips', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await player(app);
      await b.post(GRANT);
      const items = await inventory(b);
      const bats = [
        'item.bat.backyard_ash_01',
        'item.bat.club_edge_01',
        'item.bat.pro_willow_01',
        'item.bat.street_willow_01',
      ].map((i) => idOf(items, i));
      const tabs = bats.map(() => {
        const t = new Browser(app);
        t.cookie = b.cookie;
        return t;
      });
      const results = await Promise.all(
        tabs.map((t, i) =>
          t.put(`${EQUIP_URL}/bat`, { inventoryItemId: bats[i] }),
        ),
      );
      for (const r of results) expect(r.statusCode).toBe(200);
      const rows = await execRaw(
        ctx().url,
        `SELECT inventory_item_id FROM equipped_items WHERE player_id = $1 AND equipment_slot = 'bat'`,
        [playerId],
      );
      expect(rows).toHaveLength(1);
      expect(bats).toContain(rows[0]?.inventory_item_id);
    } finally {
      await app.close();
    }
  });

  it('edits appearance with starter options only and persists it', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b } = await player(app);
      const get = async () =>
        (await b.get(`${PLAYER_URL}/appearance`)).json().data.appearance;
      expect(await get()).toEqual(STARTER_APPEARANCE);
      const ok = await b.patch(`${PLAYER_URL}/appearance`, {
        hairStyleId: 'appearance.hair.curly_01',
        beardStyleId: 'appearance.beard.full_01',
        heightScale: 1.04,
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().data.appearance).toEqual({
        ...STARTER_APPEARANCE,
        hairStyleId: 'appearance.hair.curly_01',
        beardStyleId: 'appearance.beard.full_01',
        heightScale: 1.04,
      });
      expect(await get()).toEqual(ok.json().data.appearance);
      expect(
        (await b.get(PLAYER_URL)).json().data.player.appearance.hairStyleId,
      ).toBe('appearance.hair.curly_01');
      const before = await get();
      for (const body of [
        { hairStyleId: 'appearance.hair.mohawk_01' },
        { hairStyleId: 'appearance.hair.nonexistent' },
        { bodyPresetId: 'appearance.body.elite_01' },
        { hairColorId: 'appearance.haircolor.neon_blue' },
        { beardStyleId: 'appearance.beard.goatee_01' },
        { skinToneId: 'appearance.hair.short_01' },
        { heightScale: 2 },
        { heightScale: 1.055 },
      ]) {
        const r = await b.patch(`${PLAYER_URL}/appearance`, body);
        expect(r.statusCode, JSON.stringify(body)).toBe(400);
        expect(r.json().error.code).toBe('INVALID_APPEARANCE_OPTION');
      }
      for (const body of [
        {},
        {
          hairStyleId: 'appearance.hair.short_01',
          meshUrl: 'https://evil.example/hair.glb',
        },
        { hairColor: '#ff0000' },
        { heightScale: 'tall' },
        { skinToneId: 5 },
      ]) {
        const r = await b.patch(`${PLAYER_URL}/appearance`, body);
        expect(r.statusCode, JSON.stringify(body)).toBe(400);
        expect(r.json().error.code).toBe('VALIDATION_ERROR');
      }
      expect(await get()).toEqual(before); // rejected edits changed nothing
      expect(
        (
          await new Browser(app).patch(`${PLAYER_URL}/appearance`, {
            hairStyleId: 'appearance.hair.short_01',
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('applies CSRF and CORS (including PUT/PATCH preflight) to the new routes', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b } = await player(app);
      const items = await inventory(b);
      const evil = new Browser(
        app,
        'cricketer_session',
        'https://evil.example',
      );
      evil.cookie = b.cookie;
      expect(
        (
          await evil.put(`${EQUIP_URL}/bat`, {
            inventoryItemId: idOf(items, 'item.bat.street_willow_01'),
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await evil.patch(`${PLAYER_URL}/appearance`, {
            hairStyleId: 'appearance.hair.short_01',
          })
        ).statusCode,
      ).toBe(403);
      for (const method of ['PUT', 'PATCH']) {
        const pre = await app.inject({
          method: 'OPTIONS',
          url: `${EQUIP_URL}/bat`,
          headers: {
            origin: 'http://localhost:3300',
            'access-control-request-method': method,
            'access-control-request-headers': 'content-type',
          },
        });
        expect(String(pre.headers['access-control-allow-methods'])).toContain(
          method,
        );
        expect(pre.headers['access-control-allow-origin']).toBe(
          'http://localhost:3300',
        );
      }
    } finally {
      await app.close();
    }
  });

  it('records coarse viewer telemetry only for valid events and never exposes dev tools in production', async () => {
    const tracked: Array<{ event: string; props: Record<string, unknown> }> =
      [];
    const { app } = await buildAuthApp(
      ctx(),
      {},
      {
        playerTelemetry: {
          track: (event: string, props: Record<string, unknown>) =>
            void tracked.push({ event, props }),
        } as never,
      },
    );
    try {
      const { b } = await player(app);
      tracked.length = 0;
      const post = (body: unknown) =>
        b.post(`${PLAYER_URL}/viewer/events`, body);
      expect(
        (await post({ event: 'viewer_opened', quality: 'medium' })).statusCode,
      ).toBe(200);
      expect(
        (await post({ event: 'viewer_loaded', durationMs: 812, bytes: 250000 }))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await post({
            event: 'viewer_load_failed',
            reason: 'webgl_unsupported',
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await post({ event: 'equipment_previewed', slot: 'bat' })).statusCode,
      ).toBe(200);
      for (const bad of [
        { event: 'viewer_loaded', durationMs: -5 },
        { event: 'viewer_load_failed', reason: 'because' },
        { event: 'viewer_opened', email: 'a@b.co' },
        { event: 'frame', fps: 60 },
        {},
      ])
        expect((await post(bad)).statusCode).toBe(400);
      expect(
        (
          await new Browser(app).post(`${PLAYER_URL}/viewer/events`, {
            event: 'viewer_opened',
          })
        ).statusCode,
      ).toBe(401);
      expect(tracked.map((t) => t.event)).toEqual([
        'viewer_opened',
        'viewer_loaded',
        'viewer_load_failed',
        'equipment_previewed',
      ]);
      await b.post(GRANT);
      const items = await inventory(b);
      await b.put(`${EQUIP_URL}/bat`, {
        inventoryItemId: idOf(items, 'item.bat.backyard_ash_01'),
      });
      await b.patch(`${PLAYER_URL}/appearance`, {
        hairStyleId: 'appearance.hair.buzz_01',
      });
      expect(tracked.slice(-2).map((t) => t.event)).toEqual([
        'equipment_equipped',
        'appearance_changed',
      ]);
      for (const t of tracked) expect(typeof t.props.userId).toBe('string');
    } finally {
      await app.close();
    }
    const prod = await buildAuthApp(ctx(), {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://play.example.com',
      AUTH_TRUSTED_ORIGINS: 'https://play.example.com',
      AUTH_ARGON2_MEMORY_KIB: '19456',
      AUTH_ARGON2_PASSES: '2',
    });
    try {
      const r = await prod.app.inject({
        method: 'POST',
        url: GRANT,
        headers: { origin: 'https://play.example.com' },
        payload: {},
      });
      expect(r.statusCode).toBe(404);
    } finally {
      await prod.app.close();
    }
  });
});
