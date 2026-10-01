import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { arrange, withDb } from './support/db';

const WEB = 'http://localhost:3300';
const API = 'http://localhost:4300/api/v1';
const headers = { origin: WEB, 'content-type': 'application/json' };
const TIMING = 'training.batting.timing';

async function newPlayer(
  page: Page,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const g = await page.request.post(`${API}/auth/guest`, { headers, data: {} });
  expect(g.status()).toBe(201);
  const key =
    `tr${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(
      32,
      'x',
    );
  const r = await page.request.post(`${API}/player`, {
    headers: { ...headers, 'idempotency-key': key },
    data: {
      displayName: 'Train Hero',
      countryCode: 'IN',
      jerseyNumber: 18,
      battingHand: 'right',
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
      ...overrides,
    },
  });
  expect(r.status()).toBe(201);
  return (await r.json()).data.player.summary.id as string;
}
const hub = async (page: Page) =>
  (await (await page.request.get(`${API}/training`)).json()).data.hub;
const profile = async (page: Page) =>
  (await (await page.request.get(`${API}/player`)).json()).data.player;
const home = async (page: Page) =>
  (await (await page.request.get(`${API}/career/home`)).json()).data.home;
const sessionCount = (playerId: string) =>
  withDb(async (q) =>
    Number(
      (
        await q(
          'SELECT count(*)::int AS n FROM training_sessions WHERE player_id = $1',
          [playerId],
        )
      )[0]!.n,
    ),
  );
const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );

test.describe('Training', () => {
  test('career → train → timing drill → result → career shows the change, and it persists', async ({
    page,
  }) => {
    const playerId = await newPlayer(page);
    await page.goto('/career');
    await expect(
      page.getByRole('heading', { name: 'Train Hero', level: 1 }),
    ).toBeVisible();
    await page.getByRole('link', { name: /^Training/ }).click();
    await expect(page).toHaveURL(/\/training$/);
    await expect(
      page.getByRole('heading', { name: 'Training', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Player readiness')).toBeVisible();
    await expect(page.getByText('Recommended training')).toBeVisible();

    await page
      .getByRole('link', { name: /Timing Drill/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/training/${TIMING}$`));
    // preview before committing
    await expect(page.getByText('Skills you will train')).toBeVisible();
    await expect(page.getByText('+32 XP')).toBeVisible();
    await expect(page.getByText('60 coins').first()).toBeVisible();
    await expect(page.getByText('Fatigue', { exact: true })).toBeVisible();
    const before = await profile(page);

    await page.getByRole('button', { name: /START TRAINING/ }).click();
    await expect(
      page.getByRole('heading', { name: 'TRAINING COMPLETE' }),
    ).toBeVisible();
    await expect(page.getByText('Timing XP')).toBeVisible();
    await expect(page.getByText('+32').first()).toBeVisible();
    await expect(page.getByText('-60')).toBeVisible();
    await expect(page.getByText('2,440 left')).toBeVisible();
    await expect(page.getByText(/^0 → \d+$/)).toBeVisible();

    const after = await profile(page);
    expect(after.xp).toBeGreaterThan(before.xp);
    expect(after.fatigue).toBeGreaterThan(0);
    expect(await sessionCount(playerId)).toBe(1);

    await page.getByRole('link', { name: 'BACK TO CAREER' }).click();
    await expect(page).toHaveURL(/\/career$/);
    await expect(page.getByText(/Last: Timing Drill/)).toBeVisible();
    await expect(
      page.getByLabel('Currencies').getByText('2,440'),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Last: Timing Drill/)).toBeVisible();
    await expect(
      page.getByLabel('Currencies').getByText('2,440'),
    ).toBeVisible();
    const h = await home(page);
    expect(h.progression.fatigue).toBe(after.fatigue);
    expect((await hub(page)).lastSession.name).toBe('Timing Drill');

    // history lists it
    await page.goto('/training/history');
    await expect(
      page.getByRole('heading', { name: 'Training history' }),
    ).toBeVisible();
    await expect(page.getByText('Timing Drill')).toBeVisible();
    await expect(page.getByText(/Timing XP \+32/)).toBeVisible();
  });

  test('bowling and physical drills work too', async ({ page }) => {
    await newPlayer(page, {
      displayName: 'All Rounder',
      primaryRole: 'batting_all_rounder',
      bowlingStyle: 'off_spin',
    });
    for (const [id, title, label] of [
      ['training.bowling.accuracy', 'Bowling Accuracy', 'Accuracy XP'],
      ['training.physical.agility', 'Agility Training', 'Agility XP'],
    ] as const) {
      await page.goto(`/training/${id}`);
      await expect(
        page.getByRole('heading', { name: title, level: 1 }),
      ).toBeVisible();
      await page.getByRole('button', { name: /START TRAINING/ }).click();
      await expect(
        page.getByRole('heading', { name: 'TRAINING COMPLETE' }),
      ).toBeVisible();
      await expect(page.getByText(label)).toBeVisible();
    }
  });

  test('level-up is shown and persisted', async ({ page }) => {
    const playerId = await newPlayer(page);
    await arrange(playerId, { level: 4, xp: 1310 }); // L4 needs 1,318 + a little: 25 XP crosses it
    await page.goto(`/training/${TIMING}`);
    await page.getByRole('button', { name: /START TRAINING/ }).click();
    await expect(page.getByText('LEVEL UP!')).toBeVisible();
    await expect(
      page.getByText('Level 5', { exact: false }).first(),
    ).toBeVisible();
    expect((await profile(page)).summary.level).toBe(5);
    await page.goto('/career');
    await expect(page.getByText('LVL', { exact: true }).first()).toBeVisible();
    expect((await home(page)).progression.level).toBe(5);
    await page.goto('/training/history');
    await expect(page.getByText(/Level up/)).toBeVisible();
  });

  test('skill-up shows the arrow and the new value reaches the profile', async ({
    page,
  }) => {
    const playerId = await newPlayer(page);
    await arrange(playerId, {
      attrs: { batting_timing: 52 },
      skillXp: { 'batting.timing': 270 },
    }); // needs 277
    await page.goto(`/training/${TIMING}`);
    await page.getByRole('button', { name: /START TRAINING/ }).click();
    await expect(page.getByText('Timing 52 → 53')).toBeVisible();
    expect((await profile(page)).attributes.batting.timing).toBe(53);
    await page.goto('/player');
    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: 'Timing progress to next point' }),
    ).toBeVisible();
    // only skills that changed get an arrow
    await page.goto(`/training/${TIMING}`);
    await page.getByRole('button', { name: /START TRAINING/ }).click();
    await expect(page.getByText('TRAINING COMPLETE')).toBeVisible();
    await expect(page.getByText(/Timing 5\d → 5\d/)).toHaveCount(0);
  });

  test('without enough coins the drill cannot start and nothing changes', async ({
    page,
  }) => {
    const playerId = await newPlayer(page);
    await arrange(playerId, { coins: 59 });
    await page.goto(`/training/${TIMING}`);
    await expect(
      page.getByText('Requires 60 coins. You have 59'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /START TRAINING/ }),
    ).toBeDisabled();
    expect(await sessionCount(playerId)).toBe(0);
    // the drill card also says why
    await page.goto('/training');
    await expect(
      page.getByText('Requires 60 coins. You have 59').first(),
    ).toBeVisible();
    await arrange(playerId, { coins: 60 });
    await page.goto(`/training/${TIMING}`);
    await page.getByRole('button', { name: /START TRAINING/ }).click();
    await expect(page.getByText('0 left')).toBeVisible();
  });

  test('high fatigue warns, blocks drills, and rest is always available', async ({
    page,
  }) => {
    const playerId = await newPlayer(page);
    await arrange(playerId, { fatigue: 80 });
    await page.goto('/training');
    await expect(page.getByText(/HIGH FATIGUE/)).toBeVisible();
    await expect(page.getByText('Recommended training')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'REST' }).first(),
    ).toBeVisible();

    await arrange(playerId, { fatigue: 97 });
    await page.goto('/training');
    await expect(page.getByText(/too tired for drills/)).toBeVisible();
    await expect(page.getByText('Too tired: rest first').first()).toBeVisible();
    await page.goto(`/training/${TIMING}`);
    await expect(
      page.getByRole('button', { name: /START TRAINING/ }),
    ).toBeDisabled();

    await page.goto('/training/training.physical.rest');
    await page.getByRole('button', { name: 'REST' }).click();
    await expect(
      page.getByRole('heading', { name: 'REST COMPLETE' }),
    ).toBeVisible();
    expect((await profile(page)).fatigue).toBeLessThan(97);
    expect((await hub(page)).recovery.available).toBe(true);
  });

  test('a maxed skill and a locked drill are explained, not broken', async ({
    page,
  }) => {
    const playerId = await newPlayer(page);
    await arrange(playerId, {
      attrs: { batting_defence: 100, batting_technique: 100 },
    });
    await page.goto('/training');
    await expect(page.getByText('Already at maximum')).toBeVisible();
    await expect(page.getByText('Requires level 3')).toBeVisible();
    await page.goto('/training/training.batting.defence');
    await expect(page.getByText('MAX').first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /START TRAINING/ }),
    ).toBeDisabled();
    await page.goto('/training/training.bowling.variation');
    await expect(page.getByText('Requires level 5')).toBeVisible();
  });

  test('a double click or replayed request trains exactly once', async ({
    page,
  }) => {
    const playerId = await newPlayer(page);
    await page.goto(`/training/${TIMING}`);
    const button = page.getByRole('button', { name: /START TRAINING/ });
    await button.dblclick();
    await expect(
      page.getByRole('heading', { name: 'TRAINING COMPLETE' }),
    ).toBeVisible();
    expect(await sessionCount(playerId)).toBe(1);
    // the same key replayed through the API: same answer, no second charge
    const key = 'e2ereplaykey0123456789abcdef0123';
    const first = await page.request.post(`${API}/training/${TIMING}`, {
      headers: { ...headers, 'idempotency-key': key },
      data: {},
    });
    const second = await page.request.post(`${API}/training/${TIMING}`, {
      headers: { ...headers, 'idempotency-key': key },
      data: {},
    });
    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    expect((await second.json()).data.result.sessionId).toBe(
      (await first.json()).data.result.sessionId,
    );
    expect((await second.json()).data.result.replayed).toBe(true);
    expect(await sessionCount(playerId)).toBe(2);
    expect((await home(page)).currencies[0].balance).toBe(2500 - 120);
  });

  test('simultaneous requests are safe: only affordable ones succeed', async ({
    page,
  }) => {
    const playerId = await newPlayer(page);
    await arrange(playerId, { coins: 60 });
    const post = () =>
      page.request.post(`${API}/training/${TIMING}`, {
        headers: {
          ...headers,
          'idempotency-key': `race${Math.random().toString(36).slice(2)}0123456789abcdef`,
        },
        data: {},
      });
    const results = await Promise.all([post(), post(), post()]);
    expect(results.map((r) => r.status()).sort()).toEqual([200, 409, 409]);
    expect(await sessionCount(playerId)).toBe(1);
    expect((await home(page)).currencies[0].balance).toBe(0);
  });

  test('an API failure shows a retry message and keeps the player where they are', async ({
    page,
  }) => {
    const playerId = await newPlayer(page);
    await page.goto(`/training/${TIMING}`);
    await page.route('**/api/v1/training/training.batting.timing', (route) =>
      route.request().method() === 'POST' ? route.abort() : route.continue(),
    );
    await page.getByRole('button', { name: /START TRAINING/ }).click();
    await expect(
      page.getByText('Could not reach the server. Try again.'),
    ).toBeVisible();
    expect(await sessionCount(playerId)).toBe(0);
    await page.unroute('**/api/v1/training/training.batting.timing');
    await page.getByRole('button', { name: /START TRAINING/ }).click();
    await expect(
      page.getByRole('heading', { name: 'TRAINING COMPLETE' }),
    ).toBeVisible();
    expect(await sessionCount(playerId)).toBe(1);
  });

  test('routes are guarded', async ({ page }) => {
    for (const route of [
      '/training',
      `/training/${TIMING}`,
      '/training/history',
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(`${WEB}/`);
    }
    await page.request.post(`${API}/auth/guest`, { headers, data: {} });
    for (const route of ['/training', '/training/history']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/create-player$/);
    }
  });

  for (const width of [320, 390]) {
    test(`mobile layout at ${width}px: cards fit and nothing scrolls sideways`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await newPlayer(page);
      for (const path of [
        '/training',
        `/training/${TIMING}`,
        '/training/history',
      ]) {
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        expect(await noHorizontalScroll(page)).toBe(true);
      }
      await page.goto('/training');
      await page.getByRole('tab', { name: 'Bowling' }).click();
      await page.getByRole('tab', { name: 'Physical' }).click();
      expect(await noHorizontalScroll(page)).toBe(true);
      await page.goto(`/training/${TIMING}`);
      await page.getByRole('button', { name: /START TRAINING/ }).click();
      await expect(
        page.getByRole('heading', { name: 'TRAINING COMPLETE' }),
      ).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
    });
  }

  test('a high-level player still gets a working hub', async ({ page }) => {
    const playerId = await newPlayer(page);
    await arrange(playerId, { level: 50, xp: 0 });
    await page.goto('/training');
    await expect(page.getByText('MAX').first()).toBeVisible();
    await page.goto(`/training/${TIMING}`);
    await page.getByRole('button', { name: /START TRAINING/ }).click();
    await expect(
      page.getByRole('heading', { name: 'TRAINING COMPLETE' }),
    ).toBeVisible();
    expect((await profile(page)).summary.level).toBe(50);
  });
});
