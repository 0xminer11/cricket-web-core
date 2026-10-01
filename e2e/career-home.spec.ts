import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const WEB = 'http://localhost:3300';
const API = 'http://localhost:4300/api/v1';
const PASSWORD = 'correct horse battery';
const headers = { origin: WEB, 'content-type': 'application/json' };
const unique = (label: string) =>
  `e2e-${label}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}@example.com`;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function createCricketer(
  page: Page,
  overrides: Json = {},
  guest = true,
): Promise<void> {
  if (guest) {
    const g = await page.request.post(`${API}/auth/guest`, {
      headers,
      data: {},
    });
    expect(g.status()).toBe(201);
  }
  const key =
    `career${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(
      32,
      'x',
    );
  const r = await page.request.post(`${API}/player`, {
    headers: { ...headers, 'idempotency-key': key },
    data: {
      displayName: 'Career Hero',
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
}
const apiHome = async (page: Page): Promise<Json> =>
  (await (await page.request.get(`${API}/career/home`)).json()).data.home;

/** Serve the real Career Home response after letting a test reshape it (empty states, extremes). */
async function reshapeHome(page: Page, mutate: (home: Json) => void) {
  await page.route('**/api/v1/career/home', async (route: Route) => {
    const response = await route.fetch();
    const json = await response.json();
    mutate(json.data.home);
    await route.fulfill({ response, json });
  });
}
const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );
const mainNav = (page: Page) =>
  page.getByRole('navigation', { name: /^Main navigation/ });

test.describe('Career Home', () => {
  test('guest arrives at a complete hub and can move around the game and back', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await createCricketer(page);
    await page.goto('/career');

    // who am I / how good am I
    await expect(
      page.getByRole('heading', { name: 'Career Hero', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Top Order Batter').first()).toBeVisible();
    await expect(page.getByText('OVR', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('LVL', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: 'Experience this level' }),
    ).toBeVisible();
    await expect(page.getByText('River Hawks Academy').first()).toBeVisible();
    // what have I earned
    await expect(
      page.getByLabel('Currencies').getByText('2,500'),
    ).toBeVisible();
    await expect(page.getByLabel('Currencies').getByText('Gems')).toBeVisible();
    // what is next / what should I do
    const next = page.getByRole('region', { name: 'Next match' });
    await expect(next.getByText('Metro Stallions')).toBeVisible();
    await expect(next.getByText('2 Overs')).toBeVisible();
    await expect(
      next.getByRole('link', { name: 'PREPARE MATCH' }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Upcoming' })).toBeVisible();
    // lightweight: no 3D at all on the hub
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(requests.filter((u) => /\.glb(\?|$)/.test(u))).toEqual([]);
    expect(
      await page.evaluate(
        () => (window as unknown as { __viewer?: unknown }).__viewer,
      ),
    ).toBeUndefined();
    // a guest is gently offered an account, without being blocked
    await expect(
      page.getByRole('link', { name: 'Protect Progress' }),
    ).toBeVisible();

    // Training
    await page.getByRole('link', { name: /^Training/ }).click();
    await expect(page).toHaveURL(/\/training$/);
    await expect(
      page.getByRole('heading', { name: 'Training', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Timing Drill').first()).toBeVisible();
    await mainNav(page).getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/career$/);

    // Dressing room
    await page.getByRole('link', { name: /^Dressing room/ }).click();
    await expect(page).toHaveURL(/\/dressing-room$/);
    await mainNav(page).getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/career$/);

    // Player profile
    await page.getByRole('link', { name: /^Player profile/ }).click();
    await expect(page).toHaveURL(/\/player$/);
    await mainNav(page).getByRole('link', { name: 'Home' }).click();
    await expect(
      page.getByRole('heading', { name: 'Career Hero', level: 1 }),
    ).toBeVisible();

    // refresh keeps the same career, and the server state is unchanged by browsing
    const before = await apiHome(page);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Career Hero', level: 1 }),
    ).toBeVisible();
    expect(await apiHome(page)).toEqual(before);
    // the active section is marked
    await expect(
      mainNav(page).getByRole('link', { name: 'Home' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('prepare match opens an honest placeholder, never a fake result', async ({
    page,
  }) => {
    await createCricketer(page);
    await page.goto('/career');
    await page.getByRole('link', { name: 'PREPARE MATCH' }).click();
    await expect(page).toHaveURL(/\/match\/preparation$/);
    await expect(page.getByText('Metro Stallions').first()).toBeVisible();
    await expect(
      page.getByText(
        /Match gameplay will be enabled in the upcoming Match module/,
      ),
    ).toBeVisible();
    await expect(page.getByText('Equipped gear')).toBeVisible();
    await expect(page.getByRole('button', { name: /start|play/i })).toHaveCount(
      0,
    );
    await page.goto('/play');
    await expect(page).toHaveURL(/\/match\/preparation$/);
  });

  test('guest upgrade keeps the same career, team, currencies, gear and fixtures', async ({
    page,
  }) => {
    await createCricketer(page);
    await page.goto('/career');
    await expect(
      page.getByRole('heading', { name: 'Career Hero', level: 1 }),
    ).toBeVisible();
    const before = await apiHome(page);
    await page.getByRole('link', { name: 'Protect Progress' }).click();
    await expect(page).toHaveURL(/\/account\/upgrade$/);
    await page.getByLabel('Email').fill(unique('upgrade'));
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Save my progress' }).click();
    await expect(page).toHaveURL(/\/account\?upgraded=1/);
    await page.goto('/career');
    await expect(
      page.getByRole('heading', { name: 'Career Hero', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Protect Progress' }),
    ).toHaveCount(0);
    expect(await apiHome(page)).toEqual(before);
  });

  test('registered account: sign out, sign in, same career', async ({
    page,
  }) => {
    const email = unique('registered');
    const reg = await page.request.post(`${API}/auth/register`, {
      headers,
      data: { email, password: PASSWORD },
    });
    expect(reg.status()).toBe(201);
    await createCricketer(page, { displayName: 'Registered Ravi' }, false);
    await page.goto('/career');
    await expect(
      page.getByRole('heading', { name: 'Registered Ravi', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Protect Progress' }),
    ).toHaveCount(0);
    const before = await apiHome(page);

    await page.goto('/account');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.goto('/career');
    await expect(page).toHaveURL(/\/$/); // signed out: back to the entry screen

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/career$/);
    await expect(
      page.getByRole('heading', { name: 'Registered Ravi', level: 1 }),
    ).toBeVisible();
    expect(await apiHome(page)).toEqual(before);
  });

  test('routes are guarded: signed-out visitors go home, players without a cricketer go to creation', async ({
    page,
  }) => {
    for (const route of [
      '/career',
      '/career/fixtures',
      '/training',
      '/match/preparation',
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(`${WEB}/`);
    }
    const g = await page.request.post(`${API}/auth/guest`, {
      headers,
      data: {},
    });
    expect(g.status()).toBe(201);
    for (const route of ['/career', '/career/history', '/training']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/create-player$/);
    }
  });

  test('a failing Career Home request shows a retry and keeps the session', async ({
    page,
  }) => {
    await createCricketer(page);
    await page.route('**/api/v1/career/home', (route) => route.abort());
    await page.goto('/career');
    await expect(page.getByText("We couldn't load your career.")).toBeVisible();
    await expect(page.getByRole('link', { name: /^Account/ })).toBeVisible(); // still signed in
    await page.unroute('**/api/v1/career/home');
    await page.getByRole('button', { name: 'Try Again' }).click();
    await expect(
      page.getByRole('heading', { name: 'Career Hero', level: 1 }),
    ).toBeVisible();

    // a server error is an ordinary error, not a sign-out
    await page.route('**/api/v1/career/home', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'CAREER_DATA_UNAVAILABLE', message: 'x' },
        }),
      }),
    );
    await page.reload();
    await expect(page.getByText("We couldn't load your career.")).toBeVisible();
    await expect(page).toHaveURL(/\/career$/);
  });

  test('shows meaningful empty states: no fixture, no objectives, no event', async ({
    page,
  }) => {
    await createCricketer(page);
    await reshapeHome(page, (h) => {
      h.nextMatch = null;
      h.upcomingFixtures = [];
      h.objectives = [];
      h.careerEvent = null;
      h.recentMatches = [];
    });
    await page.goto('/career');
    await expect(page.getByText('No match scheduled.')).toBeVisible();
    await expect(
      page.getByText(
        /Your next fixture will appear here when the schedule is generated/,
      ),
    ).toBeVisible();
    await expect(page.getByText('Nothing else scheduled.')).toBeVisible();
    await expect(page.getByText('All goals complete.')).toBeVisible();
    await expect(page.getByText('Career event', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('region', { name: 'Recent' })).toHaveCount(0);
    await expect(page.getByText(/NaN|undefined|Infinity/)).toHaveCount(0);
  });

  test('handles extremes without layout breaks: max level, huge fans and currency, high fatigue, event, bowler', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await createCricketer(page);
    await reshapeHome(page, (h) => {
      h.player.primaryRole = 'fast_bowler';
      h.progression = {
        ...h.progression,
        level: 50,
        isMaxLevel: true,
        xpToNext: null,
        xp: 123456,
        fatigue: 82,
        readiness: 'exhausted',
        form: 91,
        formLabel: 'Excellent',
        formBand: 'excellent',
        formTrend: 'up',
      };
      h.career.fans = 1_500_000;
      h.career.reputation = 999;
      h.career.nextTier = null;
      h.career.tiers = h.career.tiers.map((t: Json) => ({
        ...t,
        status: t.id === 'international' ? 'current' : 'completed',
      }));
      h.currencies = [
        { code: 'coins', name: 'Coins', balance: 987_654_321 },
        { code: 'gems', name: 'Gems', balance: 12_345 },
      ];
      h.readiness = {
        status: 'caution',
        issues: [
          {
            code: 'FATIGUE_VERY_HIGH',
            severity: 'warning',
            message:
              'Your fatigue is very high and will hurt your performance.',
          },
        ],
      };
      h.stats = {
        ...h.stats,
        focus: 'bowling',
        matches: 120,
        bowling: {
          wickets: 412,
          economy: 6.42,
          average: 18.3,
          bestFigures: '6/21',
        },
      };
      h.careerEvent = {
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Extra Nets Session',
        description: 'The coach offers an optional focused session.',
        type: 'coach',
        status: 'pending',
        triggeredAt: new Date().toISOString(),
      };
    });
    await page.goto('/career');
    await expect(page.getByText('MAX LEVEL').first()).toBeVisible();
    await expect(page.getByText('1.5M')).toBeVisible();
    await expect(
      page.getByLabel('Currencies').getByText('987.6M'),
    ).toBeVisible();
    await expect(
      page.getByText(/Your fatigue is high\. Consider recovery/),
    ).toBeVisible();
    await expect(page.getByText('Extra Nets Session')).toBeVisible();
    await expect(page.getByText('Wickets', { exact: true })).toBeVisible();
    await expect(page.getByText('Runs', { exact: true })).toHaveCount(0); // bowler: no batting block
    await expect(page.getByText('999')).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await expect(page.getByText(/NaN|undefined|Infinity/)).toHaveCount(0);
  });

  test('a failed optional section degrades gracefully', async ({ page }) => {
    await createCricketer(page);
    await reshapeHome(page, (h) => {
      h.degraded = ['careerEvent'];
      h.careerEvent = null;
    });
    await page.goto('/career');
    await expect(page.getByText(/Some sections couldn't load/)).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Next match' }),
    ).toBeVisible();
  });

  test('the first-visit intro can be dismissed and stays dismissed', async ({
    page,
  }) => {
    await createCricketer(page);
    await page.goto('/career');
    await expect(
      page.getByText('Your career starts here', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(
      page.getByText('Your career starts here', { exact: false }),
    ).toHaveCount(0);
    await expect
      .poll(async () => (await apiHome(page)).onboarding.introCompleted)
      .toBe(true);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Career Hero', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText('Your career starts here', { exact: false }),
    ).toHaveCount(0);
  });

  test('career sections work: fixtures, progression, objectives, events, history', async ({
    page,
  }) => {
    await createCricketer(page);
    await page.goto('/career');
    await expect(
      page.getByRole('heading', { name: 'Career Hero', level: 1 }),
    ).toBeVisible();
    await mainNav(page).getByRole('link', { name: 'Career' }).click();
    await expect(
      page.getByRole('heading', { name: 'Career progression' }),
    ).toBeVisible();
    await expect(page.getByText(/nothing is guaranteed/)).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Career sections' })
      .getByRole('link', { name: 'Fixtures' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Fixtures', level: 1 }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('list')
        .getByText(/Metro Stallions/)
        .first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Completed' }).click();
    await expect(page.getByText('No completed matches yet.')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Career sections' })
      .getByRole('link', { name: 'Objectives' })
      .click();
    await expect(page.getByText('First Fifty')).toBeVisible();
    await expect(page.getByText('Reward: 400 coins')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Career sections' })
      .getByRole('link', { name: 'Events' })
      .click();
    await expect(page.getByText('No career events right now.')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Career sections' })
      .getByRole('link', { name: 'History' })
      .click();
    await expect(page.getByText('Career started')).toBeVisible();
    await expect(page.getByText('Joined River Hawks Academy')).toBeVisible();
  });

  for (const width of [320, 390]) {
    test(`phone layout at ${width}px: labelled bottom navigation and no horizontal scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await createCricketer(page);
      await page.goto('/career');
      await expect(
        page.getByRole('heading', { name: 'Career Hero', level: 1 }),
      ).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
      const nav = page.getByRole('navigation', {
        name: 'Main navigation (mobile)',
      });
      await expect(nav).toBeVisible();
      for (const label of ['Home', 'Play', 'Train', 'Player', 'Career'])
        await expect(
          nav.getByRole('link', { name: label, exact: true }),
        ).toBeVisible();
      // the next match comes before the secondary panels in the feed
      const order = await page.evaluate(() => {
        const y = (text: string) =>
          [...document.querySelectorAll('h2')]
            .find((h) => h.textContent?.trim() === text)
            ?.getBoundingClientRect().top ?? 0;
        return [
          y('Next match'),
          y('Career'),
          y('Objectives'),
          y('Career stats'),
        ];
      });
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      for (const path of [
        '/career/fixtures',
        '/career/progression',
        '/career/history',
        '/career/objectives',
        '/training',
        '/match/preparation',
      ]) {
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        expect(await noHorizontalScroll(page)).toBe(true);
      }
    });
  }

  test('desktop keeps a readable width and keyboard users can reach the main action', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await createCricketer(page);
    await page.goto('/career');
    await expect(
      page.getByRole('heading', { name: 'Career Hero', level: 1 }),
    ).toBeVisible();
    const width = await page
      .locator('main')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(1152 + 1);
    await page.getByRole('link', { name: 'PREPARE MATCH' }).focus();
    await expect(
      page.getByRole('link', { name: 'PREPARE MATCH' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/match\/preparation$/);
  });
});
