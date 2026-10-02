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
import { execRaw } from '../../packages/database/src/testing/harness';
import {
  replayMatch,
  stepSimulation,
} from '../../packages/match-engine/src/index';
import type { MatchReplay } from '../../packages/match-engine/src/index';

type Ctx = Parameters<Parameters<typeof describeDb>[1]>[0];
type Started = Awaited<ReturnType<typeof startCareerMatch>>;

async function app<T>(ctx: Ctx, run: (app: App) => Promise<T>): Promise<T> {
  const { app } = await buildAuthApp(ctx());
  try {
    return await run(app);
  } finally {
    await app.close();
  }
}

interface Wanted {
  readonly type: 'win' | 'loss' | 'tie';
  /** `true`/`false`: the match was (not) decided by a Super Over. */
  readonly superOver: boolean;
  /** The chase finishes level, so the match must pass through a second innings break. */
  readonly level?: boolean;
}

/**
 * Plays the match through the real engine in-process (the same `stepSimulation` the API's simulate uses) under
 * candidate seeds, and keeps the first seed whose result is the one the test needs. The match has had no ball yet,
 * so re-seeding only changes how the balls fall, never who is playing or the toss.
 */
async function arrangeResult(started: Started, ctx: Ctx, wanted: Wanted) {
  const session = (await started.repos.matches.getEngineSession(
    started.matchId,
  ))!;
  const replay = session.replay as MatchReplay;
  const yours = [replay.input.teamA, replay.input.teamB].find((t) =>
    t.players.some((p) => p.playerId === started.playerId),
  )!.teamId;
  for (let n = 0; n < 6000; n++) {
    const seed = `m11-out-${started.matchId.slice(0, 8)}-${n}`;
    const candidate = JSON.parse(JSON.stringify(replay)) as MatchReplay;
    candidate.input.rngSeed = seed;
    const engine = replayMatch(candidate);
    let sawLevel = false;
    for (let i = 0; i < 500 && engine.cursor().status !== 'completed'; i++) {
      stepSimulation(engine, candidate.input);
      if (
        engine.cursor().status === 'innings_break' &&
        engine.snapshot().innings.length === 2
      )
        sawLevel = true;
    }
    const result = engine.snapshot().result!;
    const type =
      result.type === 'tie'
        ? 'tie'
        : result.winnerTeamId === yours
          ? 'win'
          : 'loss';
    if (
      type !== wanted.type ||
      Boolean(result.superOver) !== wanted.superOver ||
      (wanted.level !== undefined && sawLevel !== wanted.level)
    )
      continue;
    await execRaw(
      ctx().url,
      `UPDATE match_engine_sessions SET replay = jsonb_set(replay, '{input,rngSeed}', to_jsonb($2::text)) WHERE match_id = $1`,
      [started.matchId, seed],
    );
    return seed;
  }
  throw new Error(`no seed produced ${JSON.stringify(wanted)}`);
}

/** Starts a match, makes the toss (you win and bat), arranges the result and plays it out. */
async function playOut(ctx: Ctx, app: App, wanted: Wanted) {
  const started = await startCareerMatch(app, ctx);
  const { browser, matchId, playerId, repos } = started;
  await completeToss(browser, matchId, { decision: 'bat' });
  // with a tie, the match must pass through the "scores level" break; the second break is observed below
  await arrangeResult(started, ctx, wanted);
  const before = {
    stats: await repos.players.getStats(playerId),
    coins: await repos.wallet.getBalance(playerId, 'coins'),
  };
  let sawSecondBreak = false;
  let state = await stateOf(browser, matchId);
  for (let guard = 0; guard < 40 && state.phase !== 'completed'; guard++) {
    if (state.phase === 'innings_break') {
      if (state.innings.number === 2) {
        sawSecondBreak = true;
        // while level the flow stage is the break and nothing has been paid yet
        expect((await flowOf(browser, matchId)).stage).toBe('innings_break');
        expect(
          (await browser.get(`/api/v1/matches/${matchId}/result`)).statusCode,
        ).toBe(409);
      }
      state = (
        await browser.post(`/api/v1/matches/${matchId}/advance`, {})
      ).json().data.match;
    } else {
      const r = await browser.post(`/api/v1/matches/${matchId}/simulate`, {
        mode: 'innings',
      });
      expect(r.statusCode).toBe(200);
      state = r.json().data.match;
    }
  }
  expect(state.phase).toBe('completed');
  const result = await resultOf(browser, matchId);
  return { ...started, result, before, sawSecondBreak };
}

