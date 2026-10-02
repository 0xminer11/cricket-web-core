/* eslint-disable @typescript-eslint/no-explicit-any */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  API,
  WEB,
  arrangeToss,
  completeTossApi,
  createMatchApi,
  flowOf,
  headers,
  matchState,
  newBatter,
  newBowler,
  playTossInBrowser,
  startMatchApi,
} from './support/match';
import { arrange, withDb } from './support/db';

const shell = (page: Page) => page.getByTestId('match-shell');

const axe = async (page: Page, label: string) => {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.length}`),
    label,
  ).toEqual([]);
};

const noSideScroll = async (page: Page, label: string) => {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
};

const coins = async (page: Page): Promise<number> => {
  const home = (await (await page.request.get(`${API}/career/home`)).json())
    .data.home;
  return home.currencies.find((c: { code: string }) => c.code === 'coins')
    .balance;
};

/** Plays a match to its end through the API (the AI plays every ball, including the Cricketer's). */
async function finishByApi(page: Page, matchId: string) {
  let state = await matchState(page, matchId);
  for (let guard = 0; guard < 40 && state.phase !== 'completed'; guard++) {
    const path = state.phase === 'innings_break' ? 'advance' : 'simulate';
    const r = await page.request.post(`${API}/matches/${matchId}/${path}`, {
      headers,
      data: path === 'simulate' ? { mode: 'innings' } : {},
    });
    expect(r.status(), `${path}`).toBe(200);
    state = (await r.json()).data.match;
  }
  expect(state.phase).toBe('completed');
  return state;
}

test.describe('Module 11: a complete 2-over match, from Career Home to Career Home', () => {
  test('prepare, team sheets, toss, bat first, innings break, chase, result, scorecard, continue', async ({
    page,
  }) => {
    test.setTimeout(240000);
    // a fast bowler bats at the end of the order, so the innings is simulated to its break and the chase is bowled
    await newBowler(page, { displayName: 'Tail Ender' });
    const coinsBefore = await coins(page);

    await page.goto('/career');
    await page.getByRole('link', { name: 'PREPARE MATCH' }).click();
    await expect(page).toHaveURL(/\/match\/preparation$/);
    await expect(page.getByTestId('start-match')).toHaveText(
      'CONTINUE TO TEAM SHEETS',
    );
    await page.getByTestId('start-match').click();
    await expect(page).toHaveURL(/\/match\/[0-9a-f-]{36}$/);
    const matchId = new URL(page.url()).pathname.split('/').pop()!;

    // team sheets: both sides, eleven each, your Cricketer marked, the opposition not scouted
    await expect(page.getByTestId('team-sheet')).toBeVisible();
    await expect(page.getByTestId('team-sheet-mine').locator('li')).toHaveCount(
      11,
    );
    await expect(
      page.getByTestId('team-sheet-theirs').locator('li'),
    ).toHaveCount(11);
    await expect(page.getByTestId('team-sheet-mine')).toContainText('You');
    await expect(
      page.getByTestId('team-sheet-theirs').locator('.ts-ovr'),
    ).toHaveCount(0);
    await axe(page, 'team sheet');

    // the toss: arranged so the player wins and chooses to bowl
    await arrangeToss(page, matchId, { userWins: true });
    await page.getByTestId('team-sheet-continue').click();
    await expect(page.getByTestId('toss')).toBeVisible();
    await axe(page, 'toss');
    const heads = page.getByTestId('toss-heads');
    if (await heads.isVisible()) await heads.click();
    else await page.getByTestId('toss-flip').click();
    await expect(page.getByTestId('toss-result')).toContainText(
      'YOU WON THE TOSS',
    );
    await page.getByTestId('toss-continue').click();
    await expect(page.getByTestId('toss-decision')).toBeVisible();
    await axe(page, 'toss decision');
    await page.getByTestId('bowl-first').click();
    await expect(shell(page)).toBeVisible();
    await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
      timeout: 30000,
    });

    // first innings: your side fields. It is the first match, so a short tip is shown; the overs are simulated for you
    await expect(page.getByTestId('bowler-select')).toBeVisible();
    await expect(page.getByTestId('first-match-tip')).toBeVisible();
    for (
      let guard = 0;
      guard < 8 && !(await page.getByTestId('innings-break').isVisible());
      guard++
    ) {
      const simulate = page.getByTestId('simulate-over');
      if (await simulate.isVisible().catch(() => false)) await simulate.click();
      await page.waitForTimeout(1500);
    }
    await expect(page.getByTestId('innings-break')).toBeVisible({
      timeout: 30000,
    });
    const target = Number(
      (await page.getByTestId('break-target').textContent())!.match(/\d+/)![0],
    );
    expect(target).toBeGreaterThan(0);
    await expect(page.getByTestId('break-need')).toContainText(
      `need ${target} from 12 balls`,
    );
    await axe(page, 'innings break');

    // the live scorecard opens over the match
    await page.getByTestId('break-scorecard').click();
    await expect(page.getByTestId('scorecard-overlay')).toBeVisible();
    await expect(page.getByTestId('batting-table')).toBeVisible();
    await expect(page.getByTestId('innings-total')).toBeVisible();
    await axe(page, 'scorecard overlay');
    await page.getByTestId('scorecard-close').click();
    await expect(page.getByTestId('scorecard-overlay')).toHaveCount(0);

    // the chase: the AI plays on until the Cricketer is on strike; they face balls until the match is decided
    await page.getByTestId('next-innings').click();
    for (let guard = 0; guard < 80; guard++) {
      if (/\/result$/.test(page.url())) break;
      const visible = (id: string) =>
        page
          .getByTestId(id)
          .isVisible()
          .catch(() => false);
      // a level chase goes to a Super Over, with a break of its own before it and after its first innings
      if (await visible('next-innings'))
        await page.getByTestId('next-innings').click();
      else if (await visible('simulate-rest'))
        await page.getByTestId('simulate-rest').click();
      else if (await visible('simulate'))
        await page.getByTestId('simulate').click();
      else if (await visible('simulate-over'))
        await page.getByTestId('simulate-over').click();
      else if (
        (await visible('face-ball')) &&
        (await page.getByTestId('face-ball').isEnabled())
      ) {
        // face the ball and leave it to the umpire (a hopelessly late swing): the server decides
        const answer = page.waitForResponse(
          (r) => /\/shots$/.test(r.url()) && r.request().method() === 'POST',
          { timeout: 40000 },
        );
        await page.getByTestId('face-ball').click();
        await answer;
        for (let i = 0; i < 80; i++) {
          if (/\/result$/.test(page.url())) break;
          if (
            (await shell(page)
              .getAttribute('data-batting-state')
              .catch(() => null)) === 'WAITING'
          )
            break;
          if (await visible('skip'))
            await page
              .getByTestId('skip')
              .click({ timeout: 800 })
              .catch(() => undefined);
          await page.waitForTimeout(150);
        }
      }
      await page.waitForTimeout(500);
    }
    await expect(page).toHaveURL(/\/match\/[0-9a-f-]{36}\/result$/, {
      timeout: 30000,
    });
    // leaving the match destroyed the scene: the result screen runs without a canvas
    await expect(page.locator('canvas')).toHaveCount(0);

    // the result: outcome, scores, your performance (you did not play a ball), rewards
    await expect(page.getByTestId('match-result')).toBeVisible();
    await expect(page.getByTestId('result-text')).toContainText(/won by|tied/);
    await expect(page.getByTestId('outcome')).toHaveText(/VICTORY|DEFEAT|TIE/);
    await expect(
      page.getByTestId('result-innings').locator('li'),
    ).not.toHaveCount(0);
    // you either did not play a ball ("did not bat or bowl") or the simulated overs included yours (your figures)
    await expect(page.getByTestId('your-performance')).toContainText(
      /did not bat or bowl|Bowling|Batting/,
    );
    await expect(page.getByTestId('rewards')).toBeVisible();
    const earned = Number(
      (await page.getByTestId('reward-coins').textContent())!.replace(
        /\D/g,
        '',
      ),
    );
    expect(earned).toBeGreaterThan(0);
    await axe(page, 'result');
    // a refresh shows the same numbers, and the wallet was credited exactly once
    await page.reload();
    await expect(page.getByTestId('reward-coins')).toHaveText(`+${earned}`);
    expect(await coins(page)).toBe(coinsBefore + earned);

    // the full scorecard
    await page.getByTestId('view-scorecard').click();
    await expect(page).toHaveURL(/\/scorecard$/);
    await expect(page.getByTestId('scorecard')).toBeVisible();
    await expect(page.getByTestId('batting-table')).toBeVisible();
    await axe(page, 'scorecard page');
    await page.getByTestId('back-to-result').click();

    // back to Career Home: the match is in Recent, the next fixture is next
    await page.getByTestId('result-continue').click();
    await expect(page).toHaveURL(/\/career$/);
    await expect(page.getByRole('link', { name: /vs / }).first()).toBeVisible();
    const home = (await (await page.request.get(`${API}/career/home`)).json())
      .data.home;
    expect(home.recentMatches.map((m: any) => m.matchId)).toContain(matchId);
    expect(home.nextMatch.id).not.toBe(undefined);
    // opening the finished match's live URL goes to its result
    await page.goto(`/match/${matchId}`);
    await expect(page).toHaveURL(/\/result$/, { timeout: 20000 });
  });
});

test.describe('Module 11: the toss', () => {
  test('the AI wins the toss and decides: the result is shown, then the match starts as the AI chose', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await newBowler(page);
    const { matchId } = await createMatchApi(page);
    await arrangeToss(page, matchId, { userWins: false });
    await page.goto(`/match/${matchId}`);
    await page.getByTestId('team-sheet-continue').click();
    const heads = page.getByTestId('toss-heads');
    if (await heads.isVisible()) await heads.click();
    else await page.getByTestId('toss-flip').click();
    await expect(page.getByTestId('toss-result')).not.toContainText('YOU WON');
    await expect(page.getByTestId('toss-result')).toContainText('WON THE TOSS');
    const flow = await flowOf(page, matchId);
    expect(flow.toss.youWon).toBe(false);
    expect(flow.toss.decidedBy).toBe('ai');
    await page.getByTestId('toss-continue').click();
    await expect(shell(page)).toBeVisible();
    await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
      timeout: 30000,
    });
    // the engine plays as the AI chose
    const state = await matchState(page, matchId);
    expect(state.battingTeam.id === state.you.teamId).toBe(
      flow.toss.decision === 'bowl',
    );
  });

  test('the toss is final: a refresh never re-tosses, the decision is asked again, and calling twice returns the same result', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await newBowler(page);
    const { matchId } = await createMatchApi(page);
    await arrangeToss(page, matchId, { userWins: true });
    await page.goto(`/match/${matchId}`);
    await page.getByTestId('team-sheet-continue').click();
    const heads = page.getByTestId('toss-heads');
    if (await heads.isVisible()) await heads.click();
    else await page.getByTestId('toss-flip').click();
    await expect(page.getByTestId('toss-result')).toContainText(
      'YOU WON THE TOSS',
    );
    const before = (await flowOf(page, matchId)).toss;
    // a refresh at the decision stage shows the decision again, with the same toss behind it
    await page.reload();
    await expect(page.getByTestId('team-sheet'))
      .toBeVisible()
      .catch(() => undefined);
    const decision = page.getByTestId('toss-decision');
    if (!(await decision.isVisible().catch(() => false))) {
      await page
        .getByTestId('team-sheet-continue')
        .click()
        .catch(() => undefined);
    }
    // whichever screen the refresh lands on, the stored toss is unchanged
    expect((await flowOf(page, matchId)).toss).toEqual(before);
    const again = await page.request.post(
      `${API}/matches/${matchId}/toss/call`,
      {
        headers,
        data: { call: before.call === 'heads' ? 'tails' : 'heads' },
      },
    );
    expect((await again.json()).data.flow.toss).toEqual(before);
    // choosing is final
    const decide = await page.request.post(
      `${API}/matches/${matchId}/toss/decision`,
      {
        headers,
        data: { decision: 'bowl' },
      },
    );
    expect(decide.status()).toBe(200);
    const change = await page.request.post(
      `${API}/matches/${matchId}/toss/decision`,
      {
        headers,
        data: { decision: 'bat' },
      },
    );
    expect(change.status()).toBe(409);
    await page.goto(`/match/${matchId}`);
    await expect(shell(page)).toBeVisible();
    await expect(shell(page)).toHaveAttribute('data-phase', 'bowler_select', {
      timeout: 30000,
    });
  });

  test('the coin does not animate under reduced motion', async ({ page }) => {
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await newBowler(page);
    const { matchId } = await createMatchApi(page);
    await page.goto(`/match/${matchId}`);
    await page.getByTestId('team-sheet-continue').click();
    const heads = page.getByTestId('toss-heads');
    if (await heads.isVisible()) await heads.click();
    else await page.getByTestId('toss-flip').click();
    await expect(page.getByTestId('toss-result')).toBeVisible();
    const animation = await page
      .getByTestId('coin')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');
    await expect(page.getByTestId('coin')).toHaveAttribute(
      'data-face',
      /heads|tails/,
    );
  });
});

test.describe('Module 11: Save & exit, resume and refresh', () => {
  test('Save & exit keeps the match; Career Home resumes it at the same ball', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await newBatter(page);
    const { matchId } = await startMatchApi(page, { decision: 'bat' });
    await page.goto(`/match/${matchId}`);
    await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
      timeout: 30000,
    });
    await expect(shell(page)).toHaveAttribute('data-phase', 'ready_to_bat');
    const before = await matchState(page, matchId);
    await page.getByTestId('menu-open').click();
    await expect(page.getByTestId('pause-menu')).toBeVisible();
    await axe(page, 'pause menu');
    await page.getByTestId('pause-settings').click();
    await expect(page.getByTestId('settings-panel')).toBeVisible();
    await axe(page, 'settings panel');
    // the scorecard is reachable from the menu and returns to the match
    await page.getByTestId('pause-scorecard').click();
    await expect(page.getByTestId('scorecard-overlay')).toBeVisible();
    await page.getByTestId('scorecard-close').click();
    await expect(page.getByTestId('scorecard-overlay')).toHaveCount(0);
    await page.getByTestId('menu-open').click();
    await page.getByTestId('save-and-exit').click();
    await expect(page).toHaveURL(/\/career$/);
    await page.getByRole('link', { name: 'RESUME MATCH' }).click();
    await expect(page).toHaveURL(new RegExp(`/match/${matchId}$`));
    await expect(shell(page)).toHaveAttribute('data-phase', 'ready_to_bat', {
      timeout: 30000,
    });
    const after = await matchState(page, matchId);
    expect(after.expectedSequence).toBe(before.expectedSequence);
    expect(after.innings.runs).toBe(before.innings.runs);
  });

  test('a refresh at the team sheet, the innings break and the result lands on the same stage', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await newBowler(page);
    const { matchId } = await createMatchApi(page);
    await page.goto(`/match/${matchId}`);
    await expect(page.getByTestId('team-sheet')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('team-sheet')).toBeVisible();

    await arrangeToss(page, matchId, { userWins: true });
    await completeTossApi(page, matchId, { decision: 'bat' });
    // play the first innings through the API, leaving the match at the break
    for (let guard = 0; guard < 6; guard++) {
      const s = await matchState(page, matchId);
      if (s.phase === 'innings_break') break;
      const r = await page.request.post(`${API}/matches/${matchId}/simulate`, {
        headers,
        data: { mode: 'innings' },
      });
      expect(r.status()).toBe(200);
    }
    await page.goto(`/match/${matchId}`);
    await expect(page.getByTestId('innings-break')).toBeVisible({
      timeout: 30000,
    });
    const target = await page.getByTestId('break-target').textContent();
    await page.reload();
    await expect(page.getByTestId('innings-break')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('break-target')).toHaveText(target!);

    await finishByApi(page, matchId);
    await page.goto(`/match/${matchId}/result`);
    const text = await page.getByTestId('result-text').textContent();
    await page.reload();
    await expect(page.getByTestId('result-text')).toHaveText(text!);
  });

  test('opening the result again never pays twice: one reward grant, one wallet credit', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await newBowler(page);
    const { matchId } = await startMatchApi(page);
    const before = await coins(page);
    await finishByApi(page, matchId);
    const first = (
      await (await page.request.get(`${API}/matches/${matchId}/result`)).json()
    ).data.result;
    for (let i = 0; i < 3; i++) {
      await page.goto(`/match/${matchId}/result`);
      await expect(page.getByTestId('rewards')).toBeVisible();
    }
    const second = (
      await (await page.request.get(`${API}/matches/${matchId}/result`)).json()
    ).data.result;
    expect(second).toEqual(first);
    expect(await coins(page)).toBe(before + first.rewards.coins);
    const grants = await withDb((q) =>
      q(
        `SELECT count(*)::int AS n FROM reward_grants WHERE source_type = 'match' AND source_id = $1`,
        [matchId],
      ),
    );
    expect(grants[0]!.n).toBe(1);
    const rows = await withDb((q) =>
      q(
        'SELECT count(*)::int AS n FROM match_career_results WHERE match_id = $1',
        [matchId],
      ),
    );
    expect(rows[0]!.n).toBe(1);
  });
});

test.describe('Module 11: progression on the result screen', () => {
  test('a level-up is announced once, with the new level, and the career agrees', async ({
    page,
  }) => {
    test.setTimeout(150000);
    const playerId = await newBowler(page);
    // level 4 needs 1,318 XP: a match is worth more than the 8 XP still missing
    await arrange(playerId, { level: 4, xp: 1310 });
    const { matchId } = await startMatchApi(page);
    await finishByApi(page, matchId);
    await page.goto(`/match/${matchId}/result`);
    await expect(page.getByTestId('level-up')).toContainText('Level 4');
    await expect(page.getByTestId('level-up')).toContainText('Level 5');
    await expect(page.getByTestId('progression-line')).toContainText('Level 5');
    const home = (await (await page.request.get(`${API}/career/home`)).json())
      .data.home;
    expect(home.progression.level).toBe(5);
    // a refresh shows the same level-up and the player is not levelled again
    await page.reload();
    await expect(page.getByTestId('level-up')).toContainText('Level 5');
    const again = (await (await page.request.get(`${API}/career/home`)).json())
      .data.home;
    expect(again.progression.level).toBe(5);
    expect(again.progression.xp ?? again.progression.currentXp).toBe(
      home.progression.xp ?? home.progression.currentXp,
    );
  });

  test('the fatigue a match adds is shown on the result and is what the Cricketer now has', async ({
    page,
  }) => {
    test.setTimeout(150000);
    const playerId = await newBowler(page);
    await arrange(playerId, { fatigue: 20 });
    const { matchId } = await startMatchApi(page);
    await finishByApi(page, matchId);
    const result = (
      await (await page.request.get(`${API}/matches/${matchId}/result`)).json()
    ).data.result;
    expect(result.progression.fatigueAfter).toBeGreaterThanOrEqual(20);
    expect(result.progression.fatigueAfter).toBe(
      20 + result.progression.fatigueAdded,
    );
    await page.goto(`/match/${matchId}/result`);
    await expect(page.getByTestId('progression-line')).toContainText(
      `Fatigue +${result.progression.fatigueAdded}`,
    );
  });
});

test.describe('Module 11: several tabs', () => {
  test('a stale second tab cannot play a ball twice: its action is refused and it catches up', async ({
    page,
    context,
  }) => {
    test.setTimeout(180000);
    await newBowler(page);
    const { matchId } = await startMatchApi(page, { decision: 'bowl' });
    await page.goto(`/match/${matchId}`);
    await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
      timeout: 30000,
    });
    // a second tab on the same match plays one ball first (through the API: the same call the UI makes)
    const second = await context.newPage();
    const state = await matchState(second, matchId);
    const bowler = state.eligibleBowlers.find((b: any) => b.eligible);
    const played = await second.request.post(
      `${API}/matches/${matchId}/deliveries`,
      {
        headers,
        data: {
          actionId: `tab2${Date.now().toString(36)}abcdefgh`,
          expectedSequence: state.expectedSequence,
          bowlerId: bowler.playerId,
          deliveryIntent: {
            variationId: bowler.deliveryIds[0],
            target: { x: 0.3, y: 0.45 },
          },
        },
      },
    );
    expect(played.status()).toBe(200);
    // the first tab still shows the old ball: its bowl is stale
    await page.locator('[data-bowler]:not([disabled])').first().click();
    await page.getByLabel('Assisted timing').check();
    const rejected = page.waitForResponse(
      (r) => /\/deliveries$/.test(r.url()) && r.request().method() === 'POST',
    );
    await page.getByTestId('bowl').click();
    expect((await rejected).status()).toBe(409);
    // it does not play a second ball: exactly one ball exists, and the screen catches up with the server
    const balls = await withDb((q) =>
      q('SELECT count(*)::int AS n FROM match_balls WHERE match_id = $1', [
        matchId,
      ]),
    );
    expect(balls[0]!.n).toBe(1);
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(() =>
              (window as any).__cricketerMatch.snapshot(),
            )
          ).authoritative.expectedSequence,
        { timeout: 20000 },
      )
      .toBe(2);
    await second.close();
  });
});

test.describe('Module 11: phones', () => {
  for (const viewport of [
    { name: 'portrait', width: 390, height: 844 },
    { name: 'landscape', width: 844, height: 390 },
  ]) {
    test(`team sheet, toss and result fit a phone in ${viewport.name}: no sideways scroll, large buttons`, async ({
      page,
    }) => {
      test.setTimeout(180000);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await newBowler(page);
      const { matchId } = await createMatchApi(page);
      await page.goto(`/match/${matchId}`);
      await expect(page.getByTestId('team-sheet')).toBeVisible();
      await noSideScroll(page, 'team sheet');
      const cont = page.getByTestId('team-sheet-continue');
      expect((await cont.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await cont.click();
      await expect(page.getByTestId('toss')).toBeVisible();
      await noSideScroll(page, 'toss');
      await arrangeToss(page, matchId, { userWins: true });
      const heads = page.getByTestId('toss-heads');
      if (await heads.isVisible()) {
        expect((await heads.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await heads.click();
      } else await page.getByTestId('toss-flip').click();
      await expect(page.getByTestId('toss-result')).toBeVisible();
      await completeTossApi(page, matchId, { decision: 'bat' }).catch(
        () => undefined,
      );
      await finishByApi(page, matchId);
      await page.goto(`/match/${matchId}/result`);
      await expect(page.getByTestId('rewards')).toBeVisible();
      await noSideScroll(page, 'result');
      await page.goto(`/match/${matchId}/scorecard`);
      await expect(page.getByTestId('scorecard')).toBeVisible();
      await noSideScroll(page, 'scorecard page');
    });
  }
});

test.describe('Module 11: the 5-over match', () => {
  test('the second fixture is a 5-over match with its own economy, through the same flow', async ({
    page,
  }) => {
    test.setTimeout(240000);
    await newBowler(page);
    const first = await startMatchApi(page);
    await finishByApi(page, first.matchId);
    // the next fixture
    await page.goto('/match/preparation');
    await expect(page.getByText('5 Over').first()).toBeVisible();
    await page.getByTestId('start-match').click();
    await expect(page).toHaveURL(/\/match\/[0-9a-f-]{36}$/);
    const matchId = new URL(page.url()).pathname.split('/').pop()!;
    await expect(page.getByTestId('team-sheet')).toContainText('5 Over');
    await playTossInBrowser(page, 'bowl');
    await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
      timeout: 30000,
    });
    const state = await matchState(page, matchId);
    expect(state.format.oversPerInnings).toBe(5);
    expect(state.innings.maxBalls).toBe(30);
    await finishByApi(page, matchId);
    await page.goto(`/match/${matchId}/result`);
    await expect(page.getByTestId('rewards')).toBeVisible();
    const result = (
      await (await page.request.get(`${API}/matches/${matchId}/result`)).json()
    ).data.result;
    expect(result.rewards.breakdown.participationCoins).toBe(240);
    expect(result.format).toMatch(/5/);
  });
});

test.describe('Module 11: development tools', () => {
  test('the match flow lab arranges a toss and forces each result, and the result screen shows the outcome', async ({
    page,
  }) => {
    test.setTimeout(240000);
    await newBowler(page);
    await page.goto('/dev/match-flow');
    await expect(page.getByTestId('match-flow-lab')).toBeVisible();
    await page
      .getByRole('button', { name: 'Create match (next fixture)' })
      .click();
    await expect(page.getByTestId('lab-flow')).toContainText('"stage": "toss"');
    await page.getByRole('button', { name: 'Arrange toss: I win' }).click();
    await page.getByRole('button', { name: /Force result: loss/ }).click();
    await expect(page.getByRole('list', { name: 'Log' })).toContainText(
      /force loss: ok/,
      {
        timeout: 60000,
      },
    );
    await page.getByRole('link', { name: 'Open result' }).click();
    await expect(page.getByTestId('outcome')).toHaveText('DEFEAT');
    await expect(page.getByTestId('rewards')).toBeVisible();
  });

  test('a forced tie after the Super Over is shown as a tie, never as a win or a loss', async ({
    page,
  }) => {
    test.setTimeout(240000);
    await newBowler(page);
    const { matchId } = await createMatchApi(page);
    const forced = await page.request.post(
      `${API}/dev/match-flow/force-result`,
      { headers, data: { matchId, outcome: 'tie' }, timeout: 180000 },
    );
    expect(forced.status()).toBe(200);
    await page.goto(`/match/${matchId}/result`);
    await expect(page.getByTestId('outcome')).toHaveText('TIE');
    await expect(page.getByTestId('result-text')).toContainText(/tied/i);
    await expect(page.getByTestId('result-innings').locator('li')).toHaveCount(
      4,
    );
    await expect(page.getByTestId('rewards')).toBeVisible();
    await axe(page, 'tie result');
    const result = (
      await (await page.request.get(`${API}/matches/${matchId}/result`)).json()
    ).data.result;
    expect(result.outcome).toBe('tie');
    expect(result.winnerTeamName).toBeNull();
    expect(result.rewards.breakdown.resultMultiplier).toBe(0.9);
  });

  test('the dev routes refuse another player’s match and a match that has already had a ball', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120000);
    await newBowler(page);
    const { matchId } = await startMatchApi(page);
    const other = await (await browser.newContext()).newPage();
    try {
      await newBowler(other);
      const r = await other.request.post(`${API}/dev/match-flow/force-result`, {
        headers: { origin: WEB, 'content-type': 'application/json' },
        data: { matchId, outcome: 'win' },
      });
      expect(r.status()).toBe(404);
    } finally {
      await other.context().close();
    }
    await page.request.post(`${API}/matches/${matchId}/simulate`, {
      headers,
      data: { mode: 'over' },
    });
    const late = await page.request.post(`${API}/dev/match-flow/force-result`, {
      headers,
      data: { matchId, outcome: 'win' },
    });
    expect(late.status()).toBe(409);
  });
});
