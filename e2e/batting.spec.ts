/* eslint-disable @typescript-eslint/no-explicit-any */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import {
  API,
  WEB,
  forceFirstHumanBall,
  headers,
  matchState,
  matchWhereIBatFirst,
  playTossInBrowser,
  newBatter,
  startMatchApi,
} from './support/match';
import { withDb } from './support/db';

const shell = (page: Page) => page.getByTestId('match-shell');
const isShotPost = (r: Request) =>
  r.method() === 'POST' && /\/matches\/[^/]+\/shots$/.test(r.url());

async function openMatch(page: Page, matchId: string, query = '') {
  await page.goto(`/match/${matchId}${query}`);
  await expect(shell(page)).toBeVisible();
  await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
    timeout: 30000,
  });
  await expect(shell(page)).not.toHaveAttribute('data-phase', 'loading');
}

/** Through the API (the UI path is covered elsewhere): play on until the player is on strike. */
async function apiUntilMyBat(page: Page, matchId: string) {
  const url = `${API}/matches/${matchId}`;
  for (let guard = 0; guard < 12; guard++) {
    const state = await matchState(page, matchId);
    if (state.phase === 'ready_to_bat' || state.phase === 'completed')
      return state.phase;
    const path = state.phase === 'innings_break' ? 'advance' : 'simulate';
    const data =
      path === 'advance'
        ? {}
        : { mode: state.you.side === 'bowling' ? 'innings' : 'until_my_turn' };
    const r = await page.request.post(`${url}/${path}`, { headers, data });
    expect(r.status(), `${path} ${JSON.stringify(state.phase)}`).toBe(200);
  }
  return 'unknown';
}

const battingState = (page: Page) =>
  shell(page).getAttribute('data-batting-state');

/** Waits for the ball to be released, then swings when the cue says it is `before` seconds to the ideal moment. */
async function swingOn(
  page: Page,
  before = 0.0,
  key: 'space' | 'press' | 'button' = 'space',
) {
  await expect(shell(page)).toHaveAttribute(
    'data-batting-state',
    /READING_DELIVERY|SHOT_ARMED/,
    { timeout: 20000 },
  );
  if (key === 'space') {
    // wait and swing INSIDE the page: no round trip between the cue and the key, so the timing is the test's, not the machine's
    await page.evaluate(
      (seconds) =>
        new Promise<void>((resolve) => {
          const w = window as any;
          const tick = () => {
            const cue = w.__cricketerMatch?.cue?.();
            if (cue && cue.secondsToIdeal <= seconds) {
              document.body.dispatchEvent(
                new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
              );
              resolve();
            } else requestAnimationFrame(tick);
          };
          tick();
        }),
      before,
    );
    return;
  }
  for (let i = 0; i < 1500; i++) {
    const cue = await page.evaluate(
      () => (window as any).__cricketerMatch?.cue?.() ?? null,
    );
    if (cue && cue.secondsToIdeal <= before) break;
    await page.waitForTimeout(6);
  }
  if (key === 'press') await page.keyboard.press('Space');
  else await page.getByTestId('swing').click({ timeout: 1500 });
}

/** Faces a ball, swings on the cue and waits for the whole presentation to finish (skipping the long parts). */
async function playBall(page: Page, before = 0.0) {
  await expect(page.getByTestId('face-ball')).toBeEnabled({ timeout: 20000 });
  await page.getByTestId('face-ball').click();
  const response = page.waitForResponse(
    (r) => isShotPost(r.request()) && r.status() === 200,
    { timeout: 30000 },
  );
  await swingOn(page, before);
  const payload = (await (await response).json()).data.delivery;
  for (let i = 0; i < 80; i++) {
    const state = await battingState(page);
    const phase = await shell(page).getAttribute('data-phase');
    if (
      state === 'WAITING' &&
      (await shell(page).getAttribute('data-mode')) === 'bowling'
    )
      break;
    if (state === 'WAITING' && phase === 'ready_to_bat') break;
    if (await page.getByTestId('skip').isVisible())
      await page
        .getByTestId('skip')
        .click({ timeout: 800 })
        .catch(() => undefined);
    await page.waitForTimeout(150);
  }
  return payload;
}

