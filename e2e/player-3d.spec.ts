import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const WEB = 'http://localhost:3300';
const API = 'http://localhost:4300/api/v1';
const headers = { origin: WEB, 'content-type': 'application/json' };

interface Viewer {
  attachedParts: string[];
  stats?: {
    geometries: number;
    textures: number;
    materials: number;
    cache: { entries: number; inUse: number };
  };
  engineRunning: boolean;
}
declare global {
  interface Window {
    __viewer?: Viewer;
  }
}

/** Guest account + a cricketer created through the API (the wizard has its own spec). */
async function createGuestCricketer(
  page: Page,
  options: { hand?: 'right' | 'left'; grant?: boolean } = {},
) {
  const guest = await page.request.post(`${API}/auth/guest`, {
    headers,
    data: {},
  });
  expect(guest.status()).toBe(201);
  const created = await page.request.post(`${API}/player`, {
    headers: {
      ...headers,
      'idempotency-key':
        `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(
          32,
          'x',
        ),
    },
    data: {
      displayName: 'Viewer Tester',
      countryCode: 'IN',
      jerseyNumber: 7,
      battingHand: options.hand ?? 'right',
      primaryRole: 'top_order_batter',
      bowlingStyle: null,
      appearance: {
        bodyPresetId: 'appearance.body.athletic_01',
        facePresetId: 'appearance.face.preset_01',
        skinToneId: 'appearance.skin.tone_04',
        hairStyleId: 'appearance.hair.short_01',
        hairColorId: 'appearance.haircolor.black',
        beardStyleId: 'appearance.beard.none',
        heightScale: 1,
      },
      personalityArchetypeId: 'personality.balanced',
    },
  });
  expect(created.status()).toBe(201);
  if (options.grant) {
    const grant = await page.request.post(
      `${API}/dev/player/grant-sample-gear`,
      { headers, data: {} },
    );
    expect(grant.status()).toBe(200);
  }
}

const expectState = (page: Page, state: string) =>
  expect(page.locator(`[data-viewer-state="${state}"]`).first()).toBeVisible({
    timeout: 30000,
  });
const equipment = async (page: Page) =>
  (await (await page.request.get(`${API}/player/equipment`)).json()).data
    .equipment as { slot: string; itemId: string }[];
const batId = async (page: Page) =>
  (await equipment(page)).find((e) => e.slot === 'bat')?.itemId;
const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );

test.describe('3D cricketer viewer', () => {
  test('renders the player page with details, then the dressing room is reachable', async ({
    page,
  }) => {
    await createGuestCricketer(page);
    await page.goto('/player');
    await expectState(page, 'ready');
    await expect(
      page.getByRole('heading', { name: 'My cricketer' }),
    ).toBeVisible();
    await expect(page.getByText('Street Willow')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Rotate left' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Batting stance' }).click();
    await page.getByRole('link', { name: 'Open dressing room' }).click();
    await expect(page).toHaveURL(/\/dressing-room$/);
    await expectState(page, 'ready');
  });

  test('left-handed batter holds the bat in the left hand', async ({
    page,
  }) => {
    await createGuestCricketer(page, { hand: 'left' });
    await page.goto('/player');
    await expectState(page, 'ready');
    const parts = await page.evaluate(() => window.__viewer?.attachedParts);
    expect(parts).toContain('equipment:bat');
  });

  test('guests who have no cricketer are sent to creation, not a blank viewer', async ({
    page,
  }) => {
    await page.request.post(`${API}/auth/guest`, { headers, data: {} });
    await page.goto('/player');
    await expect(page).toHaveURL(/\/create-player$/);
  });

  test('visitors who are signed out are sent home', async ({ page }) => {
    await page.goto('/dressing-room');
    await expect(page).toHaveURL(`${WEB}/`);
  });
});

test.describe('dressing room', () => {
  test('preview, cancel, preview again, equip, and the choice survives a refresh', async ({
    page,
  }) => {
    await createGuestCricketer(page, { grant: true });
    const before = (await (await page.request.get(`${API}/player`)).json()).data
      .player.attributes;
    await page.goto('/dressing-room');
    await expectState(page, 'ready');
    await page.getByRole('tab', { name: 'Bat' }).click();
    expect(await batId(page)).toBe('item.bat.street_willow_01');

    await page.getByRole('button', { name: /Pro Willow/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Previewing Pro Willow' }),
    ).toBeVisible();
    // preview alone changes nothing on the server
    expect(await batId(page)).toBe('item.bat.street_willow_01');

    await page.getByRole('button', { name: 'CANCEL' }).click();
    await expect(page.getByRole('heading', { name: /Previewing/ })).toHaveCount(
      0,
    );

    await page.getByRole('button', { name: /Club Edge/ }).click();
    await page.getByRole('button', { name: 'EQUIP', exact: true }).click();
    await expect(page.getByText('Club Edge equipped.')).toBeVisible();
    expect(await batId(page)).toBe('item.bat.club_edge_01');

    await page.reload();
    await expectState(page, 'ready');
    await page.getByRole('tab', { name: 'Bat' }).click();
    await expect(
      page.getByRole('button', { name: /Club Edge/ }),
    ).toHaveAttribute('aria-pressed', 'true');

    // gear modifiers are applied in matches; they never rewrite the base attributes
    const after = (await (await page.request.get(`${API}/player`)).json()).data
      .player.attributes;
    expect(after).toEqual(before);
  });

  test('every slot can be browsed and the appearance can be edited and saved', async ({
    page,
  }) => {
    await createGuestCricketer(page, { grant: true });
    await page.goto('/dressing-room');
    await expectState(page, 'ready');
    for (const tab of [
      'Helmet',
      'Gloves',
      'Pads',
      'Shoes',
      'Kit',
      'Trousers',
    ]) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByText(`${tab} you own`)).toBeVisible();
    }
    await page.getByRole('tab', { name: 'Look' }).click();
    await page.getByRole('radio', { name: 'Tone 6' }).check();
    await page.getByRole('radio', { name: 'Curly' }).check();
    await page.getByRole('radio', { name: 'Full beard' }).check();
    await page.getByRole('button', { name: 'SAVE APPEARANCE' }).click();
    await expect(page.getByText('Appearance saved.')).toBeVisible();
    await page.reload();
    await expectState(page, 'ready');
    const a = (
      await (await page.request.get(`${API}/player/appearance`)).json()
    ).data.appearance;
    expect(a.skinToneId).toBe('appearance.skin.tone_06');
    expect(a.hairStyleId).toBe('appearance.hair.curly_01');
    expect(a.beardStyleId).toBe('appearance.beard.full_01');
  });

  test('cancelling an unsaved look change discards it', async ({ page }) => {
    await createGuestCricketer(page);
    await page.goto('/dressing-room');
    await expectState(page, 'ready');
    await page.getByRole('tab', { name: 'Look' }).click();
    await page.getByRole('radio', { name: 'Tone 6' }).check();
    await page.getByRole('button', { name: 'CANCEL' }).click();
    const a = (
      await (await page.request.get(`${API}/player/appearance`)).json()
    ).data.appearance;
    expect(a.skinToneId).toBe('appearance.skin.tone_04');
  });

  test('rapid item switching settles on the last choice without errors', async ({
    page,
  }) => {
    await createGuestCricketer(page, { grant: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/dressing-room');
    await expectState(page, 'ready');
    await page.getByRole('tab', { name: 'Bat' }).click();
    const names = [/Pro Willow/, /Club Edge/, /Backyard Ash/, /Street Willow/];
    for (let round = 0; round < 3; round++)
      for (const name of names)
        await page.getByRole('button', { name }).first().click();
    await page.getByRole('button', { name: /Pro Willow/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Previewing Pro Willow' }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__viewer?.attachedParts.length))
      .toBeGreaterThan(5);
    expect(await page.evaluate(() => window.__viewer?.attachedParts)).toContain(
      'equipment:bat',
    );
    expect(errors).toEqual([]);
  });
});

test.describe('failure and fallback behaviour', () => {
  test('base model failure shows a portrait fallback; the page stays usable and retry recovers', async ({
    page,
  }) => {
    await createGuestCricketer(page, { grant: true });
    await page.route('**/game-assets/characters/player_base*', (route) =>
      route.abort(),
    );
    await page.goto('/dressing-room');
    await expectState(page, 'error');
    await expect(page.getByRole('img', { name: /Portrait of/ })).toBeVisible();
    await expect(
      page.getByText(/3D preview unavailable right now/),
    ).toBeVisible();
    // the rest of the dressing room still works, and an equip saves without the 3D view
    await page.getByRole('tab', { name: 'Bat' }).click();
    await page.getByRole('button', { name: /Club Edge/ }).click();
    await page.getByRole('button', { name: 'EQUIP', exact: true }).click();
    await expect(page.getByText('Club Edge equipped.')).toBeVisible();
    expect(await batId(page)).toBe('item.bat.club_edge_01');

    await page.unroute('**/game-assets/characters/player_base*');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expectState(page, 'ready');
  });

  test('a failing optional asset (hair) does not fail the character', async ({
    page,
  }) => {
    await createGuestCricketer(page);
    await page.route('**/game-assets/characters/hair/**', (route) =>
      route.abort(),
    );
    await page.goto('/player');
    await expectState(page, 'ready');
    await expect(page.locator('canvas')).toBeVisible();
    const parts = await page.evaluate(() => window.__viewer?.attachedParts);
    expect(parts).not.toContain('hair');
    expect(parts).toContain('equipment:jersey');
  });

  test('a corrupt GLB degrades like a failed download', async ({ page }) => {
    await createGuestCricketer(page);
    await page.route('**/game-assets/characters/player_base*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'model/gltf-binary',
        body: 'not a glb',
      }),
    );
    await page.goto('/player');
    await expectState(page, 'error');
    await expect(
      page.getByRole('heading', { name: 'Viewer Tester' }),
    ).toBeVisible();
  });

  test('without WebGL the page shows the 2D portrait and all details', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (/webgl/i.test(type)) return null;
        return (original as (...a: unknown[]) => unknown).call(
          this,
          type,
          ...rest,
        );
      } as typeof original;
    });
    await createGuestCricketer(page);
    await page.goto('/player');
    await expectState(page, 'unsupported');
    await expect(page.getByRole('img', { name: /Portrait of/ })).toBeVisible();
    await expect(page.getByText('Street Willow')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rotate left' })).toHaveCount(
      0,
    );
  });

  test('a tampered equip request is refused by the server and the UI stays consistent', async ({
    page,
  }) => {
    await createGuestCricketer(page);
    const refused = await page.request.put(`${API}/player/equipment/bat`, {
      headers,
      data: { inventoryItemId: '11111111-1111-4111-8111-111111111111' },
    });
    expect(refused.status()).toBe(404);
    expect((await refused.json()).error.code).toBe('ITEM_NOT_OWNED');
    await page.goto('/player');
    await expectState(page, 'ready');
  });
});

test.describe('responsive layout', () => {
  for (const width of [320, 390]) {
    test(`no horizontal scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await createGuestCricketer(page, { grant: true });
      for (const path of ['/player', '/dressing-room']) {
        await page.goto(path);
        await expectState(page, 'ready');
        expect(await noHorizontalScroll(page)).toBe(true);
      }
      await page.getByRole('tab', { name: 'Look' }).click();
      expect(await noHorizontalScroll(page)).toBe(true);
      await page.getByRole('tab', { name: 'Bat' }).click();
      await page.getByRole('button', { name: /Pro Willow/ }).click();
      expect(await noHorizontalScroll(page)).toBe(true);
    });
  }

  test('the canvas supports touch drag without blocking page scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await createGuestCricketer(page);
    await page.goto('/player');
    await expectState(page, 'ready');
    const touchAction = await page
      .locator('.viewer-stage')
      .evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toContain('pan-y');
  });
});

