import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const API = 'http://localhost:4300';
const PASSWORD = 'correct horse battery';
const unique = (label: string) =>
  `e2e-${label}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}@example.com`;

const getMe = async (page: Page) =>
  (await (await page.request.get(`${API}/api/v1/me`)).json()).data.user as {
    id: string;
    accountType: string;
    hasCricketer: boolean;
  };
const getPlayer = async (page: Page) => {
  const response = await page.request.get(`${API}/api/v1/player`);
  return response.status() === 200 ? (await response.json()).data.player : null;
};

async function continueAsGuest(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  await expect(page).toHaveURL(/\/create-player$/);
  await expect(page.getByRole('heading', { name: 'Identity' })).toBeVisible();
}

async function fillIdentity(page: Page, name: string, jersey = '18') {
  await page.getByLabel('Player name').fill(name);
  await page.getByLabel('Country').selectOption('IN');
  await page.getByLabel('Jersey number').fill(jersey);
}
const next = (page: Page) =>
  page.getByRole('button', { name: 'Next', exact: true }).click();

async function chooseStyle(
  page: Page,
  role: RegExp,
  hand = 'Left-handed',
  bowling: string | null = 'Off spin',
) {
  await page.getByRole('radio', { name: role }).check();
  await page.getByRole('radio', { name: hand }).check();
  if (bowling)
    await page.getByRole('radio', { name: bowling, exact: true }).check();
}

/** Walks the whole wizard up to (and including) the review step. */
async function walkToReview(page: Page, name = 'Naveen Kumar') {
  await fillIdentity(page, name);
  await next(page);
  await expect(
    page.getByRole('heading', { name: 'Cricket style' }),
  ).toBeVisible();
  await chooseStyle(page, /^Top-order Batter/);
  await next(page);
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await page.getByRole('radio', { name: 'Tone 6' }).check();
  await page.getByRole('radio', { name: 'Curly' }).check();
  await next(page);
  await expect(
    page.getByRole('heading', { name: 'Personality' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: /^Calm/ }).check();
  await next(page);
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
}

test('guest creates a cricketer, refreshes, upgrades the account and keeps the player', async ({
  page,
}) => {
  await continueAsGuest(page);
  const guest = await getMe(page);
  expect(guest.hasCricketer).toBe(false);
  await expect(page.getByText('Step 1 of 5')).toBeVisible();

  await fillIdentity(page, 'Naveen Kumar');
  await next(page);
  await chooseStyle(page, /^Top-order Batter/);
  // starting strengths preview is exact and visible before committing
  await expect(
    page.getByRole('region', { name: 'Starting strengths' }),
  ).toContainText('Overall');
  await next(page);
  await page.getByRole('radio', { name: 'Tone 6' }).check();
  await page.getByRole('radio', { name: 'Curly' }).check();
  await page.getByRole('radio', { name: 'Full beard' }).check();
  await next(page);
  await page.getByRole('radio', { name: /^Calm/ }).check();
  await next(page);

  // review shows everything chosen, and the starter kit and career start
  await expect(page.getByText('Naveen Kumar', { exact: true })).toBeVisible();
  await expect(page.getByText('Left-handed')).toBeVisible();
  await expect(page.getByText('Off spin')).toBeVisible();
  await expect(page.getByText('Starter equipment')).toBeVisible();
  await expect(page.getByText('River Hawks Academy')).toBeVisible();
  await page.getByRole('button', { name: 'START MY CAREER' }).click();

  await expect(
    page.getByRole('heading', { name: 'WELCOME TO YOUR CAREER' }),
  ).toBeVisible();
  await expect(page.getByText('Naveen Kumar', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'ENTER CAREER' }).click();
  await expect(page).toHaveURL(/\/career$/);
  await expect(
    page.getByRole('heading', { name: 'Naveen Kumar' }),
  ).toBeVisible();

  const me = await getMe(page);
  expect(me).toMatchObject({ id: guest.id, hasCricketer: true });
  const player = await getPlayer(page);
  expect(player.summary).toMatchObject({
    displayName: 'Naveen Kumar',
    jerseyNumber: 18,
    battingHand: 'left',
    bowlingStyle: 'off_spin',
    primaryRole: 'top_order_batter',
    level: 1,
    careerTier: 'academy',
  });
  expect(player.equipped).toHaveLength(7);
  expect(player.appearance).toMatchObject({
    skinToneId: 'appearance.skin.tone_06',
    hairStyleId: 'appearance.hair.curly_01',
    beardStyleId: 'appearance.beard.full_01',
  });

  // refresh keeps the player and never reopens the wizard
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Naveen Kumar' }),
  ).toBeVisible();
  await page.goto('/create-player');
  await expect(page).toHaveURL(/\/career$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/career$/);

  // upgrade the guest: same user, same player
  await page.goto('/account/upgrade');
  await page.getByLabel('Email').fill(unique('guest-keeps'));
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Save my progress' }).click();
  await expect(page).toHaveURL(/\/account\?upgraded=1/);
  expect(await getMe(page)).toMatchObject({
    id: guest.id,
    accountType: 'registered',
    hasCricketer: true,
  });
  expect((await getPlayer(page)).summary.id).toBe(player.summary.id);
});