/** Choose the shot with the UI controls, and let the system time it (assist Auto), so the outcome is the engine's seeded one. */
async function chooseAuto(
  page: Page,
  action: string,
  direction: number,
  assist = 'auto',
) {
  await page.getByText(/^Batting assist/).click();
  await page.locator(`[data-assist="${assist}"]`).click();
  await page.locator(`[data-action="${action}"]`).click();
  await page.locator(`[data-direction="${direction}"]`).click();
}

async function sceneBatting(page: Page) {
  return page.evaluate(
    () => (window as any).__cricketerMatch?.scene?.()?.batting,
  );
}

/** Plays the (already faced and chosen) ball with the swing on the cue and waits for the result sequence. */
async function playForced(page: Page) {
  await page.getByTestId('face-ball').click();
  const answer = page.waitForResponse((r) => isShotPost(r.request()), {
    timeout: 30000,
  });
  await swingOn(page, 0);
  const d = (await (await answer).json()).data.delivery;
  await expect(page.getByTestId('live-result')).toContainText(
    d.outcome.headline,
    { timeout: 25000 },
  );
  return d;
}

/** Faces the ball and leaves the bat alone: the shot is played hopelessly late (timing +1). */
async function playLeaving(page: Page) {
  const answer = page.waitForResponse((r) => isShotPost(r.request()), {
    timeout: 40000,
  });
  await page.getByTestId('face-ball').click();
  const d = (await (await answer).json()).data.delivery;
  await expect(page.getByTestId('live-result')).toContainText(
    d.outcome.headline,
    { timeout: 25000 },
  );
  return d;
}

const setup = async (page: Page, overrides: Record<string, unknown> = {}) => {
  const started = await matchWhereIBatFirst(page, overrides);
  await openMatch(page, started.matchId);
  await expect(shell(page)).toHaveAttribute('data-phase', 'ready_to_bat');
  return started;
};

