import { test, expect } from '@playwright/test';
test('web imports core and navigates all foundation routes', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'THE CRICKETER', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Shared game-core loaded: 2 approved match formats.'),
  ).toBeVisible();
  // /career, /training, /play and the other player routes are authentication-guarded and covered by
  // e2e/career-home.spec.ts, e2e/player-creation.spec.ts and e2e/player-3d.spec.ts.
  for (const route of ['inventory', 'shop']) {
    await page.goto(`/${route}`);
    await expect(
      page.getByText('Application shell only.', { exact: false }),
    ).toBeVisible();
  }
});
test('both service health endpoints respond', async ({ request }) => {
  for (const port of [4300, 4310]) {
    const response = await request.get(`http://localhost:${port}/health`);
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toMatchObject({
      success: true,
      data: { status: 'ok' },
    });
  }
});
test('admin is clearly marked as a preview', async ({ page }) => {
  await page.goto('http://localhost:3301');
  await expect(
    page.getByText('NOT PRODUCTION READY', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'players', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3301/players', {
    timeout: 30000,
  });
  await expect(
    page.getByText('Administrative preview only.', { exact: false }),
  ).toBeVisible();
});
test('mobile navigation remains accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('navigation', { name: 'Game navigation' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
