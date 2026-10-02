/* eslint-disable @typescript-eslint/no-explicit-any */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import {
  API,
  WEB,
  forceFirstBall,
  matchState,
  matchWhereIBowlFirst,
  playTossInBrowser,
  newBowler,
  startMatchApi,
} from './support/match';
import { withDb } from './support/db';

const OUTSWING = 'delivery.fast.outswing';

const shell = (page: Page) => page.getByTestId('match-shell');

async function openMatch(page: Page, matchId: string, query = '') {
  await page.goto(`/match/${matchId}${query}`);
  await expect(shell(page)).toBeVisible();
  await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
    timeout: 30000,
  });
  await expect(shell(page)).not.toHaveAttribute('data-phase', 'loading');
}

/** Plays the innings the player does not control, then picks the first eligible bowler. */
async function readyToAim(page: Page) {
  if ((await shell(page).getAttribute('data-phase')) === 'simulate_required') {
    await page.getByTestId('simulate').click();
    await expect(shell(page)).not.toHaveAttribute(
      'data-phase',
      'simulate_required',
    );
  }
  if ((await shell(page).getAttribute('data-phase')) === 'innings_break') {
    await page.getByTestId('next-innings').click();
  }
  if ((await shell(page).getAttribute('data-phase')) === 'bowler_select') {
    await page.locator('[data-bowler]:not([disabled])').first().click();
  }
  await expect(shell(page)).toHaveAttribute('data-bowling-state', 'TARGETING');
}

const aim = async (page: Page, line: string, length: string) => {
  await page.locator(`[data-length="${length}"]`).click();
  await page.locator(`[data-line="${line}"]`).click();
};

const isDeliveryPost = (r: Request) =>
  r.method() === 'POST' && /\/matches\/[^/]+\/deliveries$/.test(r.url());

/** Bowl one ball with the UI and wait for the presentation to finish (skipping the long parts). */
async function bowl(page: Page) {
  const response = page.waitForResponse(
    (r) => isDeliveryPost(r.request()) && r.status() === 200,
  );
  await page.getByTestId('bowl').click();
  const payload = (await (await response).json()).data.delivery;
  // let the run-up and release play, then skip the flight and the result hold
  await expect(shell(page)).toHaveAttribute(
    'data-bowling-state',
    /BALL_IN_FLIGHT|PITCHED|BATTER_ACTION|RESULT/,
    { timeout: 20000 },
  );
  for (let i = 0; i < 40; i++) {
    const state = await shell(page).getAttribute('data-bowling-state');
    if (state === 'TARGETING' || state === 'PREPARING') break;
    if (await page.getByTestId('skip').isVisible()) {
      await page
        .getByTestId('skip')
        .click({ timeout: 1000 })
        .catch(() => undefined);
    }
    await page.waitForTimeout(150);
  }
  await expect(shell(page)).toHaveAttribute(
    'data-bowling-state',
    /^(TARGETING|PREPARING)$/,
    { timeout: 20000 },
  );
  return payload;
}

const setup = async (page: Page) => {
  const started = await matchWhereIBowlFirst(page);
  await openMatch(page, started.matchId);
  await readyToAim(page);
  await page.getByLabel('Assisted timing').check();
  return started;
};