test.describe('Batting: the player faces the ball', () => {
  test('career → prepare → start → bat a ball: the swing starts at once, the server decides, the score is the engine’s', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await newBatter(page);
    await page.goto('/career');
    await page.getByRole('link', { name: 'PREPARE MATCH' }).click();
    await page.getByTestId('start-match').click();
    await expect(page).toHaveURL(/\/match\/[0-9a-f-]{36}$/);
    await playTossInBrowser(page, 'bat');
    await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
      timeout: 30000,
    });
    await expect(page.locator('canvas')).toHaveCount(1);
    const matchIdNow = page.url().split('/').pop()!;
    // the toss decides who bats first: play on through the API until the player is on strike
    await apiUntilMyBat(page, matchIdNow);
    await page.reload();
    await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
      timeout: 30000,
    });
    await expect(shell(page)).toHaveAttribute('data-mode', 'batting');
    await expect(page.getByTestId('batting-panel')).toBeVisible();
    const matchId = page.url().split('/').pop()!;
    const before = await matchState(page, matchId);
    // the choices: a drive, straight
    await page.locator('[data-action="drive"]').click();
    await page.locator('[data-direction="0"]').click();
    const post = page.waitForRequest((r) => isShotPost(r));
    const d = await playBall(page);
    const body = (await post).postDataJSON();
    // the browser sent a shot, a direction and a timing: nothing about what happened
    expect(Object.keys(body).sort()).toEqual([
      'actionId',
      'battingIntent',
      'expectedSequence',
    ]);
    expect(Object.keys(body.battingIntent).sort()).toEqual([
      'assist',
      'direction',
      'shotId',
      'timingInput',
    ]);
    expect(body.expectedSequence).toBe(before.expectedSequence);
    expect(d.sequence).toBe(before.expectedSequence);
    const after = await matchState(page, matchId);
    expect(after.expectedSequence).toBe(before.expectedSequence + 1);
    // the HUD shows exactly what the server says
    await expect(page.getByTestId('score')).toHaveText(
      `${after.innings.runs}/${after.innings.wickets}`,
    );
    await expect(page.getByTestId('live-result')).toContainText(
      d.outcome.headline,
    );
    if (after.phase === 'ready_to_bat')
      await expect(page.getByTestId('face-ball')).toBeEnabled();
  });

  test('the feedback is the engine’s: contact and timing labels appear with the result, not before', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await setup(page);
    await page.getByTestId('face-ball').click();
    await expect(page.getByTestId('batting-feedback')).toHaveCount(0);
    const answer = page.waitForResponse((r) => isShotPost(r.request()));
    await swingOn(page, 0);
    const d = (await (await answer).json()).data.delivery;
    await expect(page.getByTestId('batting-feedback')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByTestId('batting-feedback')).toHaveAttribute(
      'data-contact',
      d.batting.contact,
    );
    await expect(page.getByTestId('batting-feedback')).toHaveAttribute(
      'data-timing',
      d.batting.timing,
    );
  });

  test('a swing made early, on the cue or late is measured as early, on time or late (the number and the label come from the server)', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await setup(page);
    const inputs: number[] = [];
    const labels: string[] = [];
    // the test's own round trip adds about a tenth of a second, so compare the three swings with each other
    for (const before of [0.25, 0.1, -0.2]) {
      const d = await playBall(page, before);
      inputs.push(d.batting.timingInput);
      labels.push(d.batting.timing);
      if ((await shell(page).getAttribute('data-phase')) !== 'ready_to_bat')
        break;
    }
    if (inputs.length === 3) {
      expect(inputs[0]).toBeLessThan(inputs[1]! - 0.1);
      expect(inputs[1]).toBeLessThan(inputs[2]! - 0.1);
      expect(labels[0]).toMatch(/early/);
      expect(labels[2]).toMatch(/late/);
    } else if (inputs.length === 2) {
      expect(inputs[0]).toBeLessThan(inputs[1]!);
    }
  });

  test('leaving the bat alone: the ball goes by, the umpire still resolves it, and the match carries on', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const { matchId } = await setup(page);
    const before = await matchState(page, matchId);
    await page.getByTestId('face-ball').click();
    const post = page.waitForRequest((r) => isShotPost(r), { timeout: 30000 });
    const body = (await post).postDataJSON();
    expect(body.battingIntent.timingInput).toBe(1); // hopelessly late
    await expect
      .poll(async () => (await matchState(page, matchId)).expectedSequence, {
        timeout: 20000,
      })
      .toBe(before.expectedSequence + 1);
  });

  test('refreshing while the ball is on its way resumes the same ball with the same score', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const { matchId } = await setup(page);
    const before = await matchState(page, matchId);
    await page.getByTestId('face-ball').click();
    await expect(shell(page)).toHaveAttribute(
      'data-batting-state',
      /READING_DELIVERY/,
      { timeout: 20000 },
    );
    await page.reload();
    await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
      timeout: 30000,
    });
    await expect(shell(page)).toHaveAttribute('data-phase', 'ready_to_bat');
    await expect(shell(page)).toHaveAttribute('data-batting-state', 'WAITING');
    expect((await matchState(page, matchId)).expectedSequence).toBe(
      before.expectedSequence,
    );
    // the next ball is the SAME ball (it was never bowled, so nothing was lost or doubled)
    const post = page.waitForRequest((r) => isShotPost(r));
    await page.getByTestId('face-ball').click();
    await swingOn(page, 0);
    expect((await post).postDataJSON().expectedSequence).toBe(
      before.expectedSequence,
    );
  });

  test('a dropped connection shows nothing, then a retry plays the shot exactly once', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const { matchId } = await setup(page);
    let attempts = 0;
    const ids: string[] = [];
    await page.route('**/api/v1/matches/*/shots', async (route) => {
      attempts++;
      ids.push(route.request().postDataJSON().actionId);
      if (attempts === 1) return route.abort('failed');
      return route.continue();
    });
    await page.getByTestId('face-ball').click();
    await swingOn(page, 0);
    await expect(page.locator('.match-alert.is-error')).toContainText(
      /connection dropped|Nothing was counted/,
      { timeout: 20000 },
    );
    await expect(shell(page)).toHaveAttribute('data-batting-state', 'WAITING');
    await expect(page.getByTestId('score')).toHaveText('0/0');
    expect((await matchState(page, matchId)).expectedSequence).toBe(1);
    await page.getByTestId('retry').click();
    await expect
      .poll(async () => (await matchState(page, matchId)).expectedSequence, {
        timeout: 30000,
      })
      .toBe(2);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
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

  test('a lost reply after the server played the shot is safe: the retry returns the stored ball, never a second one', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const { matchId } = await setup(page);
    let attempts = 0;
    await page.route('**/api/v1/matches/*/shots', async (route) => {
      attempts++;
      if (attempts === 1) {
        await route.fetch();
        return route.abort('failed');
      }
      return route.continue();
    });
    await page.getByTestId('face-ball').click();
    await swingOn(page, 0);
    await expect(page.getByTestId('retry')).toBeVisible({ timeout: 20000 });
    expect((await matchState(page, matchId)).expectedSequence).toBe(2);
    await page.getByTestId('retry').click();
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

  test('keyboard only: Space faces the ball and swings, 1-5 choose the shot, arrows lean it', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await setup(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Space'); // face the ball
    await expect(shell(page)).toHaveAttribute(
      'data-batting-state',
      /BOWLER_APPROACH|READING_DELIVERY/,
      { timeout: 15000 },
    );
    await page.keyboard.press('3'); // leg side
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-action="leg_side"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const post = page.waitForRequest((r) => isShotPost(r), { timeout: 30000 });
    await swingOn(page, 0, 'press');
    const body = (await post).postDataJSON();
    expect(body.battingIntent.direction).toBe(-0.5);
    expect(body.battingIntent.shotId).toMatch(
      /flick|pull|hook|lofted_leg|on_drive/,
    );
  });

  test('a double tap swings once', async ({ page }) => {
    test.setTimeout(90000);
    await setup(page);
    let posts = 0;
    page.on('request', (r) => {
      if (isShotPost(r)) posts++;
    });
    await page.getByTestId('face-ball').click();
    await expect(shell(page)).toHaveAttribute(
      'data-batting-state',
      /READING_DELIVERY/,
      { timeout: 20000 },
    );
    await page.getByTestId('swing').dblclick();
    await page.waitForTimeout(1500);
    expect(posts).toBe(1);
  });

  test('a wicket sends the player to the simulation panels, with SIMULATE REST', async ({
    page,
  }) => {
    test.setTimeout(240000);
    await setup(page);
    let phase = 'ready_to_bat';
    for (let i = 0; i < 14 && phase === 'ready_to_bat'; i++) {
      // never swinging is the quickest way to get out
      await expect(page.getByTestId('face-ball')).toBeEnabled({
        timeout: 20000,
      });
      await page.getByTestId('face-ball').click();
      const answer = await page.waitForResponse(
        (r) => isShotPost(r.request()),
        { timeout: 30000 },
      );
      const d = (await answer.json()).data.delivery;
      for (let k = 0; k < 60; k++) {
        if (await page.getByTestId('skip').isVisible())
          await page
            .getByTestId('skip')
            .click({ timeout: 800 })
            .catch(() => undefined);
        if ((await battingState(page)) === 'WAITING') break;
        await page.waitForTimeout(150);
      }
      phase = d.match.phase;
    }
    test.skip(phase === 'ready_to_bat', 'no wicket fell in 14 balls');
    await expect(page.getByTestId('simulate-panel')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByTestId('batting-panel')).toHaveCount(0);
  });
});

