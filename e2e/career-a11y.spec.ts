import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const WEB = 'http://localhost:3300';
const API = 'http://localhost:4300/api/v1';
const headers = { origin: WEB, 'content-type': 'application/json' };

async function player(page: Page) {
  await page.request.post(`${API}/auth/guest`, { headers, data: {} });
  const key =
    `a11y${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(
      32,
      'x',
    );
  const r = await page.request.post(`${API}/player`, {
    headers: { ...headers, 'idempotency-key': key },
    data: {
      displayName: 'Access Ace',
      countryCode: 'IN',
      jerseyNumber: 5,
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
    },
  });
  expect(r.status()).toBe(201);
}

const PAGES = [
  ['/career', 'Access Ace'],
  ['/career/fixtures', 'Fixtures'],
  ['/career/progression', 'Career progression'],
  ['/career/objectives', 'Objectives'],
  ['/career/events', 'Career events'],
  ['/career/history', 'Career history'],
  ['/match/preparation', 'Match preparation'],
  ['/training', 'Training'],
] as const;

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 360, height: 780 },
]) {
  test(`career pages have no serious accessibility violations at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await player(page);
    for (const [path, heading] of PAGES) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: heading, level: 1 }),
      ).toBeVisible();
      await page.waitForTimeout(300);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      );
      expect(
        serious.map(
          (v) =>
            `${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 120)}`,
        ),
        path,
      ).toEqual([]);
      // one h1, and headings never skip a level
      const levels = await page.$$eval('main h1, main h2, main h3', (hs) =>
        hs.map((h) => Number(h.tagName[1])),
      );
      expect(levels.filter((l) => l === 1)).toHaveLength(1);
      for (let i = 1; i < levels.length; i++)
        expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
    }
  });
}

test('the career hub is operable from the keyboard with visible focus, and honours reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await player(page);
  await page.goto('/career');
  await expect(
    page.getByRole('heading', { name: 'Access Ace', level: 1 }),
  ).toBeVisible();
  const reached = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        text: (el.getAttribute('aria-label') ?? el.textContent ?? '')
          .trim()
          .slice(0, 30),
        outline: style.outlineStyle !== 'none' && style.outlineWidth !== '0px',
      };
    });
    if (info?.text) {
      reached.add(info.text);
      expect(info.outline, `focus ring on "${info.text}"`).toBe(true);
    }
  }
  expect([...reached].some((t) => t.startsWith('PREPARE MATCH'))).toBe(true);
  // reduced motion: bars have no transition and skeletons do not animate
  const transition = await page
    .locator('.progress-fill')
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(transition).toMatch(/^0s/);
  // progress is exposed as text too, never only as a coloured bar
  const bar = page.getByRole('progressbar', { name: 'Experience this level' });
  await expect(bar).toHaveAttribute('aria-valuetext', /XP/);
});

test('training pages (hub, drill, result, history) have no serious accessibility violations and are keyboard operable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await player(page);
  const check = async (label: string) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const serious = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    );
    expect(
      serious.map(
        (v) =>
          `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 120)}`,
      ),
      label,
    ).toEqual([]);
    const levels = await page.$$eval('main h1, main h2, main h3', (hs) =>
      hs.map((h) => Number(h.tagName[1])),
    );
    expect(
      levels.filter((l) => l === 1),
      `${label} h1`,
    ).toHaveLength(1);
    for (let i = 1; i < levels.length; i++)
      expect(
        levels[i]! - levels[i - 1]!,
        `${label} headings`,
      ).toBeLessThanOrEqual(1);
  };
  await page.goto('/training');
  await expect(
    page.getByRole('heading', { name: 'Training', level: 1 }),
  ).toBeVisible();
  await check('/training');
  await page.getByRole('tab', { name: 'Bowling' }).click();
  await check('/training (bowling tab)');
  await page.goto('/training/training.batting.timing');
  await expect(
    page.getByRole('button', { name: /START TRAINING/ }),
  ).toBeVisible();
  await check('/training/:id');
  // keyboard: focus the start button and activate it
  await page.getByRole('button', { name: /START TRAINING/ }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'TRAINING COMPLETE' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'TRAINING COMPLETE' }),
  ).toBeFocused();
  await check('training result');
  const bar = page.getByRole('progressbar', {
    name: 'Timing progress to next point',
  });
  await expect(bar).toHaveAttribute('aria-valuetext', /XP/);
  await page.goto('/training/history');
  await expect(
    page.getByRole('heading', { name: 'Training history' }),
  ).toBeVisible();
  await check('/training/history');
  await page.goto('/player');
  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
});