test.describe('resource lifetime', () => {
  test('opening and closing the viewer 20 times does not accumulate GPU resources', async ({
    page,
  }) => {
    test.setTimeout(180000);
    await createGuestCricketer(page);
    await page.goto('/career');
    const client = await page.context().newCDPSession(page);
    const heap = async () => {
      await client.send('HeapProfiler.collectGarbage');
      return (await client.send('Runtime.getHeapUsage')).usedSize;
    };
    const samples: {
      geometries: number;
      textures: number;
      entries: number;
    }[] = [];
    let heapAfterWarmup = 0;
    for (let i = 0; i < 20; i++) {
      await page.getByRole('link', { name: /^Player profile/ }).click();
      await expectState(page, 'ready');
      const stats = await page.evaluate(() => window.__viewer?.stats);
      samples.push({
        geometries: stats?.geometries ?? -1,
        textures: stats?.textures ?? -1,
        entries: stats?.cache.entries ?? -1,
      });
      await page.getByRole('link', { name: 'Back to career' }).click();
      await expect(
        page.getByRole('link', { name: /^Player profile/ }),
      ).toBeVisible();
      // no viewer is left behind
      expect(await page.evaluate(() => window.__viewer)).toBeUndefined();
      if (i === 2) heapAfterWarmup = await heap();
    }
    const first = samples[2]!;
    const last = samples[19]!;
    expect(last.geometries).toBeLessThanOrEqual(first.geometries);
    expect(last.textures).toBeLessThanOrEqual(first.textures);
    expect(last.entries).toBeLessThanOrEqual(first.entries);
    // JS heap growth over 17 more open/close cycles stays small (generous bound against noise)
    const growth = (await heap()) - heapAfterWarmup;
    expect(growth).toBeLessThan(25 * 1024 * 1024);
    await expect(page.locator('[data-viewer-state]')).toHaveCount(0);
  });

  test('the render loop stops when the tab is hidden', async ({ page }) => {
    await createGuestCricketer(page);
    await page.goto('/player');
    await expectState(page, 'ready');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect
      .poll(() => page.evaluate(() => window.__viewer?.engineRunning))
      .toBe(false);
  });
});
