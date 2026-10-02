import { appendFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { describeDb } from '../support/db';
import { buildAuthApp } from '../support/auth';
import type { App } from '../support/auth';
import {
  completeToss,
  finishByAi,
  flowOf,
  resultOf,
  startCareerMatch,
  stateOf,
} from '../support/match-flow';
import { MatchCompletionService } from '../../apps/api/src/modules/matches/match-completion.service';
import { replayMatch } from '../../packages/match-engine/src/index';
import type { MatchReplay } from '../../packages/match-engine/src/index';

type Ctx = Parameters<Parameters<typeof describeDb>[1]>[0];

async function app<T>(ctx: Ctx, run: (app: App) => Promise<T>): Promise<T> {
  const { app } = await buildAuthApp(ctx());
  try {
    return await run(app);
  } finally {
    await app.close();
  }
}

const now = () => performance.now();
async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = now();
  const out = await fn();
  return [out, now() - t0];
}
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor((p / 100) * values.length))
  ]!;

/**
 * Server-side timing of the match flow against a real database. The budgets are deliberately generous (they catch an
 * accidental N+1 or a recompute, not machine noise); the measured numbers are written to the file named by
 * `MATCH_FLOW_PERF_OUT` when it is set, and quoted in docs/match-flow/performance.md.
 */
describeDb('Module 11 performance (server)', (ctx) => {
  it(
    'flow, scorecard, result and the completion transaction stay fast',
    () =>
      app(ctx, async (app) => {
        const started = await startCareerMatch(app, ctx);
        const { browser, matchId, playerId } = started;
        const report: Record<string, number> = {};
        const sample = async (
          name: string,
          n: number,
          work: () => Promise<unknown>,
        ) => {
          const times: number[] = [];
          for (let i = 0; i < n; i++) times.push((await timed(work))[1]);
          report[`${name}.p50`] = Math.round(percentile(times, 50) * 10) / 10;
          report[`${name}.p95`] = Math.round(percentile(times, 95) * 10) / 10;
        };

        await sample('flow(pre-toss).ms', 20, () => flowOf(browser, matchId));
        const [, toss] = await timed(() =>
          completeToss(browser, matchId, { decision: 'bat' }),
        );
        report['toss+decision.ms'] = Math.round(toss * 10) / 10;
        await sample('state.ms', 20, () => stateOf(browser, matchId));

        // the last ball finishes the match: its request includes the whole completion transaction
        const [, finish] = await timed(() => finishByAi(browser, matchId));
        report['play the whole match by simulation.ms'] = Math.round(finish);
        await sample('scorecard.ms', 20, () =>
          browser.get(`/api/v1/matches/${matchId}/scorecard`),
        );
        await sample('result(stored).ms', 20, () => resultOf(browser, matchId));

        // the completion service alone, on the finished state (the gate row exists, so this is the idempotent path)
        const repos = ctx().database.repositories();
        const replay = (await repos.matches.getEngineSession(matchId))!
          .replay as MatchReplay;
        const service = new MatchCompletionService();
        const times: number[] = [];
        for (let i = 0; i < 10; i++)
          times.push(
            (
              await timed(() =>
                ctx().database.transaction(async (tx) => {
                  const r = ctx().database.repositories(tx);
                  await r.matches.lockMatch(matchId);
                  return service.apply({
                    repos: r as never,
                    matchId,
                    playerId,
                    state: replayMatch(replay).snapshot(),
                    input: replay.input,
                    now: new Date(),
                  });
                }),
              )
            )[1],
          );
        report['completion(idempotent path).p50'] =
          Math.round(percentile(times, 50) * 10) / 10;

        // a fresh match's completion, applied for the first time (the full path), measured through the result endpoint
        const second = await startCareerMatch(app, ctx);
        await completeToss(second.browser, second.matchId, {
          decision: 'bowl',
        });
        // play to the last ball, leaving the final request to carry the completion
        let state = await stateOf(second.browser, second.matchId);
        let finalMs = 0;
        for (
          let guard = 0;
          guard < 40 && state.phase !== 'completed';
          guard++
        ) {
          const path = state.phase === 'innings_break' ? 'advance' : 'simulate';
          const [r, ms] = await timed(() =>
            second.browser.post(
              `/api/v1/matches/${second.matchId}/${path}`,
              path === 'simulate' ? { mode: 'innings' } : {},
            ),
          );
          state = r.json().data.match;
          if (state.phase === 'completed') finalMs = ms;
        }
        report['final innings request incl. completion.ms'] =
          Math.round(finalMs);

        if (process.env.MATCH_FLOW_PERF_OUT)
          appendFileSync(
            process.env.MATCH_FLOW_PERF_OUT,
            JSON.stringify(report, null, 2) + '\n',
          );
        // budgets: a stored result and a scorecard are cheap reads; the completion path is one transaction
        expect(report['flow(pre-toss).ms.p95']).toBeLessThan(250);
        expect(report['scorecard.ms.p95']).toBeLessThan(400);
        expect(report['result(stored).ms.p95']).toBeLessThan(250);
        expect(report['completion(idempotent path).p50']).toBeLessThan(300);
        expect(
          report['final innings request incl. completion.ms'],
        ).toBeLessThan(3000);
      }),
    180000,
  );
});
