import { expect, it } from 'vitest';
import { describeDb } from '../support/db';
import { Browser, buildAuthApp } from '../support/auth';
import type { App } from '../support/auth';
import {
  authenticatedGuest,
  createPlayer,
  createTestPlayerCreationRequest,
} from '../support/player';
import { completeToss } from '../support/match-flow';
import type { MatchReplay } from '../../packages/match-engine/src/index';
import type {
  DeliveryResultDto,
  MatchPlayStateDto,
} from '../../packages/shared-types/src/index';

type Ctx = Parameters<Parameters<typeof describeDb>[1]>[0];

const GOOD = { x: 0.3, y: 0.5 };
let counter = 0;
const actionId = () => `act-${Date.now().toString(36)}-${counter++}`;

async function startMatch(
  app: App,
  ctx: Ctx,
  overrides: Record<string, unknown> = {},
  decision: 'bat' | 'bowl' = 'bowl',
) {
  const browser = await authenticatedGuest(app);
  const created = await createPlayer(
    browser,
    createTestPlayerCreationRequest({
      // a bowler by default: a Cricketer who cannot bowl is never asked to (they play the field by simulation)
      primaryRole: 'spin_bowler',
      bowlingStyle: 'off_spin',
      ...overrides,
    }),
  );
  expect(created.statusCode).toBe(201);
  const playerId = created.json().data.player.summary.id as string;
  await browser.get('/api/v1/career/home');
  const repos = ctx().database.repositories();
  const dashboard = (await repos.players.getDashboard(playerId))!;
  const fixture = (
    await repos.teams.listFixtures({
      careerId: dashboard.career!.id,
      status: 'scheduled',
    })
  ).items[0]!;
  const started = await browser.post(
    `/api/v1/career/matches/${fixture.id}/start`,
    {},
  );
  expect(started.statusCode).toBe(200);
  const matchId = started.json().data.matchId as string;
  await completeToss(browser, matchId, { decision });
  return { browser, playerId, fixtureId: fixture.id, matchId, repos };
}

const getState = async (browser: Browser, matchId: string) =>
  (await browser.get(`/api/v1/matches/${matchId}`)).json().data
    .match as MatchPlayStateDto;

/** One defensive ball for the human batter, through the real endpoints. */
async function batOnce(
  browser: Browser,
  matchId: string,
  overrides: Record<string, unknown> = {},
) {
  const next = await browser.post(`/api/v1/matches/${matchId}/next-ball`, {});
  expect(next.statusCode).toBe(200);
  const preview = next.json().data.preview;
  const res = await browser.post(`/api/v1/matches/${matchId}/shots`, {
    actionId: actionId(),
    expectedSequence: preview.sequence,
    battingIntent: {
      shotId: 'shot.forward_defensive',
      direction: 0,
      timingInput: 0,
      assist: 'off',
      ...overrides,
    },
  });
  expect(res.statusCode).toBe(200);
  return res.json().data.delivery as DeliveryResultDto;
}

/** Plays whatever the human does not control (including their own batting) until it is their turn to bowl. */
async function untilMyTurn(browser: Browser, matchId: string) {
  let state = await getState(browser, matchId);
  for (let guard = 0; guard < 80; guard++) {
    if (state.phase === 'innings_break')
      state = (
        await browser.post(`/api/v1/matches/${matchId}/advance`, {})
      ).json().data.match;
    else if (state.phase === 'simulate_required') {
      const r = await browser.post(`/api/v1/matches/${matchId}/simulate`, {
        mode: 'until_my_turn',
      });
      expect(r.statusCode).toBe(200);
      state = r.json().data.match;
    } else if (state.phase === 'ready_to_bat')
      state = (await batOnce(browser, matchId)).match;
    else break;
  }
  return state;
}

function deliveryBody(
  state: MatchPlayStateDto,
  extra: Record<string, unknown> = {},
  intent: Record<string, unknown> = {},
) {
  const bowler =
    state.currentBowler ?? state.eligibleBowlers.find((b) => b.eligible)!;
  const variationId = bowler.deliveryIds[0]!;
  return {
    actionId: actionId(),
    expectedSequence: state.expectedSequence,
    ...(state.phase === 'bowler_select' ? { bowlerId: bowler.playerId } : {}),
    deliveryIntent: { variationId, target: GOOD, ...intent },
    ...extra,
  };
}