test.describe('Match scene: bowling', () => {
  test('career → prepare → start → bowl a ball: the scene shows the engine result and the score updates', async ({
    page,
  }) => {
    await newBowler(page);
    await page.goto('/career');
    await page.getByRole('link', { name: 'PREPARE MATCH' }).click();
    await expect(page).toHaveURL(/\/match\/preparation$/);
    await page.getByTestId('start-match').click();
    await expect(page).toHaveURL(/\/match\/[0-9a-f-]{36}$/);
    await playTossInBrowser(page, 'bowl');
    await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
      timeout: 30000,
    });
    // one canvas, labelled hidden from assistive technology
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.locator('canvas')).toHaveAttribute('aria-hidden', 'true');
    await readyToAim(page);
    await expect(page.getByTestId('delivery-panel')).toBeVisible();

    // choose Outswing, aim at a good length outside off with the accessible presets
    await page.locator(`[data-delivery="${OUTSWING}"]`).click();
    await aim(page, 'outside_off', 'good');
    await expect(page.getByTestId('aim-readout')).toHaveText(
      'Outside off, good length',
    );
    await page.getByLabel('Assisted timing').check();
    const body = page.waitForRequest((r) => isDeliveryPost(r));
    const payload = await bowl(page);
    const sent = (await body).postDataJSON();
    // only intent leaves the browser
    expect(Object.keys(sent).sort()).toEqual(
      ['actionId', 'bowlerId', 'deliveryIntent', 'expectedSequence'].sort(),
    );
    expect(sent.deliveryIntent.variationId).toBe(OUTSWING);
    expect(sent.deliveryIntent.target).toEqual({ x: 0.27, y: 0.48 });
    expect(sent.deliveryIntent.executionInput).toBeUndefined();

    // the ball VISIBLY pitched where the engine says it pitched
    const scene = await page.evaluate(
      () => (window as any).__cricketerMatch.scene().lastPitch,
    );
    expect(scene).not.toBeNull();
    expect(scene.normalized.x).toBeCloseTo(payload.delivery.actual.target.x, 3);
    expect(scene.normalized.y).toBeCloseTo(payload.delivery.actual.target.y, 3);

    // the HUD shows the authoritative score, and the result is stated as text
    const server = await matchState(page, payload.match.matchId);
    await expect(page.getByTestId('score')).toHaveText(
      `${server.innings.runs}/${server.innings.wickets}`,
    );
    await expect(page.getByTestId('overs')).toContainText(
      server.innings.oversText,
    );
    await expect(page.getByTestId('live-result')).toContainText(
      payload.outcome.headline,
    );
    await expect(page.getByTestId('last-delivery')).toContainText('km/h');
    // the next ball is available straight away
    await expect(page.getByTestId('bowl')).toBeEnabled();
  });

  test('plays a full over: six legal balls end it, extras do not count, and the next bowler is chosen', async ({
    page,
  }) => {
    test.setTimeout(180000);
    await setup(page);
    let legal = 0;
    for (let guard = 0; guard < 14 && legal < 6; guard++) {
      await aim(page, 'off_stump', 'good');
      const d = await bowl(page);
      legal = d.match.thisOver.filter(
        (b: { legal: boolean }) => b.legal,
      ).length;
      if (!d.outcome.legal)
        expect(['WIDE', 'NO BALL']).toContain(d.outcome.headline);
      if (legal < 6) await expect(page.getByTestId('bowl')).toBeEnabled();
    }
    expect(legal).toBe(6);
    await expect(page.getByTestId('over-summary-card')).toContainText(
      /END OF OVER 1/,
    );
    await expect(shell(page)).toHaveAttribute('data-phase', 'bowler_select');
    // the bowler who just bowled cannot bowl the next over
    await expect(page.locator('[data-bowler][disabled]').first()).toContainText(
      /Bowled the previous over|maximum/,
    );
  });

  test('refreshing mid-over resumes at the same ball with the same score', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const { matchId } = await setup(page);
    for (let i = 0; i < 3; i++) {
      await aim(page, 'middle', 'full');
      await bowl(page);
    }
    const before = await matchState(page, matchId);
    await page.reload();
    await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
      timeout: 30000,
    });
    await expect(shell(page)).toHaveAttribute('data-phase', 'ready_to_bowl');
    await expect(page.getByTestId('score')).toHaveText(
      `${before.innings.runs}/${before.innings.wickets}`,
    );
    await expect(page.getByTestId('overs')).toContainText(
      before.innings.oversText,
    );
    expect((await matchState(page, matchId)).expectedSequence).toBe(
      before.expectedSequence,
    );
    // and the next ball carries the right sequence
    await page.getByLabel('Assisted timing').check();
    const next = page.waitForRequest((r) => isDeliveryPost(r));
    await bowl(page);
    expect((await next).postDataJSON().expectedSequence).toBe(
      before.expectedSequence,
    );
  });

  test('a wicket: the scene says WICKET, the dismissed batter is replaced, and the score is the engine’s', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const { matchId } = await matchWhereIBowlFirst(page);
    await forceFirstBall(
      matchId,
      { variationId: OUTSWING, target: { x: 0.27, y: 0.48 } },
      (b) => b.wicketType !== null,
    );
    await openMatch(page, matchId);
    await readyToAim(page);
    await page.getByLabel('Assisted timing').check();
    await page.locator(`[data-delivery="${OUTSWING}"]`).click();
    await aim(page, 'outside_off', 'good');
    const batterBefore = await page.getByTestId('batter').innerText();
    const d = await bowl(page);
    expect(d.outcome.wicketType).not.toBeNull();
    await expect(page.getByTestId('live-result')).toContainText('WICKET');
    await expect(page.getByTestId('score')).toContainText('/1');
    await expect(page.getByTestId('batter')).not.toHaveText(batterBefore);
    const server = await matchState(page, matchId);
    expect(server.innings.wickets).toBe(1);
    expect(server.striker.name).not.toBe(batterBefore.split(/\s\d/)[0]);
    await expect(page.locator('.hud-over .is-wicket')).toHaveCount(1);
  });

  test('a wide adds a run but is not a legal ball', async ({ page }) => {
    test.setTimeout(120000);
    const { matchId } = await matchWhereIBowlFirst(page);
    await forceFirstBall(
      matchId,
      { variationId: OUTSWING, target: { x: 0.04, y: 0.48 } },
      (b) => b.extraType === 'wide',
    );
    await openMatch(page, matchId);
    await readyToAim(page);
    await page.getByLabel('Assisted timing').check();
    await page.locator(`[data-delivery="${OUTSWING}"]`).click();
    await aim(page, 'wide_off', 'good');
    const d = await bowl(page);
    expect(d.outcome.headline).toBe('WIDE');
    expect(d.outcome.legal).toBe(false);
    const server = await matchState(page, matchId);
    expect(server.innings.runs).toBe(1);
    expect(server.innings.legalBalls).toBe(0);
    await expect(page.getByTestId('overs')).toContainText('0.0');
    await expect(page.locator('.hud-over li').first()).toHaveText('Wd');
    await expect(page.getByTestId('live-result')).toContainText('WIDE');
  });

  test('a no-ball adds a run but is not a legal ball', async ({ page }) => {
    test.setTimeout(180000);
    const { matchId } = await matchWhereIBowlFirst(page);
    await forceFirstBall(
      matchId,
      { variationId: OUTSWING, target: { x: 0.27, y: 0.48 } },
      (b) => b.extraType === 'no_ball',
    );
    await openMatch(page, matchId);
    await readyToAim(page);
    await page.getByLabel('Assisted timing').check();
    await page.locator(`[data-delivery="${OUTSWING}"]`).click();
    await aim(page, 'outside_off', 'good');
    const d = await bowl(page);
    expect(d.outcome.headline).toBe('NO BALL');
    const server = await matchState(page, matchId);
    expect(server.innings.legalBalls).toBe(0);
    expect(server.innings.runs).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('live-result')).toContainText('NO BALL');
  });

  test('dragging the marker sends the same normalized target the screen shows, and a double tap bowls one ball', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await setup(page);
    const stage = page.getByTestId('match-stage');
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.44, box.y + box.height * 0.42, {
      steps: 6,
    });
    await page.mouse.up();
    const target = await page.evaluate(
      () => ((window as any).__cricketerMatch.snapshot() as any).input.target,
    );
    expect(target.x).toBeGreaterThanOrEqual(0);
    expect(target.x).toBeLessThanOrEqual(1);
    expect(target.y).toBeGreaterThanOrEqual(0);
    expect(target.y).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('aim-readout')).not.toBeEmpty();
    // a drag far outside the pitch is clamped, never NaN
    await page.mouse.move(box.x + 5, box.y + box.height - 3);
    await page.mouse.down();
    await page.mouse.move(box.x + 2, box.y + box.height - 1, { steps: 3 });
    await page.mouse.up();
    const clamped = await page.evaluate(
      () => ((window as any).__cricketerMatch.snapshot() as any).input.target,
    );
    for (const n of [clamped.x, clamped.y]) {
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
    // aim back to something sensible and double tap BOWL
    await aim(page, 'outside_off', 'good');
    const posts: Request[] = [];
    page.on('request', (r) => {
      if (isDeliveryPost(r)) posts.push(r);
    });
    await page.getByTestId('bowl').dblclick();
    await expect(shell(page)).toHaveAttribute(
      'data-bowling-state',
      /RUN_UP|RELEASED|BALL_IN_FLIGHT|PITCHED|BATTER_ACTION|RESULT/,
    );
    await page.waitForTimeout(500);
    expect(posts).toHaveLength(1);
    // controls are locked while the ball is on its way
    await expect(page.getByTestId('delivery-panel')).toHaveCount(0);
  });

  test('a dropped connection before the ball is bowled shows nothing, then a retry bowls it exactly once', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const { matchId } = await setup(page);
    let attempts = 0;
    const ids: string[] = [];
    await page.route('**/api/v1/matches/*/deliveries', async (route) => {
      attempts++;
      ids.push(route.request().postDataJSON().actionId);
      if (attempts === 1) return route.abort('failed');
      return route.continue();
    });
    await aim(page, 'off_stump', 'good');
    await page.getByTestId('bowl').click();
    await expect(page.locator('.match-alert.is-error')).toContainText(
      /connection dropped|Nothing was counted/,
    );
    await expect(shell(page)).toHaveAttribute(
      'data-bowling-state',
      'TARGETING',
    );
    expect((await matchState(page, matchId)).expectedSequence).toBe(1);
    await expect(page.getByTestId('score')).toHaveText('0/0');
    await page.getByTestId('retry').click();
    await expect(shell(page)).toHaveAttribute(
      'data-bowling-state',
      /BALL_IN_FLIGHT|PITCHED|BATTER_ACTION|RESULT/,
      { timeout: 20000 },
    );
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    await expect
      .poll(async () => (await matchState(page, matchId)).expectedSequence)
      .toBe(2);
  });

  test('a lost reply after the server bowled the ball is safe: the retry returns the stored ball, never a second one', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const { matchId } = await setup(page);
    let attempts = 0;
    await page.route('**/api/v1/matches/*/deliveries', async (route) => {
      attempts++;
      if (attempts === 1) {
        await route.fetch(); // the server resolves and persists the ball...
        return route.abort('failed'); // ...but the browser never hears about it
      }
      return route.continue();
    });
    await aim(page, 'off_stump', 'good');
    await page.getByTestId('bowl').click();
    await expect(page.getByTestId('retry')).toBeVisible({ timeout: 20000 });
    const afterLoss = await matchState(page, matchId);
    expect(afterLoss.expectedSequence).toBe(2); // the server did play it
    await page.getByTestId('retry').click();
    await expect(shell(page))
      .toHaveAttribute('data-bowling-state', /^(TARGETING|PREPARING)$/, {
        timeout: 30000,
      })
      .catch(() => undefined);
    await expect
      .poll(async () => (await matchState(page, matchId)).expectedSequence, {
        timeout: 30000,
      })
      .toBe(2);
    const balls = await withDb(async (q) =>
      Number(
        (
          await q(
            `SELECT count(*)::int AS n FROM match_balls b
               JOIN match_overs o ON o.id = b.over_id
               JOIN match_innings i ON i.id = o.innings_id
              WHERE i.match_id = $1`,
            [matchId],
          )
        )[0]!.n,
      ),
    );
    expect(balls).toBe(1);
  });

  test('works on a phone in landscape: touch targets are large and the whole loop plays', async ({
    browser,
  }) => {
    test.setTimeout(150000);
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    try {
      const started = await matchWhereIBowlFirst(page);
      await openMatch(page, started.matchId);
      await readyToAim(page);
      const bowlBox = (await page.getByTestId('bowl').boundingBox())!;
      expect(bowlBox.height).toBeGreaterThanOrEqual(44);
      for (const locator of [
        page.locator('[data-length="good"]'),
        page.locator('[data-line="outside_off"]'),
      ]) {
        const b = (await locator.boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.width).toBeGreaterThanOrEqual(44);
      }
      // no page-level horizontal scroll
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      await page.getByLabel('Assisted timing').check();
      await aim(page, 'outside_off', 'good');
      await page.getByTestId('bowl').tap();
      await expect(shell(page)).toHaveAttribute(
        'data-bowling-state',
        /BALL_IN_FLIGHT|PITCHED|BATTER_ACTION|RESULT/,
        { timeout: 25000 },
      );
      await expect(shell(page)).toHaveAttribute(
        'data-bowling-state',
        /^(TARGETING|PREPARING)$/,
        { timeout: 25000 },
      );
      await expect(page.getByTestId('live-result')).not.toBeEmpty();
    } finally {
      await context.close();
    }
  });

  test('works on a phone in portrait without sideways scrolling', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    try {
      const started = await matchWhereIBowlFirst(page);
      await openMatch(page, started.matchId);
      await readyToAim(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      await expect(page.getByTestId('bowl')).toBeVisible();
      const stage = (await page.getByTestId('match-stage').boundingBox())!;
      expect(stage.height).toBeGreaterThan(200);
    } finally {
      await context.close();
    }
  });

  test('keyboard only: pick a bowler, move the aim with the arrows, bowl with Space', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const started = await matchWhereIBowlFirst(page);
    await openMatch(page, started.matchId);
    if (
      (await shell(page).getAttribute('data-phase')) === 'simulate_required'
    ) {
      await page.getByTestId('simulate').click();
    }
    await page.locator('[data-bowler]:not([disabled])').first().focus();
    await page.keyboard.press('Enter');
    await expect(shell(page)).toHaveAttribute(
      'data-bowling-state',
      'TARGETING',
    );
    await page.getByLabel('Assisted timing').check();
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    const before = await page.evaluate(
      () => ((window as any).__cricketerMatch.snapshot() as any).input.target,
    );
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    const after = await page.evaluate(
      () => ((window as any).__cricketerMatch.snapshot() as any).input.target,
    );
    expect(after.x).toBeLessThan(before.x);
    expect(after.y).toBeLessThan(before.y);
    await page.keyboard.press('2');
    const post = page.waitForRequest((r) => isDeliveryPost(r));
    await page.keyboard.press('Space');
    expect((await post).postDataJSON().deliveryIntent.variationId).toBe(
      (await page.evaluate(
        () =>
          ((window as any).__cricketerMatch.snapshot() as any).input.deliveryId,
      )) as string,
    );
  });

  test('reduced motion: assisted timing is the default and the camera never moves', async ({
    browser,
  }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      const started = await matchWhereIBowlFirst(page);
      await openMatch(page, started.matchId);
      await readyToAim(page);
      await expect(page.getByLabel('Assisted timing')).toBeChecked();
      await aim(page, 'outside_off', 'good');
      const camV = new Set<number>();
      await page.getByTestId('bowl').click();
      for (let i = 0; i < 25; i++) {
        camV.add(
          await page.evaluate(
            () => (window as any).__cricketerMatch.scene().cameraView.camV,
          ),
        );
        await page.waitForTimeout(150);
      }
      // the shot never moved, even while the bowler ran in and the ball flew
      expect([...camV]).toHaveLength(1);
    } finally {
      await context.close();
    }
  });

  test('the match screen has no accessibility violations while aiming', async ({
    page,
  }) => {
    const started = await matchWhereIBowlFirst(page);
    await openMatch(page, started.matchId);
    await readyToAim(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual(
      [],
    );
  });

  test('a missing bowler asset falls back to a playable action and says so', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const started = await matchWhereIBowlFirst(page);
    const warnings: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().includes('[match]'))
        warnings.push(m.text());
    });
    await openMatch(page, started.matchId, '?failAssets=bowler.fast.right.01');
    await readyToAim(page);
    await page.getByLabel('Assisted timing').check();
    await aim(page, 'off_stump', 'good');
    await bowl(page);
    const scene = await page.evaluate(
      () => (window as any).__cricketerMatch.scene().bowlerAnimationFallback,
    );
    expect(scene).toBe(true);
    expect(warnings.join('\n')).toMatch(/fallback|unavailable/i);
    await expect(page.getByTestId('live-result')).not.toBeEmpty();
  });

  test('leaving and re-entering the match ten times never leaves a second canvas or piles up key handlers', async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.addInitScript(() => {
      const counts: Record<string, number> = {};
      const add = EventTarget.prototype.addEventListener;
      const remove = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function (
        type: string,
        ...rest: any[]
      ) {
        if (this === window && type === 'keydown')
          counts[type] = (counts[type] ?? 0) + 1;
        return (add as any).call(this, type, ...rest);
      };
      EventTarget.prototype.removeEventListener = function (
        type: string,
        ...rest: any[]
      ) {
        if (this === window && type === 'keydown')
          counts[type] = (counts[type] ?? 0) - 1;
        return (remove as any).call(this, type, ...rest);
      };
      (window as any).__keyCounts = counts;
    });
    const started = await matchWhereIBowlFirst(page);
    await openMatch(page, started.matchId);
    for (let i = 0; i < 10; i++) {
      await expect(page.locator('canvas')).toHaveCount(1);
      // client-side navigation away and back keeps the same document, so any leak would accumulate
      await page.getByTestId('menu-open').click();
      await page.getByTestId('save-and-exit').click();
      await expect(page).toHaveURL(/\/career/);
      await expect(page.locator('canvas')).toHaveCount(0);
      await page.goBack();
      await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
        timeout: 30000,
      });
    }
    await expect(shell(page)).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1);
    const net = await page.evaluate(() => (window as any).__keyCounts.keydown);
    expect(net).toBeLessThanOrEqual(3);
  });

  test('pause freezes the presentation without touching the match', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const { matchId } = await setup(page);
    const posts: string[] = [];
    page.on('request', (r) => {
      if (isDeliveryPost(r)) posts.push(r.url());
    });
    await aim(page, 'off_stump', 'good');
    await page.getByTestId('bowl').click();
    await expect(shell(page)).toHaveAttribute('data-bowling-state', 'RUN_UP');
    await page.getByRole('button', { name: 'Pause' }).click();
    const frozen = await page.evaluate(
      () => (window as any).__cricketerMatch.scene().animatorPhase,
    );
    await page.waitForTimeout(1500);
    expect(
      await page.evaluate(
        () => (window as any).__cricketerMatch.scene().animatorPhase,
      ),
    ).toBe(frozen);
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume' }).first().click();
    await expect(shell(page)).toHaveAttribute(
      'data-bowling-state',
      /BALL_IN_FLIGHT|PITCHED|BATTER_ACTION|RESULT|TARGETING/,
      { timeout: 25000 },
    );
    expect(posts).toHaveLength(1);
    void matchId;
  });
});