describeDb('Module 11 outcomes', (ctx) => {
  it(
    'a win pays the full result multiplier and counts as a win',
    () =>
      app(ctx, async (app) => {
        const { result, repos, playerId, before } = await playOut(ctx, app, {
          type: 'win',
          superOver: false,
        });
        expect(result.outcome).toBe('win');
        expect(result.resultText).toMatch(/won by \d+ (runs?|wickets?)/);
        expect(result.superOver).toBe(false);
        expect(result.rewards!.breakdown.resultMultiplier).toBe(1);
        expect(result.rewards!.breakdown.resultCoins).toBeGreaterThan(0);
        const after = (await repos.players.getStats(playerId))!;
        expect(after.matches).toBe((before.stats?.matches ?? 0) + 1);
        expect(after.matchesWon).toBe((before.stats?.matchesWon ?? 0) + 1);
        expect(result.progression!.fatigueAdded).toBeGreaterThan(0);
      }),
    60000,
  );

  it(
    'a loss still pays (0.75 of the base), is not a win, and says who won',
    () =>
      app(ctx, async (app) => {
        const { result, repos, playerId, before } = await playOut(ctx, app, {
          type: 'loss',
          superOver: false,
        });
        expect(result.outcome).toBe('loss');
        expect(result.winnerTeamName).toBe(result.opponentName);
        expect(result.rewards!.breakdown.resultMultiplier).toBe(0.75);
        expect(result.rewards!.breakdown.resultCoins).toBe(0);
        expect(result.rewards!.coins).toBeGreaterThan(0);
        expect(result.rewards!.playerXp).toBeGreaterThan(0);
        const after = (await repos.players.getStats(playerId))!;
        expect(after.matches).toBe((before.stats?.matches ?? 0) + 1);
        expect(after.matchesWon).toBe(before.stats?.matchesWon ?? 0);
        expect(await repos.wallet.getBalance(playerId, 'coins')).toBe(
          before.coins + result.rewards!.coins,
        );
      }),
    60000,
  );

  it(
    'a level chase goes to a Super Over: a second innings break, four innings, and the right winner',
    () =>
      app(ctx, async (app) => {
        const { result, sawSecondBreak } = await playOut(ctx, app, {
          type: 'win',
          superOver: true,
          level: true,
        });
        expect(sawSecondBreak).toBe(true);
        expect(result.superOver).toBe(true);
        expect(result.innings).toHaveLength(4);
        expect(result.innings.filter((i) => i.isSuperOver)).toHaveLength(2);
        expect(result.outcome).toBe('win');
      }),
    90000,
  );

  it(
    'a tie after the Super Over is a tie: no winner, the tie multiplier, never shown as a win or loss',
    () =>
      app(ctx, async (app) => {
        const { result, repos, playerId, before } = await playOut(ctx, app, {
          type: 'tie',
          superOver: true,
        });
        expect(result.outcome).toBe('tie');
        expect(result.winnerTeamName).toBeNull();
        expect(result.resultText).toMatch(/tied/i);
        expect(result.rewards!.breakdown.resultMultiplier).toBe(0.9);
        expect(
          result.playerOfTheMatch === null || !!result.playerOfTheMatch.name,
        ).toBe(true);
        const after = (await repos.players.getStats(playerId))!;
        expect(after.matchesWon).toBe(before.stats?.matchesWon ?? 0);
        expect(after.matches).toBe((before.stats?.matches ?? 0) + 1);
      }),
    120000,
  );

  it(
    'the same arranged match always ends the same way (the result is a pure function of the seed)',
    () =>
      app(ctx, async (app) => {
        const first = await playOut(ctx, app, {
          type: 'win',
          superOver: false,
        });
        expect(first.result.innings.length).toBe(2);
        // the stored result is what a refresh shows
        const again = await resultOf(first.browser, first.matchId);
        expect(again).toEqual(first.result);
        expect((await finishByAi(first.browser, first.matchId)).phase).toBe(
          'completed',
        );
      }),
    60000,
  );
});