test('registered account: create, sign out, sign in, player persists', async ({
  page,
}) => {
  const email = unique('registered-creator');
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/create-player$/);
  await walkToReview(page, 'Registered Rahul');
  await page.getByRole('button', { name: 'START MY CAREER' }).click();
  await expect(
    page.getByRole('heading', { name: 'WELCOME TO YOUR CAREER' }),
  ).toBeVisible();
  const created = await getPlayer(page);

  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/career');
  await expect(page).toHaveURL(/\/$/); // signed out: back to the entry screen

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/career$/); // has a cricketer: straight to career
  await expect(
    page.getByRole('heading', { name: 'Registered Rahul' }),
  ).toBeVisible();
  expect((await getPlayer(page)).summary.id).toBe(created.summary.id);
});

test('each step validates before continuing, and Back keeps your choices', async ({
  page,
}) => {
  await continueAsGuest(page);
  await next(page);
  const name = page.getByLabel('Player name');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Identity' })).toBeVisible(); // did not advance

  await name.fill('ab');
  await page.getByLabel('Jersey number').fill('100');
  await next(page);
  await expect(page.getByText(/Use 3 to 24 characters/)).toBeVisible();
  await expect(
    page.getByText(/Enter a whole number from 0 to 99/),
  ).toBeVisible();

  await fillIdentity(page, 'नवीन कुमार', '7'); // Devanagari name is welcome
  await next(page);
  await expect(
    page.getByRole('heading', { name: 'Cricket style' }),
  ).toBeVisible();

  // role + hand + (required) bowling style must be chosen
  await next(page);
  await expect(page.getByText('Choose a role.')).toBeVisible();
  await page.getByRole('radio', { name: /^Fast Bowler/ }).check();
  await page.getByRole('radio', { name: 'Right-handed' }).check();
  await next(page);
  await expect(page.getByText(/need a bowling style/)).toBeVisible();
  await expect(page.getByRole('radio', { name: 'No bowling' })).toHaveCount(0); // not offered for bowling roles
  await expect(page.getByRole('radio', { name: 'Leg spin' })).toHaveCount(0); // incompatible style not offered
  await page.getByRole('radio', { name: 'Right-arm fast' }).check();
  await next(page);

  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('radio', { name: /^Fast Bowler/ })).toBeChecked();
  await expect(
    page.getByRole('radio', { name: 'Right-arm fast' }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Player name')).toHaveValue('नवीन कुमार');
  await expect(page.getByLabel('Jersey number')).toHaveValue('7');
  // switching to a role that cannot use the chosen style clears it instead of keeping an invalid pair
  await next(page);
  await page.getByRole('radio', { name: /^Spin Bowler/ }).check();
  await expect(page.getByRole('radio', { name: 'Right-arm fast' })).toHaveCount(
    0,
  );
  await next(page);
  await expect(page.getByText(/need a bowling style/)).toBeVisible();

  // nothing was created along the way
  expect((await getMe(page)).hasCricketer).toBe(false);
});

test('double clicking START MY CAREER (or two tabs) creates exactly one cricketer', async ({
  page,
  context,
}) => {
  await continueAsGuest(page);
  await walkToReview(page, 'Double Click');
  const second = await context.newPage();
  await second.goto('/create-player');
  await walkToReview(second, 'Double Click');

  // two tabs and a double click, all at once
  await Promise.all([
    page.getByRole('button', { name: 'START MY CAREER' }).dblclick(),
    second.getByRole('button', { name: 'START MY CAREER' }).click(),
  ]);
  await expect
    .poll(async () => (await getPlayer(page))?.summary.displayName)
    .toBe('Double Click');
  const player = await getPlayer(page);
  // whichever tab lost lands on career (already exists) rather than showing an error
  await expect(
    second
      .getByRole('heading', { name: /WELCOME TO YOUR CAREER|Double Click/ })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole('heading', { name: /WELCOME TO YOUR CAREER|Double Click/ })
      .first(),
  ).toBeVisible();
  expect((await getPlayer(second)).summary.id).toBe(player.summary.id);
  const me = await getMe(page);
  expect(me.hasCricketer).toBe(true);
});

test('server-side failure keeps every choice and allows a retry', async ({
  page,
}) => {
  await continueAsGuest(page);
  await walkToReview(page, 'Retry Ravi');
  let blocked = true;
  await page.route(`${API}/api/v1/player`, async (route) => {
    if (route.request().method() === 'POST' && blocked) {
      blocked = false;
      return route.abort('failed'); // simulated network failure before the server sees it
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'START MY CAREER' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: /reach the server/ }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
  await expect(page.getByText('Retry Ravi', { exact: true })).toBeVisible(); // choices intact
  await page.getByRole('button', { name: 'START MY CAREER' }).click();
  await expect(
    page.getByRole('heading', { name: 'WELCOME TO YOUR CAREER' }),
  ).toBeVisible();
});

test('wizard is usable on a phone: no horizontal scroll, tappable controls, labelled groups', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await continueAsGuest(page);
  const noOverflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
  const smallTargets = () =>
    page.evaluate(() => {
      const els = [
        ...document.querySelectorAll<HTMLElement>(
          '.wizard button, .wizard select, .wizard .choice-card, .wizard input[type=number], .wizard input[type=text]',
        ),
      ];
      return els
        .filter(
          (el) =>
            el.getBoundingClientRect().height > 0 &&
            el.getBoundingClientRect().height < 40,
        )
        .map((el) => el.className || el.tagName);
    });
  await expect(page.getByRole('group', { name: /Step|Creation/ })).toHaveCount(
    0,
  );
  expect(await noOverflow()).toBeTruthy();
  expect(await smallTargets()).toEqual([]);
  await fillIdentity(page, 'Mobile Mohan');
  await next(page);
  await expect(page.getByRole('group', { name: 'Role' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Batting hand' })).toBeVisible();
  await chooseStyle(page, /^Finisher/, 'Right-handed', null);
  expect(await noOverflow()).toBeTruthy();
  expect(await smallTargets()).toEqual([]);
  await next(page);
  await expect(page.getByRole('group', { name: 'Skin tone' })).toBeVisible();
  expect(await noOverflow()).toBeTruthy();
  await next(page);
  await page.getByRole('radio', { name: /^Entertainer/ }).check();
  expect(await noOverflow()).toBeTruthy();
  await next(page);
  expect(await noOverflow()).toBeTruthy();
  // keyboard: the step heading takes focus after navigation
  await expect(page.getByRole('heading', { name: 'Review' })).toBeFocused();
});