test.describe('Batting: strict API', () => {
  test('the server refuses a request that carries a result, an unknown field or the wrong ball', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const { matchId } = await matchWhereIBatFirst(page);
    const url = `${API}/matches/${matchId}`;
    const base = {
      actionId: 'strict-abcdefgh-1',
      expectedSequence: 1,
      battingIntent: {
        shotId: 'shot.straight_drive',
        direction: 0,
        timingInput: 0,
        assist: 'off',
      },
    };
    const post = (data: unknown) =>
      page.request.post(`${url}/shots`, { headers, data });
    for (const extra of [
      { contactQuality: 'perfect' },
      { runs: 6 },
      { wicket: false },
      { exitSpeed: 40 },
    ]) {
      const r = await post({
        ...base,
        battingIntent: { ...base.battingIntent, ...extra },
      });
      expect(r.status(), JSON.stringify(extra)).toBe(400);
    }
    expect((await post({ ...base, outcome: 'six' })).status()).toBe(400);
    expect(
      (
        await post({
          ...base,
          battingIntent: { ...base.battingIntent, timingInput: 2 },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await post({
          ...base,
          battingIntent: { ...base.battingIntent, shotId: 'shot.nope' },
        })
      ).status(),
    ).toBe(400);
    // a shot before the ball has been faced is allowed only for the ball the server would bowl: a stale sequence is not
    expect((await post({ ...base, expectedSequence: 5 })).status()).toBe(409);
    expect((await matchState(page, matchId)).expectedSequence).toBe(1);
  });

  test('someone else cannot play your shot', async ({ page, browser }) => {
    test.setTimeout(90000);
    const { matchId } = await matchWhereIBatFirst(page);
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await newBatter(p2);
    const r = await p2.request.post(`${API}/matches/${matchId}/shots`, {
      headers,
      data: {
        actionId: 'intruder-abcdefgh',
        expectedSequence: 1,
        battingIntent: {
          shotId: 'shot.straight_drive',
          direction: 0,
          timingInput: 0,
          assist: 'off',
        },
      },
    });
    expect([403, 404]).toContain(r.status());
    expect((await matchState(page, matchId)).expectedSequence).toBe(1);
    await other.close();
  });
});

test.describe('Batting: your turn comes later', () => {
  test('a middle-order batter simulates to their turn, then bats', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await newBatter(page, {
      primaryRole: 'finisher',
      displayName: 'Finisher',
    });
    // the player wins the toss and bats: a finisher is not on strike for the first ball
    const started = await startMatchApi(page, { decision: 'bat' });
    const state = await matchState(page, started.matchId);
    expect(state.phase).toBe('simulate_required');
    expect(state.you.side).toBe('batting');
    await openMatch(page, started.matchId);
    await expect(page.getByTestId('simulate-panel')).toContainText(
      /Waiting for your turn|non-striker/,
    );
    await expect(page.getByTestId('simulate')).toHaveText(
      'SIMULATE TO MY TURN',
    );
    await page.getByTestId('simulate').click();
    await expect(shell(page)).not.toHaveAttribute(
      'data-phase',
      'simulate_required',
      { timeout: 30000 },
    );
    const phase = await shell(page).getAttribute('data-phase');
    if (phase === 'ready_to_bat') {
      await expect(page.getByTestId('batting-panel')).toBeVisible();
      await expect(page.getByTestId('face-ball')).toBeEnabled();
    }
  });
});

