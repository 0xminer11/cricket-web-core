import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import {
  API,
  arrangeToss,
  headers,
  matchState,
  newBowler,
} from './support/match';

const shell = (page: Page) => page.getByTestId('match-shell');

/**
 * Browser-side timing of the match flow on this machine (development server, so slower than a production build).
 * Budgets are generous: they catch a regression such as a blocking request or a scene that never becomes ready. The
 * numbers are written to test-results/match-flow-perf.json and quoted in docs/match-flow/performance.md.
 */
test.describe('Module 11: performance', () => {
  test('preparation, team sheet, scene load, result screen and ten re-entries', async ({
    page,
  }) => {
    test.setTimeout(240000);
    const report: Record<string, number> = {};
    await newBowler(page);

    let t0 = Date.now();
    await page.goto('/match/preparation');
    await expect(page.getByTestId('start-match')).toBeVisible();
    report['preparation screen ready (ms)'] = Date.now() - t0;

    t0 = Date.now();
    await page.getByTestId('start-match').click();
    await expect(page.getByTestId('team-sheet')).toBeVisible();
    report['start match -> team sheet visible (ms)'] = Date.now() - t0;
    const matchId = new URL(page.url()).pathname.split('/').pop()!;

    await arrangeToss(page, matchId, { userWins: true });
    t0 = Date.now();
    await page.getByTestId('team-sheet-continue').click();
    await expect(page.getByTestId('toss')).toBeVisible();
    report['team sheet -> toss screen (ms)'] = Date.now() - t0;
    const heads = page.getByTestId('toss-heads');
    t0 = Date.now();
    if (await heads.isVisible()) await heads.click();
    else await page.getByTestId('toss-flip').click();
    await expect(page.getByTestId('toss-result')).toBeVisible();
    report['toss call -> result shown (ms)'] = Date.now() - t0;
    await page.getByTestId('toss-continue').click();
    t0 = Date.now();
    await page.getByTestId('bowl-first').click();
    await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
      timeout: 30000,
    });
    report['decision -> match scene ready (ms)'] = Date.now() - t0;

    // ten times out of the match and back in (client-side), counting canvases and key handlers
    for (let i = 0; i < 10; i++) {
      await page.getByTestId('menu-open').click();
      await page.getByTestId('save-and-exit').click();
      await expect(page).toHaveURL(/\/career$/);
      await expect(page.locator('canvas')).toHaveCount(0);
      await page.goBack();
      await expect(shell(page)).toHaveAttribute('data-scene', 'ready', {
        timeout: 30000,
      });
      await expect(page.locator('canvas')).toHaveCount(1);
    }
    const heap = await page.evaluate(
      () =>
        (performance as unknown as { memory?: { usedJSHeapSize: number } })
          .memory?.usedJSHeapSize ?? 0,
    );
    report['JS heap after 10 re-entries (MB)'] = Math.round(heap / 1e5) / 10;

    // finish by the API and open the result
    for (let guard = 0; guard < 40; guard++) {
      const state = await matchState(page, matchId);
      if (state.phase === 'completed') break;
      const path = state.phase === 'innings_break' ? 'advance' : 'simulate';
      await page.request.post(`${API}/matches/${matchId}/${path}`, {
        headers,
        data: path === 'simulate' ? { mode: 'innings' } : {},
      });
    }
    t0 = Date.now();
    await page.goto(`/match/${matchId}/result`);
    await expect(page.getByTestId('rewards')).toBeVisible();
    report['open result (first view, effects already applied) (ms)'] =
      Date.now() - t0;
    t0 = Date.now();
    await page.reload();
    await expect(page.getByTestId('rewards')).toBeVisible();
    report['result refresh (ms)'] = Date.now() - t0;

    writeFileSync(
      'test-results/match-flow-perf.json',
      JSON.stringify(report, null, 2),
    );
    expect(report['start match -> team sheet visible (ms)']).toBeLessThan(5000);
    expect(report['decision -> match scene ready (ms)']).toBeLessThan(15000);
    expect(
      report['open result (first view, effects already applied) (ms)'],
    ).toBeLessThan(6000);
  });
});