describeDb('Module 9 match gameplay API', (ctx) => {
  it('is private: authenticated participants only, no seed or replay leaks', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser, matchId } = await startMatch(app, ctx);
      expect(
        (await new Browser(app).get(`/api/v1/matches/${matchId}`)).statusCode,
      ).toBe(401);
      const stranger = await authenticatedGuest(app);
      await createPlayer(stranger);
      for (const [method, url, body] of [
        ['get', `/api/v1/matches/${matchId}`, undefined],
        ['post', `/api/v1/matches/${matchId}/advance`, {}],
        ['post', `/api/v1/matches/${matchId}/simulate`, { mode: 'over' }],
        [
          'post',
          `/api/v1/matches/${matchId}/deliveries`,
          {
            actionId: 'abcdefgh1',
            expectedSequence: 1,
            deliveryIntent: {
              variationId: 'delivery.spin.stock_off',
              target: GOOD,
            },
          },
        ],
      ] as const) {
        const res =
          method === 'get'
            ? await stranger.get(url)
            : await stranger.post(url, body);
        expect(res.statusCode, url).toBe(404);
      }
      const session = (await ctx()
        .database.repositories()
        .matches.getEngineSession(matchId))!;
      const seed = (session.replay as MatchReplay).input.rngSeed;
      const read = await browser.get(`/api/v1/matches/${matchId}`);
      expect(read.headers['cache-control']).toBe('no-store');
      expect(read.body).not.toContain(seed);
      expect(read.body).not.toContain('replay');
      expect(read.json().data.match.matchId).toBe(matchId);
    } finally {
      await app.close();
    }
  }, 30000);

  it('rejects forged results and malformed intents, and never trusts the browser for a score', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser, matchId, repos } = await startMatch(app, ctx);
      const state = await untilMyTurn(browser, matchId);
      expect(state.phase).toBe('bowler_select');
      const url = `/api/v1/matches/${matchId}/deliveries`;
      const base = deliveryBody(state);
      const revisionBefore = (await repos.matches.getEngineSession(matchId))!
        .revision;
      const bad: [string, Record<string, unknown>, number][] = [
        ['forged runs', { ...base, runs: 6 }, 400],
        ['forged wicket', { ...base, wicket: true }, 400],
        [
          'forged outcome inside the intent',
          {
            ...base,
            deliveryIntent: { ...base.deliveryIntent, runsOffBat: 6 },
          },
          400,
        ],
        [
          'a shot chosen by the client',
          { ...base, battingIntent: { shotId: 'shot.cover_drive' } },
          400,
        ],
        [
          'target out of range',
          {
            ...base,
            deliveryIntent: {
              ...base.deliveryIntent,
              target: { x: 1.4, y: 0.5 },
            },
          },
          400,
        ],
        [
          'NaN-like target',
          {
            ...base,
            deliveryIntent: {
              ...base.deliveryIntent,
              target: { x: 'a', y: 0.5 },
            },
          },
          400,
        ],
        [
          'execution out of range',
          {
            ...base,
            deliveryIntent: { ...base.deliveryIntent, executionInput: 1.5 },
          },
          400,
        ],
        ['bad action id', { ...base, actionId: 'x' }, 400],
        [
          'missing bowler for a new over',
          { ...base, bowlerId: undefined },
          400,
        ],
        ['unknown bowler', { ...base, bowlerId: 'not-a-bowler' }, 409],
        [
          'unknown variation',
          {
            ...base,
            deliveryIntent: {
              ...base.deliveryIntent,
              variationId: 'delivery.nope',
            },
          },
          400,
        ],
        [
          'a variation this bowler cannot bowl',
          {
            ...base,
            deliveryIntent: {
              ...base.deliveryIntent,
              variationId: 'delivery.fast.outswing',
            },
          },
          400,
        ],
        [
          'stale sequence',
          { ...base, expectedSequence: base.expectedSequence + 3 },
          409,
        ],
      ];
      for (const [name, body, status] of bad) {
        const res = await browser.post(url, body);
        expect(res.statusCode, name).toBe(status);
      }
      expect(
        (await repos.matches.getEngineSession(matchId))!.revision,
        'nothing was applied',
      ).toBe(revisionBefore);
      const after = await getState(browser, matchId);
      expect(after.expectedSequence).toBe(state.expectedSequence);
      expect(after.innings.runs).toBe(state.innings.runs);
    } finally {
      await app.close();
    }
  }, 40000);

  it('resolves a delivery from intent, presents the engine result, and persists it', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser, matchId, repos } = await startMatch(app, ctx);
      const state = await untilMyTurn(browser, matchId);
      const eligible = state.eligibleBowlers.filter((b) => b.eligible);
      expect(eligible.length).toBeGreaterThan(0);
      for (const b of eligible) {
        expect(b.deliveryIds.length).toBeGreaterThan(0);
        for (const id of b.deliveryIds)
          expect(state.deliveryCatalog[id]).toBeDefined();
      }
      // a spinner is not offered swing and a fast bowler is not offered an off break
      const spin = state.eligibleBowlers.find((b) => b.kind === 'spin');
      const fast = state.eligibleBowlers.find((b) => b.kind === 'fast');
      if (spin) expect(spin.deliveryIds.join()).not.toContain('delivery.fast');
      if (fast) expect(fast.deliveryIds.join()).not.toContain('delivery.spin');

      const body = deliveryBody(state, {}, { executionInput: 0.8 });
      const res = await browser.post(
        `/api/v1/matches/${matchId}/deliveries`,
        body,
      );
      expect(res.statusCode).toBe(200);
      const delivery = res.json().data.delivery as DeliveryResultDto;
      expect(delivery.replayed).toBe(false);
      expect(delivery.sequence).toBe(state.expectedSequence);
      expect(delivery.delivery.intended.target).toEqual(GOOD);
      // the visual target is the engine's resolved target, close to (but not the same as) the aim
      const actual = delivery.delivery.actual.target;
      expect(Math.abs(actual.x - GOOD.x)).toBeLessThan(0.4);
      expect(delivery.outcome.headline.length).toBeGreaterThan(0);
      expect(delivery.outcome.totalRuns).toBe(
        delivery.outcome.runsOffBat + delivery.outcome.extras,
      );
      expect(delivery.delivery.speedKmh).toBeGreaterThan(40);
      expect(delivery.match.expectedSequence).toBe(state.expectedSequence + 1);
      expect(delivery.match.currentBowler).not.toBeNull();
      expect(delivery.match.thisOver).toHaveLength(1);
      // authoritative score equals the persisted score
      const summary = await repos.matches.getMatchSummary(matchId);
      const innings = summary.innings.find(
        (i) => i.inningsNumber === delivery.match.innings.number,
      )!;
      expect(innings.runs).toBe(delivery.match.innings.runs);
      const read = await getState(browser, matchId);
      expect(read.innings.runs).toBe(delivery.match.innings.runs);
      expect(read.innings.legalBalls).toBe(delivery.match.innings.legalBalls);
      expect(read.phase).toBe('ready_to_bowl');
    } finally {
      await app.close();
    }
  }, 40000);

  it('is idempotent: a retried action returns the stored ball, a reused id with other input is refused', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser, matchId, repos } = await startMatch(app, ctx);
      const state = await untilMyTurn(browser, matchId);
      const url = `/api/v1/matches/${matchId}/deliveries`;
      const body = deliveryBody(state);
      const first = await browser.post(url, body);
      expect(first.statusCode).toBe(200);
      const revision = (await repos.matches.getEngineSession(matchId))!
        .revision;
      const retried = await browser.post(url, body);
      expect(retried.statusCode).toBe(200);
      const a = first.json().data.delivery as DeliveryResultDto;
      const b = retried.json().data.delivery as DeliveryResultDto;
      expect(b.replayed).toBe(true);
      expect({ ...b, replayed: false, match: null }).toEqual({
        ...a,
        match: null,
      });
      expect((await repos.matches.getEngineSession(matchId))!.revision).toBe(
        revision,
      );
      const stateAfter = await getState(browser, matchId);
      expect(
        stateAfter.innings.legalBalls + Number(!a.outcome.legal),
      ).toBeGreaterThan(0);
      const reused = await browser.post(url, {
        ...body,
        deliveryIntent: {
          ...body.deliveryIntent,
          target: { x: 0.9, y: 0.1 },
        },
      });
      expect(reused.statusCode).toBe(409);
      // concurrent identical submissions resolve exactly one ball
      const next = deliveryBody(stateAfter);
      const burst = await Promise.all(
        [0, 1, 2, 3].map(() => browser.post(url, next)),
      );
      expect(burst.every((r) => r.statusCode === 200)).toBe(true);
      const results = burst.map(
        (r) => r.json().data.delivery as DeliveryResultDto,
      );
      expect(new Set(results.map((r) => r.sequence)).size).toBe(1);
      expect(results.filter((r) => !r.replayed)).toHaveLength(1);
      const final = await getState(browser, matchId);
      expect(final.expectedSequence).toBe(stateAfter.expectedSequence + 1);
    } finally {
      await app.close();
    }
  }, 40000);

  it('plays overs by the rules: same bowler cannot repeat, 6 legal balls end an over, extras do not count', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser, matchId } = await startMatch(app, ctx);
      let state = await untilMyTurn(browser, matchId);
      const url = `/api/v1/matches/${matchId}/deliveries`;
      const first = state.eligibleBowlers.find((b) => b.eligible)!;
      let legal = 0;
      let guard = 0;
      while (legal < state.format.ballsPerOver && guard++ < 30) {
        const body = deliveryBody(
          state,
          state.phase === 'bowler_select' ? { bowlerId: first.playerId } : {},
        );
        const res = await browser.post(url, body);
        expect(res.statusCode).toBe(200);
        const d = res.json().data.delivery as DeliveryResultDto;
        state = d.match;
        legal = d.match.innings.isSuperOver
          ? legal
          : d.match.thisOver.filter((b) => b.legal).length;
        if (!d.outcome.legal) {
          expect(d.match.thisOver.at(-1)!.legal).toBe(false);
          expect(['WIDE', 'NO BALL']).toContain(d.outcome.headline);
        }
        if (d.match.phase !== 'ready_to_bowl') break;
      }
      expect(state.phase).toBe('bowler_select');
      expect(state.thisOver.filter((b) => b.legal)).toHaveLength(
        state.format.ballsPerOver,
      );
      const refused = state.eligibleBowlers.find(
        (b) => b.playerId === first.playerId,
      )!;
      expect(refused.eligible).toBe(false);
      expect(refused.reason).toMatch(/previous over|maximum/i);
      const again = await browser.post(url, {
        ...deliveryBody(state),
        bowlerId: first.playerId,
      });
      expect(again.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  }, 60000);

  it('completes a whole match through the API with consistent scores, results and fixture state', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser, matchId, repos, fixtureId } = await startMatch(
        app,
        ctx,
        {
          bowlingStyle: 'right_arm_fast',
          primaryRole: 'fast_bowler',
        },
      );
      let state = await getState(browser, matchId);
      const url = `/api/v1/matches/${matchId}`;
      for (let guard = 0; guard < 80 && state.phase !== 'completed'; guard++) {
        if (state.phase === 'innings_break')
          state = (await browser.post(`${url}/advance`, {})).json().data.match;
        else if (state.phase === 'simulate_required')
          state = (
            await browser.post(`${url}/simulate`, { mode: 'until_my_turn' })
          ).json().data.match;
        else if (state.phase === 'ready_to_bat')
          state = (await batOnce(browser, matchId)).match;
        else {
          const bowler =
            state.currentBowler ??
            state.eligibleBowlers.find((b) => b.eligible)!;
          const res = await browser.post(
            `${url}/deliveries`,
            deliveryBody(
              state,
              state.phase === 'bowler_select'
                ? { bowlerId: bowler.playerId }
                : {},
              {
                target: {
                  x: 0.35 + (guard % 5) * 0.05,
                  y: 0.3 + (guard % 4) * 0.1,
                },
              },
            ),
          );
          expect(res.statusCode).toBe(200);
          state = (res.json().data.delivery as DeliveryResultDto).match;
        }
      }
      expect(state.phase).toBe('completed');
      expect(state.result?.text).toMatch(/won by|tied/);
      const summary = await repos.matches.getMatchSummary(matchId);
      expect(summary.match.status).toBe('completed');
      for (const innings of summary.innings)
        expect(
          (await repos.matches.verifyInningsAggregates(innings.id)).consistent,
        ).toBe(true);
      expect((await repos.teams.getFixture(fixtureId))!.status).toBe(
        'completed',
      );
      // nothing more can be bowled
      const late = await browser.post(`${url}/deliveries`, {
        actionId: actionId(),
        expectedSequence: state.expectedSequence,
        bowlerId: 'x',
        deliveryIntent: { variationId: 'delivery.fast.stock', target: GOOD },
      });
      expect(late.statusCode).toBe(409);
      // a refresh shows the same final state
      expect((await getState(browser, matchId)).result).toEqual(state.result);
    } finally {
      await app.close();
    }
  }, 120000);

  it('a batter with no bowling style captains the attack: they choose a teammate to bowl and the ball is resolved the same way', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser, matchId, playerId } = await startMatch(app, ctx, {
        primaryRole: 'top_order_batter',
        bowlingStyle: null,
      });
      const state = await untilMyTurn(browser, matchId);
      expect(state.phase).toBe('bowler_select');
      expect(state.eligibleBowlers.length).toBeGreaterThan(0);
      expect(state.eligibleBowlers.some((b) => b.playerId === playerId)).toBe(
        false,
      );
      expect(state.eligibleBowlers.every((b) => !b.isYou)).toBe(true);
      const res = await browser.post(
        `/api/v1/matches/${matchId}/deliveries`,
        deliveryBody(state),
      );
      expect(res.statusCode).toBe(200);
      const d = res.json().data.delivery as DeliveryResultDto;
      expect(d.match.currentBowler?.isYou).toBe(false);
      expect(d.match.expectedSequence).toBe(state.expectedSequence + 1);
    } finally {
      await app.close();
    }
  }, 40000);

  it('accepts only client-side telemetry events and exposes the dev lab only in development/test', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser } = await startMatch(app, ctx);
      const ok = await browser.post('/api/v1/matches/telemetry', {
        event: 'match_scene_loaded',
        detail: 'high',
      });
      expect(ok.statusCode).toBe(200);
      for (const body of [
        { event: 'delivery_resolved' },
        { event: 'bowling_wicket' },
        { event: 'match_scene_loaded', x: 0.5, y: 0.2 },
        { event: 'match_scene_loaded', detail: 'x'.repeat(200) },
      ])
        expect(
          (await browser.post('/api/v1/matches/telemetry', body)).statusCode,
        ).toBe(400);
      const lab = await browser.post('/api/v1/dev/bowling-lab', {
        bowlingStyle: 'right_arm_fast',
        battingHand: 'right',
        pitchId: 'pitch.green',
        rating: 70,
        seed: 'lab-1',
        variationId: 'delivery.fast.outswing',
        target: { x: 0.3, y: 0.4 },
      });
      expect(lab.statusCode).toBe(200);
      const first = lab.json().data;
      expect(first.delivery.movement.swing).toBeLessThanOrEqual(0);
      const repeat = await browser.post('/api/v1/dev/bowling-lab', {
        bowlingStyle: 'right_arm_fast',
        battingHand: 'right',
        pitchId: 'pitch.green',
        rating: 70,
        seed: 'lab-1',
        variationId: 'delivery.fast.outswing',
        target: { x: 0.3, y: 0.4 },
      });
      expect(repeat.json().data).toEqual(first);
      expect(
        (
          await browser.post('/api/v1/dev/bowling-lab', {
            bowlingStyle: 'off_spin',
            battingHand: 'right',
            pitchId: 'pitch.dry',
            rating: 70,
            seed: 'lab-1',
            variationId: 'delivery.fast.outswing',
            target: { x: 0.3, y: 0.4 },
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await app.close();
    }
  }, 40000);
});