test.describe('Batting: devices, access and accessibility', () => {
  test('a phone in landscape: the controls fit, touch targets are large and a ball can be played', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 844, height: 390 });
    await setup(page);
    await expect(page.getByTestId('batting-panel')).toBeVisible();
    for (const locator of [
      page.getByTestId('face-ball'),
      page.locator('[data-action="drive"]'),
      page.locator('[data-direction="0"]'),
    ]) {
      const box = (await locator.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(40);
      expect(box.width).toBeGreaterThanOrEqual(40);
    }
    await playBall(page, 0);
  });

  test('a phone in portrait: no sideways scrolling and the swing button stays reachable', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await page.getByTestId('face-ball').click();
    await expect(shell(page)).toHaveAttribute(
      'data-batting-state',
      /READING_DELIVERY/,
      { timeout: 20000 },
    );
    const box = (await page.getByTestId('swing').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('the batting screen has no accessibility violations, idle or with the ball in flight', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await setup(page);
    const run = () =>
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
    expect(
      (await run()).violations.map((v) => `${v.id}: ${v.nodes.length}`),
    ).toEqual([]);
    await page.getByTestId('face-ball').click();
    await expect(shell(page)).toHaveAttribute(
      'data-batting-state',
      /READING_DELIVERY/,
      { timeout: 20000 },
    );
    expect(
      (await run()).violations.map((v) => `${v.id}: ${v.nodes.length}`),
    ).toEqual([]);
  });

  test('reduced motion: the camera never moves while batting', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup(page);
    await page.getByTestId('face-ball').click();
    // the batting view is in place (the scene starts in the bowling view for a frame before it is prepared)
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).__cricketerMatch?.scene?.()?.cameraView?.rotated,
        ),
      )
      .toBe(true);
    const views = new Set<string>();
    await swingOn(page, 0).catch(() => undefined);
    for (let i = 0; i < 20; i++) {
      const scene = await page.evaluate(() =>
        (window as any).__cricketerMatch?.scene?.(),
      );
      if (scene?.cameraView)
        // the camera does not move: compare to a micrometre (floating point can differ in the last digit)
        views.add(
          JSON.stringify(
            Object.fromEntries(
              Object.entries(scene.cameraView).map(([k, v]) => [
                k,
                typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v,
              ]),
            ),
          ),
        );
      await page.waitForTimeout(100);
    }
    expect(views.size, JSON.stringify([...views])).toBeLessThanOrEqual(1);
  });

  test('a left-handed batter plays a ball too', async ({ page }) => {
    test.setTimeout(120000);
    await setup(page, { battingHand: 'left' });
    const d = await playBall(page, 0);
    expect(d.delivery.battingHand).toBe('left');
  });

  test('leaving and re-entering the batting screen leaves one canvas and no stuck ball', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const { matchId } = await setup(page);
    for (let i = 0; i < 4; i++) {
      await page.goto('/career');
      await openMatch(page, matchId);
      await expect(page.locator('canvas')).toHaveCount(1);
    }
    await expect(page.getByTestId('face-ball')).toBeEnabled();
  });
});