test.describe('Match access and completion', () => {
  test('someone else’s match is not reachable, and signed-out visitors are sent away', async ({
    page,
    browser,
  }) => {
    const started = await matchWhereIBowlFirst(page);
    const other = await (await browser.newContext()).newPage();
    try {
      await newBowler(other);
      expect(
        (await other.request.get(`${API}/matches/${started.matchId}`)).status(),
      ).toBe(404);
      await other.goto(`/match/${started.matchId}`);
      await expect(
        other.getByRole('button', { name: /Try again/ }),
      ).toBeVisible({ timeout: 20000 });
      await expect(other.getByTestId('delivery-panel')).toHaveCount(0);
    } finally {
      await other.context().close();
    }
    const stranger = await (await browser.newContext()).newPage();
    try {
      await stranger.goto(`/match/${started.matchId}`);
      await expect(stranger).not.toHaveURL(/\/match\//, { timeout: 15000 });
    } finally {
      await stranger.context().close();
    }
  });

  test('finishing the match opens the result screen with the scorecard, and a refresh shows the same result', async ({
    page,
  }) => {
    test.setTimeout(240000);
    const started = await matchWhereIBowlFirst(page);
    const url = `${API}/matches/${started.matchId}`;
    // play it out through the API (the UI path is covered above)
    let state = await matchState(page, started.matchId);
    for (let guard = 0; guard < 90 && state.phase !== 'completed'; guard++) {
      if (state.phase === 'innings_break')
        state = (
          await (
            await page.request.post(`${url}/advance`, {
              headers: { origin: WEB },
              data: {},
            })
          ).json()
        ).data.match;
      else if (state.phase === 'simulate_required')
        state = (
          await (
            await page.request.post(`${url}/simulate`, {
              headers: { origin: WEB },
              data: { mode: 'until_my_turn' },
            })
          ).json()
        ).data.match;
      else if (state.phase === 'ready_to_bat') {
        // the player's own Cricketer is on strike: face the ball and play a straight drive
        const preview = await page.request.post(`${url}/next-ball`, {
          headers: { origin: WEB },
          data: {},
        });
        expect(preview.status()).toBe(200);
        const r = await page.request.post(`${url}/shots`, {
          headers: { origin: WEB },
          data: {
            actionId: `bat${guard}${Date.now().toString(36)}abcd`,
            expectedSequence: state.expectedSequence,
            battingIntent: {
              shotId: 'shot.straight_drive',
              direction: 0,
              timingInput: 0,
              assist: 'off',
            },
          },
        });
        expect(r.status()).toBe(200);
        state = (await r.json()).data.delivery.match;
      } else {
        const bowler =
          state.currentBowler ??
          state.eligibleBowlers.find((b: { eligible: boolean }) => b.eligible);
        const r = await page.request.post(`${url}/deliveries`, {
          headers: { origin: WEB },
          data: {
            actionId: `fin${guard}${Date.now().toString(36)}abcd`,
            expectedSequence: state.expectedSequence,
            ...(state.phase === 'bowler_select'
              ? { bowlerId: bowler.playerId }
              : {}),
            deliveryIntent: {
              variationId: bowler.deliveryIds[0],
              target: { x: 0.3, y: 0.45 },
            },
          },
        });
        expect(r.status()).toBe(200);
        state = (await r.json()).data.delivery.match;
      }
    }
    expect(state.phase).toBe('completed');
    await page.goto(`/match/${started.matchId}/result`);
    await expect(page.getByTestId('result-text')).toContainText(/won by|tied/);
    await expect(page.getByTestId('your-performance')).toBeVisible();
    await expect(page.getByTestId('rewards')).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    const text = (await page.getByTestId('result-text').textContent())!;
    await page.reload();
    await expect(page.getByTestId('result-text')).toHaveText(text);
    // the full scorecard is one click away
    await page.getByTestId('view-scorecard').click();
    await expect(page).toHaveURL(/\/scorecard$/);
    await expect(page.getByRole('table').first()).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('result-text')).toHaveText(text);
    // opening the live match of a finished game goes to its result
    await page.goto(`/match/${started.matchId}`);
    await expect(page).toHaveURL(/\/result$/, { timeout: 20000 });
    // the career now shows the fixture as completed
    const home = (await (await page.request.get(`${API}/career/home`)).json())
      .data.home;
    expect(home.nextMatch?.id).not.toBe(started.fixtureId);
  });
});

