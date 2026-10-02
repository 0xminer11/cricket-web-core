import { expect, it } from 'vitest';
import { describeDb } from '../support/db';
import { buildAuthApp } from '../support/auth';
import type { App, Browser } from '../support/auth';
import { completeToss } from '../support/match-flow';
import {
  authenticatedGuest,
  createPlayer,
  createTestPlayerCreationRequest,
} from '../support/player';
import type {
  DeliveryPreviewDto,
  DeliveryResultDto,
  MatchPlayStateDto,
} from '../../packages/shared-types/src/index';

type Ctx = Parameters<Parameters<typeof describeDb>[1]>[0];
let counter = 0;
const actionId = () => `bat-${Date.now().toString(36)}-${counter++}`;

async function startMatch(
  app: App,
  ctx: Ctx,
  overrides: Record<string, unknown> = {},
  decision: 'bat' | 'bowl' = 'bowl',
) {
  const browser = await authenticatedGuest(app);
  const created = await createPlayer(
    browser,
    createTestPlayerCreationRequest(overrides),
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
  return { browser, playerId, matchId, repos };
}
const getState = async (browser: Browser, matchId: string) =>
  (await browser.get(`/api/v1/matches/${matchId}`)).json().data
    .match as MatchPlayStateDto;

/** Plays teammates until the Cricketer is on strike (or it is their turn to bowl). */
async function untilOnStrike(browser: Browser, matchId: string) {
  let state = await getState(browser, matchId);
  for (let guard = 0; guard < 6; guard++) {
    if (state.phase === 'innings_break')
      state = (
        await browser.post(`/api/v1/matches/${matchId}/advance`, {})
      ).json().data.match;
    else if (state.phase === 'simulate_required')
      state = (
        await browser.post(`/api/v1/matches/${matchId}/simulate`, {
          mode: 'until_my_turn',
        })
      ).json().data.match;
    else break;
  }
  return state;
}

/** New players until the toss lets the Cricketer's side bat first (a fresh draw each time). */
async function startBattingFirst(
  app: App,
  ctx: Ctx,
  overrides: Record<string, unknown> = {},
) {
  for (let attempt = 0; attempt < 14; attempt++) {
    const started = await startMatch(app, ctx, overrides, 'bat');
    const state = await getState(started.browser, started.matchId);
    if (state.you.side === 'batting') return { ...started, state };
  }
  throw new Error('the toss never let the player bat first');
}

const shotBody = (
  sequence: number,
  overrides: Record<string, unknown> = {},
  intent: Record<string, unknown> = {},
) => ({
  actionId: actionId(),
  expectedSequence: sequence,
  battingIntent: {
    shotId: 'shot.cover_drive',
    direction: 0.6,
    timingInput: 0.02,
    assist: 'off',
    ...intent,
  },
  ...overrides,
});
const nextBall = async (browser: Browser, matchId: string) =>
  browser.post(`/api/v1/matches/${matchId}/next-ball`, {});
const OPENER = { primaryRole: 'opening_batter', bowlingStyle: null };

describeDb('Module 10 human batting API', (ctx) => {
  it('announces the delivery without revealing anything about the outcome, and says the same thing every time', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser, matchId, state } = await startBattingFirst(
        app,
        ctx,
        OPENER,
      );
      expect(state.phase).toBe('ready_to_bat');
      expect(state.you.status).toBe('on_strike');
      const first = await nextBall(browser, matchId);
      expect(first.statusCode).toBe(200);
      const preview = first.json().data.preview as DeliveryPreviewDto;
      const text = JSON.stringify(preview);
      for (const leaked of [
        'contactQuality',
        'runsOffBat',
        'wicketType',
        'noBall',
        'executionRating',
        'exitSpeed',
        'rngSeed',
      ])
        expect(text).not.toContain(leaked);
      expect(preview.sequence).toBe(state.expectedSequence);
      expect(preview.delivery.speedKmh).toBeGreaterThan(40);
      expect(preview.delivery.target.x).toBeGreaterThanOrEqual(0);
      expect(preview.bowler.name.length).toBeGreaterThan(0);
      // repeatable: reading the delivery twice changes nothing
      const again = await nextBall(browser, matchId);
      expect(again.json().data.preview).toEqual(preview);
      expect((await getState(browser, matchId)).expectedSequence).toBe(
        preview.sequence,
      );
    } finally {
      await app.close();
    }
  }, 60000);

  it('rejects forged results, impossible timing, unknown shots and out-of-turn play without touching the match', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser, matchId, repos } = await startBattingFirst(
        app,
        ctx,
        OPENER,
      );
      const url = `/api/v1/matches/${matchId}/shots`;
      // a shot before the delivery has been announced
      const early = await browser.post(url, shotBody(1));
      expect(early.statusCode).toBe(409);
      const preview = (await nextBall(browser, matchId)).json().data
        .preview as DeliveryPreviewDto;
      const base = shotBody(preview.sequence);
      const revisionBefore = (await repos.matches.getEngineSession(matchId))!
        .revision;
      const bad: [string, unknown, number][] = [
        ['forged contact quality', { ...base, contactQuality: 'perfect' }, 400],
        ['forged runs', { ...base, runs: 6 }, 400],
        ['forged wicket', { ...base, wicket: false }, 400],
        ['forged exit speed', { ...base, exitSpeed: 99 }, 400],
        [
          'result smuggled inside the intent',
          {
            ...base,
            battingIntent: { ...base.battingIntent, contactQuality: 'perfect' },
          },
          400,
        ],
        [
          'timing beyond the window',
          {
            ...base,
            battingIntent: { ...base.battingIntent, timingInput: 1.5 },
          },
          400,
        ],
        [
          'timing as text',
          {
            ...base,
            battingIntent: { ...base.battingIntent, timingInput: 'perfect' },
          },
          400,
        ],
        [
          'direction out of range',
          { ...base, battingIntent: { ...base.battingIntent, direction: 3 } },
          400,
        ],
        [
          'unknown assist',
          { ...base, battingIntent: { ...base.battingIntent, assist: 'god' } },
          400,
        ],
        [
          'unknown shot',
          {
            ...base,
            battingIntent: {
              ...base.battingIntent,
              shotId: 'shot.reverse_scoop',
            },
          },
          400,
        ],
        ['bad action id', { ...base, actionId: 'x' }, 400],
        [
          'stale sequence',
          { ...base, expectedSequence: preview.sequence + 4 },
          409,
        ],
      ];
      for (const [name, body, status] of bad)
        expect((await browser.post(url, body)).statusCode, name).toBe(status);
      expect(
        (await repos.matches.getEngineSession(matchId))!.revision,
        'nothing was applied',
      ).toBe(revisionBefore);
      // a stranger cannot play, announce or read this match
      const stranger = await authenticatedGuest(app);
      await createPlayer(stranger);
      expect((await stranger.post(url, base)).statusCode).toBe(404);
      expect((await nextBall(stranger, matchId)).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  }, 60000);

  it('plays the announced delivery: the preview is exactly the delivery that is resolved, and the result is the engine’s', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser, matchId, repos } = await startBattingFirst(
        app,
        ctx,
        OPENER,
      );
      const preview = (await nextBall(browser, matchId)).json().data
        .preview as DeliveryPreviewDto;
      const res = await browser.post(
        `/api/v1/matches/${matchId}/shots`,
        shotBody(preview.sequence, {}, { timingInput: 0.04 }),
      );
      expect(res.statusCode).toBe(200);
      const d = res.json().data.delivery as DeliveryResultDto;
      expect(d.delivery.actual.target).toEqual(preview.delivery.target);
      expect(d.delivery.speedKmh).toBe(preview.delivery.speedKmh);
      expect(d.delivery.movement).toEqual(preview.delivery.movement);
      expect(d.delivery.bounce).toBe(preview.delivery.bounce);
      expect(d.delivery.name).toBe(preview.delivery.name);
      expect(d.batting).toMatchObject({ timing: 'perfect', assist: 'off' });
      expect(['PERFECT', 'GOOD', 'OKAY', 'POOR', 'EDGE', 'MISS']).toContain(
        d.batting!.contact,
      );
      expect(d.shot.shotId).toBe('shot.cover_drive');
      expect(d.outcome.totalRuns).toBe(d.outcome.runsOffBat + d.outcome.extras);
      // persisted exactly like any other ball
      const summary = await repos.matches.getMatchSummary(matchId);
      expect(summary.innings.find((i) => i.inningsNumber === 1)!.runs).toBe(
        d.match.innings.runs,
      );
      expect(d.match.expectedSequence).toBe(preview.sequence + 1);
      // the next delivery is a different ball (while the Cricketer is still in)
      if (d.match.phase === 'ready_to_bat') {
        const next = (await nextBall(browser, matchId).then((r) => r.json()))
          .data.preview as DeliveryPreviewDto;
        expect(next.sequence).toBe(preview.sequence + 1);
      }
    } finally {
      await app.close();
    }
  }, 60000);

  it('is idempotent: a retried shot returns the stored ball, a changed shot or timing under the same id is refused, and a burst bats one ball', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser, matchId, repos } = await startBattingFirst(
        app,
        ctx,
        OPENER,
      );
      const preview = (await nextBall(browser, matchId)).json().data
        .preview as DeliveryPreviewDto;
      const url = `/api/v1/matches/${matchId}/shots`;
      const body = shotBody(preview.sequence);
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
      for (const changed of [
        { shotId: 'shot.pull' },
        { timingInput: -0.6 },
        { direction: -0.9 },
      ])
        expect(
          (
            await browser.post(url, {
              ...body,
              battingIntent: { ...body.battingIntent, ...changed },
            })
          ).statusCode,
        ).toBe(409);
      // four identical submissions at once resolve exactly one ball
      const state = await getState(browser, matchId);
      if (state.phase !== 'ready_to_bat') return;
      const next = (await nextBall(browser, matchId)).json().data
        .preview as DeliveryPreviewDto;
      const burstBody = shotBody(next.sequence);
      const burst = await Promise.all(
        [0, 1, 2, 3].map(() => browser.post(url, burstBody)),
      );
      expect(burst.every((r) => r.statusCode === 200)).toBe(true);
      const results = burst.map(
        (r) => r.json().data.delivery as DeliveryResultDto,
      );
      expect(new Set(results.map((r) => r.sequence)).size).toBe(1);
      expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    } finally {
      await app.close();
    }
  }, 60000);

  it('is only your turn when you are on strike: bowling, waiting and non-striker turns are refused, and simulate stops for you', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      // a number-3 batter does not open: they wait while teammates bat
      const { browser, matchId, state } = await startBattingFirst(app, ctx, {
        primaryRole: 'middle_order_batter',
        bowlingStyle: null,
      });
      expect(state.you.status).not.toBe('on_strike');
      expect(state.phase).toBe('simulate_required');
      expect((await nextBall(browser, matchId)).statusCode).toBe(409);
      expect(
        (
          await browser.post(
            `/api/v1/matches/${matchId}/shots`,
            shotBody(state.expectedSequence),
          )
        ).statusCode,
      ).toBe(409);
      const after = await untilOnStrike(browser, matchId);
      // either they walked in (on strike) or the innings ended without them; never a stale state
      expect([
        'ready_to_bat',
        'ready_to_bowl',
        'bowler_select',
        'innings_break',
        'completed',
      ]).toContain(after.phase);
      if (after.phase === 'ready_to_bat') {
        expect(after.you.status).toBe('on_strike');
        expect(after.striker?.playerId).toBe(after.you.playerId);
      }
      // when the side is in the field there is nothing to bat
      const fielding = await startMatch(app, ctx, OPENER);
      const fieldState = await getState(fielding.browser, fielding.matchId);
      if (fieldState.you.side === 'bowling')
        expect(
          (await nextBall(fielding.browser, fielding.matchId)).statusCode,
        ).toBe(409);
    } finally {
      await app.close();
    }
  }, 120000);

  it('bats where the role says: openers open, later roles come in after teammates', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const roles: [string, number][] = [
        ['opening_batter', 0],
        ['top_order_batter', 1],
        ['finisher', 3],
      ];
      for (const [role, slot] of roles) {
        const { browser, matchId, repos } = await startMatch(app, ctx, {
          primaryRole: role,
          bowlingStyle: null,
        });
        const session = (await repos.matches.getEngineSession(matchId))!;
        const replay = session.replay as {
          input: {
            teamA: { battingOrder: string[] };
            teamB: { battingOrder: string[] };
          };
        };
        const state = await getState(browser, matchId);
        const order = [replay.input.teamA, replay.input.teamB].find((t) =>
          t.battingOrder.includes(state.you.playerId),
        )!.battingOrder;
        expect(order.indexOf(state.you.playerId), role).toBe(slot);
      }
    } finally {
      await app.close();
    }
  }, 60000);

  it('finishes a match that includes the player’s own innings and reports their batting figures', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser, matchId, repos } = await startBattingFirst(
        app,
        ctx,
        OPENER,
      );
      let state = await getState(browser, matchId);
      const url = `/api/v1/matches/${matchId}`;
      let balls = 0;
      for (let guard = 0; guard < 200 && state.phase !== 'completed'; guard++) {
        if (state.phase === 'innings_break')
          state = (await browser.post(`${url}/advance`, {})).json().data.match;
        else if (state.phase === 'simulate_required')
          state = (
            await browser.post(`${url}/simulate`, { mode: 'until_my_turn' })
          ).json().data.match;
        else if (state.phase === 'ready_to_bat') {
          const p = (await nextBall(browser, matchId)).json().data
            .preview as DeliveryPreviewDto;
          const r = await browser.post(
            `${url}/shots`,
            shotBody(
              p.sequence,
              {},
              { shotId: 'shot.forward_defensive', direction: 0 },
            ),
          );
          expect(r.statusCode).toBe(200);
          state = (r.json().data.delivery as DeliveryResultDto).match;
          balls++;
        } else {
          const bowler =
            state.currentBowler ??
            state.eligibleBowlers.find((b) => b.eligible)!;
          const r = await browser.post(`${url}/deliveries`, {
            actionId: actionId(),
            expectedSequence: state.expectedSequence,
            ...(state.phase === 'bowler_select'
              ? { bowlerId: bowler.playerId }
              : {}),
            deliveryIntent: {
              variationId: bowler.deliveryIds[0],
              target: { x: 0.3, y: 0.45 },
            },
          });
          expect(r.statusCode).toBe(200);
          state = (r.json().data.delivery as DeliveryResultDto).match;
        }
      }
      expect(state.phase).toBe('completed');
      expect(balls).toBeGreaterThan(0);
      const mine = state.yourPerformance!;
      expect(mine.batting).not.toBeNull();
      const card = state.scorecard
        .flatMap((i) => i.batting)
        .find((b) => b.isYou)!;
      expect(mine.batting!.runs).toBe(card.runs);
      expect(mine.batting!.balls).toBe(card.balls);
      expect(typeof mine.rating).toBe('number');
      const summary = await repos.matches.getMatchSummary(matchId);
      for (const innings of summary.innings)
        expect(
          (await repos.matches.verifyInningsAggregates(innings.id)).consistent,
        ).toBe(true);
    } finally {
      await app.close();
    }
  }, 180000);

  it('the dev batting lab runs one stateless ball, repeats it exactly, and is refused for an unknown shot', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser } = await startMatch(app, ctx, OPENER);
      const body = {
        battingHand: 'right',
        batterRating: 60,
        bowlingStyle: 'right_arm_fast',
        bowlerRating: 60,
        pitchId: 'pitch.green',
        seed: 'bat-lab-1',
        variationId: 'delivery.fast.outswing',
        target: { x: 0.3, y: 0.4 },
        shotId: 'shot.cover_drive',
        direction: 0.6,
        timingInput: 0.05,
        assist: 'off',
      };
      const a = await browser.post('/api/v1/dev/batting-lab', body);
      expect(a.statusCode).toBe(200);
      expect(
        (await browser.post('/api/v1/dev/batting-lab', body)).json().data,
      ).toEqual(a.json().data);
      const data = a.json().data;
      expect(data.engineTimingInput).toBeLessThanOrEqual(0.05);
      expect(data.batting.timing).toBe('perfect');
      expect(
        (
          await browser.post('/api/v1/dev/batting-lab', {
            ...body,
            shotId: 'shot.nope',
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await app.close();
    }
  }, 60000);
});