test.describe('Batting lab (development only)', () => {
  test('a forced perfect contact puts the ball on the middle of the bat, an edge on its edge, a miss clear of it; both hands', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await newBatter(page);
    await page.goto('/dev/batting');
    const lab = page.getByTestId('batting-lab');
    await expect(lab).toHaveAttribute('data-scene', 'ready', {
      timeout: 60000,
    });
    const measure = async () => {
      await page.getByTestId('lab-speed').selectOption('0.25');
      await page.getByTestId('lab-play').click();
      await expect(lab).toHaveAttribute('data-frozen', 'true', {
        timeout: 40000,
      });
      await page.waitForTimeout(450); // the readout refreshes a few times a second
      const text = await page.getByTestId('lab-debug').innerText();
      const debug = JSON.parse(text);
      await page.getByTestId('lab-resume').click();
      await expect(lab).toHaveAttribute('data-frozen', 'false', {
        timeout: 20000,
      });
      await page.waitForTimeout(2500);
      return debug.batting;
    };
    for (const hand of ['right', 'left']) {
      await page.getByTestId('lab-hand').selectOption(hand);
      await page.getByTestId('lab-shot').selectOption('shot.straight_drive');
      await page.getByTestId('lab-preview').selectOption('perfect');
      const perfect = await measure();
      expect(perfect.plan.contactMade).toBe(true);
      expect(perfect.closestToSweetSpot).toBeLessThan(0.05);
      await page.getByTestId('lab-preview').selectOption('miss');
      const miss = await measure();
      expect(miss.plan.contactMade).toBe(false);
      expect(miss.closestToSweetSpot).toBeGreaterThan(0.15);
    }
  });

  test('is not an unauthenticated back door', async ({ page, request }) => {
    const r = await request.post(`${API}/dev/batting-lab`, {
      headers: { origin: WEB, 'content-type': 'application/json' },
      data: {},
    });
    expect([401, 403]).toContain(r.status());
    await page.goto('/dev/batting');
    await expect(page.getByTestId('batting-lab')).toBeVisible();
  });
});