test.describe('Pitch types and the bowling lab', () => {
  test('green, hard and dry pitches show the engine’s movement, and the ball visibly pitches on the engine’s target', async ({
    page,
  }) => {
    test.setTimeout(240000);
    await newBowler(page);
    await page.goto('/dev/bowling');
    await expect(page.getByTestId('bowling-lab')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1);
    const results: Record<string, any> = {};
    for (const [pitch, style, variation] of [
      ['pitch.green', 'right_arm_medium', 'delivery.medium.seam'],
      ['pitch.hard', 'right_arm_medium', 'delivery.medium.seam'],
      ['pitch.dry', 'off_spin', 'delivery.spin.stock_off'],
      ['pitch.hard', 'off_spin', 'delivery.spin.stock_off'],
    ] as const) {
      const form = page.getByTestId('bowling-lab');
      await form.locator('select').nth(0).selectOption(style);
      await form.locator('select').nth(2).selectOption(pitch);
      await form.getByLabel('Variation').fill(variation);
      await page.getByTestId('lab-bowl').click();
      await expect(page.getByTestId('lab-result')).toContainText('"speedKmh"', {
        timeout: 15000,
      });
      // wait for the ball to land so the scene reports where it pitched
      await expect
        .poll(
          async () =>
            (await page.getByTestId('lab-result').innerText()).includes(
              '"visualPitch": {',
            ),
          { timeout: 20000 },
        )
        .toBe(true);
      const shown = JSON.parse(
        await page.getByTestId('lab-result').innerText(),
      );
      results[`${pitch}/${style}`] = shown;
      expect(shown.visualPitch.normalized.x).toBeCloseTo(shown.actual.x, 3);
      expect(shown.visualPitch.normalized.y).toBeCloseTo(shown.actual.y, 3);
      await page.waitForTimeout(3500);
    }
    // Module 0 pitch effects survive all the way to the screen: seam on Green, spin on Dry, bounce on Hard
    expect(
      Math.abs(results['pitch.green/right_arm_medium'].movement.seam),
    ).toBeGreaterThan(
      Math.abs(results['pitch.hard/right_arm_medium'].movement.seam),
    );
    expect(
      Math.abs(results['pitch.dry/off_spin'].movement.spin),
    ).toBeGreaterThan(Math.abs(results['pitch.hard/off_spin'].movement.spin));
  });

  test('the same seed repeats the same ball', async ({ page }) => {
    test.setTimeout(120000);
    await newBowler(page);
    const body = {
      bowlingStyle: 'right_arm_fast',
      battingHand: 'right',
      pitchId: 'pitch.green',
      rating: 70,
      seed: 'repeat-1',
      variationId: OUTSWING,
      target: { x: 0.3, y: 0.45 },
    };
    const call = async () =>
      (
        await (
          await page.request.post(`${API}/dev/bowling-lab`, {
            headers: { origin: WEB, 'content-type': 'application/json' },
            data: body,
          })
        ).json()
      ).data;
    expect(await call()).toEqual(await call());
  });
});

test.describe('Match preparation', () => {
  test('after starting, the preparation screen offers to resume the same match', async ({
    page,
  }) => {
    await newBowler(page);
    await page.goto('/match/preparation');
    await page.getByTestId('start-match').click();
    await expect(page).toHaveURL(/\/match\/[0-9a-f-]{36}$/);
    const url = page.url();
    await page.goto('/match/preparation');
    await expect(page.getByTestId('start-match')).toHaveText('RESUME MATCH');
    await page.getByTestId('start-match').click();
    await expect(page).toHaveURL(url);
    void startMatchApi;
  });
});
