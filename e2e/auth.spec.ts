import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

const API = 'http://localhost:4300';
const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'a different passphrase';
const unique = (label: string) =>
  `e2e-${label}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}@example.com`;

/** Newest development-mailbox link of a kind for an address (dev/test API only, loopback only). */
async function latestLink(
  request: APIRequestContext,
  kind: 'verification' | 'password_reset',
  to: string,
): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.get(`${API}/api/v1/dev/emails`);
    const emails = (await response.json()).data.emails as Array<{
      kind: string;
      to: string;
      url: string;
    }>;
    const match = [...emails]
      .reverse()
      .find((m) => m.kind === kind && m.to.toLowerCase() === to.toLowerCase());
    if (match) return match.url;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No ${kind} email captured for ${to}`);
}

const me = async (page: Page) =>
  (await (await page.request.get(`${API}/api/v1/me`)).json()).data.user as {
    id: string;
    accountType: string;
    email: string | null;
    emailVerified: boolean;
  };

test('guest start, upgrade keeps the same account, verify, sign out and back in', async ({
  page,
  request,
}) => {
  await page.goto('/');
  // Nothing is created just by loading the page.
  await expect(
    page.getByRole('button', { name: 'Continue as Guest' }),
  ).toBeVisible();
  expect((await page.request.get(`${API}/api/v1/me`)).status()).toBe(401);

  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  await expect(page).toHaveURL(/\/create-player$/);
  await expect(
    page.getByRole('heading', { name: 'Create your cricketer' }),
  ).toBeVisible();
  await expect(
    page.getByText('Create an account to protect your progress.'),
  ).toBeVisible();

  // The session is an HttpOnly cookie; scripts and storage see no secret.
  const cookies = await page.context().cookies(API);
  const session = cookies.find((c) => c.name === 'cricketer_session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'cricketer_session',
  );
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).toBe('{}');

  // Reload: state is restored from /me, not from the browser.
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Create your cricketer' }),
  ).toBeVisible();
  const guest = await me(page);
  expect(guest.accountType).toBe('guest');

  // Upgrade
  const email = unique('upgrade');
  await page.goto('/account/upgrade');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Save my progress' }).click();
  await expect(page).toHaveURL(/\/account\?upgraded=1/);
  await expect(
    page.getByText('Account created. Your progress was kept.'),
  ).toBeVisible();
  const upgraded = await me(page);
  expect(upgraded.id).toBe(guest.id); // SAME user
  expect(upgraded).toMatchObject({ accountType: 'registered', email });
  expect(
    (await page.context().cookies(API)).find(
      (c) => c.name === 'cricketer_session',
    )?.value,
  ).not.toBe(session?.value); // session rotated

  // Verify via the (development) mailbox link
  const link = await latestLink(request, 'verification', email);
  expect(link).toContain('/verify-email#token=');
  await page.goto(link);
  await expect(
    page.getByText('Your email is verified. Thank you!'),
  ).toBeVisible();
  expect(page.url()).not.toContain('token='); // scrubbed from the address bar
  expect((await me(page)).emailVerified).toBe(true);

  // Sign out, then back in with the new credentials
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('button', { name: 'Continue as Guest' }),
  ).toBeVisible();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/create-player$/);
  expect((await me(page)).id).toBe(guest.id); // same account returned
});

test('invalid credentials show a generic message and accessible errors', async ({
  page,
}) => {
  await page.goto('/login');
  // client-side validation: fields are marked invalid and described
  await page.getByRole('button', { name: 'Sign in' }).click();
  const emailField = page.getByLabel('Email');
  await expect(emailField).toHaveAttribute('aria-invalid', 'true');
  await expect(emailField).toHaveAttribute('aria-describedby', /.+/);
  await expect(page.getByText('Enter your email address.')).toBeVisible();

  await emailField.fill(unique('nobody'));
  await page.getByLabel('Password').fill('wrong password here');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Invalid email or password.' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  // show/hide toggle and autofill attributes
  const password = page.getByLabel('Password');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: /Show/ }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(emailField).toHaveAttribute('autocomplete', 'email');
});

test('registration, duplicate email and password mismatch', async ({
  page,
  browser,
}) => {
  const email = unique('register');
  await page.goto('/register');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'autocomplete',
    'new-password',
  );
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill('does not match at all');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/create-player$/);
  expect((await me(page)).email).toBe(email);

  // A second browser cannot reuse the address
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto('http://localhost:3300/register');
  await second.getByLabel('Email').fill(email.toUpperCase());
  await second.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await second.getByLabel('Confirm password').fill(PASSWORD);
  await second.getByRole('button', { name: 'Create account' }).click();
  await expect(second.getByText(/already exists/)).toBeVisible();
  await other.close();
});

test('forgot and reset password end to end, revoking old sessions', async ({
  page,
  browser,
  request,
}) => {
  const email = unique('reset');
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/create-player$/);

  // an unrelated, already-signed-in second device
  const device = await browser.newContext();
  const phone = await device.newPage();
  await phone.goto('http://localhost:3300/login');
  await phone.getByLabel('Email').fill(email);
  await phone.getByLabel('Password').fill(PASSWORD);
  await phone.getByRole('button', { name: 'Sign in' }).click();
  await expect(phone).toHaveURL(/\/create-player$/);

  const requester = await browser.newContext();
  const anon = await requester.newPage();
  await anon.goto('http://localhost:3300/forgot-password');
  await anon.getByLabel('Email').fill(email);
  await anon.getByRole('button', { name: 'Send recovery link' }).click();
  await expect(
    anon.getByText(
      'If an eligible account exists, recovery instructions have been sent.',
    ),
  ).toBeVisible();
  // unknown address: identical message
  await anon.goto('http://localhost:3300/forgot-password');
  await anon.getByLabel('Email').fill(unique('ghost'));
  await anon.getByRole('button', { name: 'Send recovery link' }).click();
  await expect(
    anon.getByText(
      'If an eligible account exists, recovery instructions have been sent.',
    ),
  ).toBeVisible();

  const link = await latestLink(request, 'password_reset', email);
  await anon.goto(link);
  await anon.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await anon.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await anon.getByRole('button', { name: 'Set new password' }).click();
  await expect(anon.getByText('Your password has been updated.')).toBeVisible();

  // the link is single-use (leave the page first: a same-page #fragment change is not a reload)
  await anon.goto('http://localhost:3300/login');
  await anon.goto(link);
  await anon
    .getByLabel('New password', { exact: true })
    .fill(NEW_PASSWORD + '!');
  await anon.getByLabel('Confirm new password').fill(NEW_PASSWORD + '!');
  await anon.getByRole('button', { name: 'Set new password' }).click();
  await expect(
    anon
      .getByRole('alert')
      .filter({ hasText: /invalid or has already been used/ }),
  ).toBeVisible();

  // every pre-reset session is dead
  expect((await page.request.get(`${API}/api/v1/me`)).status()).toBe(401);
  expect((await phone.request.get(`${API}/api/v1/me`)).status()).toBe(401);

  // old password fails, new password works
  await anon.goto('http://localhost:3300/login');
  await anon.getByLabel('Email').fill(email);
  await anon.getByLabel('Password').fill(PASSWORD);
  await anon.getByRole('button', { name: 'Sign in' }).click();
  await expect(anon.getByText('Invalid email or password.')).toBeVisible();
  await anon.getByLabel('Password').fill(NEW_PASSWORD);
  await anon.getByRole('button', { name: 'Sign in' }).click();
  await expect(anon).toHaveURL(/\/create-player$/);
  await device.close();
  await requester.close();
});

test('an expired or revoked session sends protected pages back to the entry screen', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue as Guest' }).click();
  await expect(page).toHaveURL(/\/create-player$/);
  await page.context().clearCookies();
  await page.goto('/create-player');
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('button', { name: 'Continue as Guest' }),
  ).toBeVisible();
});

test('a rejected session on an authenticated action says so and returns to sign-in', async ({
  page,
}) => {
  const email = unique('expired');
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/create-player$/);
  await page.goto('/account');
  await expect(
    page.getByRole('heading', { name: 'Change password' }),
  ).toBeVisible();
  // the server loses the session (revoked/expired) while the page is open
  await page.context().clearCookies();
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/login\?expired=1$/);
  await expect(
    page.getByText('Session expired. Please sign in again.').first(),
  ).toBeVisible();
});

test('auth pages fit a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/login', '/register', '/forgot-password']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
});