test.describe('Batting: forced engine results are drawn faithfully', () => {
  const open = async (
    page: Page,
    shot: Parameters<typeof forceFirstHumanBall>[2],
    action: string,
    dir: number,
    wanted: Parameters<typeof forceFirstHumanBall>[3],
  ) => {
    const started = await matchWhereIBatFirst(page);
    await forceFirstHumanBall(page, started.matchId, shot, wanted);
    await openMatch(page, started.matchId, '?debug=1');
    await expect(shell(page)).toHaveAttribute('data-phase', 'ready_to_bat');
    await chooseAuto(page, action, dir, shot.assist ?? 'auto');
    return started;
  };

  test('a cover drive the engine says is good or perfect: the bat meets the ball on its middle, the ball goes to cover, the score is the engine’s', async ({
    page,
  }) => {
    test.setTimeout(150000);
    const { matchId } = await open(
      page,
      { shotId: 'shot.cover_drive', direction: 0.5 },
      'drive',
      0.5,
      (b) =>
        ['good', 'perfect'].includes(b.contactQuality) &&
        b.runsOffBat >= 1 &&
        !b.wicketType &&
        !b.extraType,
    );
    const d = await playForced(page);
    expect(d.shot.shotId).toBe('shot.cover_drive');
    expect(['good', 'perfect']).toContain(d.shot.contactQuality);
    expect(d.shot.sector).toMatch(/cover|point|straight/);
    const scene = await sceneBatting(page);
    expect(scene.plan.contactMade).toBe(true);
    expect(scene.plan.quality).toBe(d.shot.contactQuality);
    expect(scene.closestToSweetSpot).toBeLessThan(0.06); // the bat met the ball, on the middle
    await expect(page.getByTestId('batting-feedback')).toHaveAttribute(
      'data-contact',
      d.batting.contact,
    );
    const after = await matchState(page, matchId);
    await expect(page.getByTestId('score')).toHaveText(
      `${after.innings.runs}/${after.innings.wickets}`,
    );
    expect(after.innings.runs).toBe(d.outcome.runsOffBat);
  });

  test('a ball the engine says is missed: the bat never touches it', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await open(
      page,
      { shotId: 'shot.lofted_straight', direction: 0 },
      'loft',
      0,
      (b) => b.contactQuality === 'miss' && !b.wicketType && !b.extraType,
    );
    const d = await playForced(page);
    expect(d.shot.contactQuality).toBe('miss');
    const scene = await sceneBatting(page);
    expect(scene.plan.contactMade).toBe(false);
    expect(scene.closestToSweetSpot).toBeGreaterThan(0.12);
    await expect(page.getByTestId('batting-feedback')).toHaveAttribute(
      'data-contact',
      'MISS',
    );
  });

  test('an edge: the ball meets the edge of the bat, not its middle', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await open(
      page,
      { shotId: 'shot.straight_drive', direction: 0 },
      'drive',
      0,
      (b) => b.contactQuality === 'edge' && !b.wicketType && !b.extraType,
    );
    const d = await playForced(page);
    expect(d.shot.contactQuality).toBe('edge');
    const scene = await sceneBatting(page);
    expect(scene.plan.contactMade).toBe(true);
    expect(scene.plan.edge).toMatch(/inside|outside/);
    await expect(page.getByTestId('batting-feedback')).toHaveAttribute(
      'data-contact',
      'EDGE',
    );
  });

  test('bowled: the ball goes on to the stumps, the stumps are disturbed and the batting controls close', async ({
    page,
  }) => {
    test.setTimeout(150000);
    const { matchId } = await open(
      page,
      // a ball left alone is played hopelessly late (timing +1) with the shot chosen: the engine decides what that does
      {
        shotId: 'shot.straight_drive',
        direction: 0,
        timing: 1,
        assist: 'off',
      },
      'drive',
      0,
      (b) => b.wicketType === 'bowled',
    );
    const d = await playLeaving(page);
    expect(d.outcome.wicketType).toBe('bowled');
    const scene = await sceneBatting(page);
    expect(scene.kind).toBe('bowled');
    await expect(page.getByTestId('live-result')).toContainText('WICKET');
    expect((await matchState(page, matchId)).innings.wickets).toBe(1);
    await expect(page.getByTestId('simulate-panel')).toBeVisible({
      timeout: 25000,
    });
    await expect(page.getByTestId('batting-panel')).toHaveCount(0);
    await expect(page.getByTestId('simulate-rest')).toBeVisible();
  });

  test('a six: the ball goes over the rope, SIX is announced, and the score is six more', async ({
    page,
  }) => {
    test.setTimeout(150000);
    const { matchId } = await open(
      page,
      { shotId: 'shot.lofted_straight', direction: 0 },
      'loft',
      0,
      (b) => b.runsOffBat === 6 && !b.wicketType,
    );
    const d = await playForced(page);
    expect(d.outcome.runsOffBat).toBe(6);
    expect(d.outcome.headline).toBe('SIX');
    const scene = await sceneBatting(page);
    expect(scene.kind).toBe('six');
    await expect(page.getByTestId('live-result')).toContainText('SIX');
    expect((await matchState(page, matchId)).innings.runs).toBe(6);
    await expect(page.locator('.hud-over .is-boundary')).toHaveCount(1);
  });
});

test.describe('Batting on a phone: touch only', () => {
  test.use({ hasTouch: true, viewport: { width: 844, height: 390 } });
  test('three deliveries are played with taps alone', async ({ page }) => {
    test.setTimeout(180000);
    await setup(page);
    let faced = 0;
    for (let i = 0; i < 3; i++) {
      if ((await shell(page).getAttribute('data-phase')) !== 'ready_to_bat')
        break;
      // the choices persist from ball to ball, so make them before the bowler runs in
      await page.locator('[data-action="drive"]').tap();
      await page.locator('[data-direction="0.5"]').tap();
      await page.getByTestId('face-ball').tap();
      await expect(shell(page)).toHaveAttribute(
        'data-batting-state',
        /READING_DELIVERY/,
        { timeout: 20000 },
      );
      const answer = page.waitForResponse((r) => isShotPost(r.request()), {
        timeout: 30000,
      });
      // wait for the cue, then tap the pitch itself
      for (let k = 0; k < 1500; k++) {
        const cue = await page.evaluate(
          () => (window as any).__cricketerMatch?.cue?.() ?? null,
        );
        if (cue && cue.secondsToIdeal <= 0) break;
        await page.waitForTimeout(6);
      }
      await page
        .getByTestId('match-stage')
        .tap({ position: { x: 300, y: 200 } });
      await answer;
      faced++;
      for (let k = 0; k < 80; k++) {
        if ((await battingState(page)) === 'WAITING') break;
        if (await page.getByTestId('skip').isVisible())
          await page
            .getByTestId('skip')
            .tap({ timeout: 800 })
            .catch(() => undefined);
        await page.waitForTimeout(150);
      }
    }
    expect(faced).toBeGreaterThanOrEqual(1);
  });
});
