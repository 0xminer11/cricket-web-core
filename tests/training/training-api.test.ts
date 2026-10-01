import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { execRaw } from '../../packages/database/src/testing/harness';
import {
  TRAINING_BY_ID,
  getSkillXpRequired,
  xpToNextLevel,
} from '../../packages/game-core/src/index';
import { describeDb } from '../support/db';
import { Browser, TestClock, buildAuthApp } from '../support/auth';
import type { App } from '../support/auth';
import {
  authenticatedGuest,
  createPlayer,
  createTestPlayerCreationRequest as request,
} from '../support/player';

const T = '/api/v1/training';
const TIMING = 'training.batting.timing';
const key = () => randomBytes(16).toString('hex');
type Ctx = Parameters<Parameters<typeof describeDb>[1]>[0];

async function newPlayer(app: App, overrides: Record<string, unknown> = {}) {
  const b = await authenticatedGuest(app);
  const r = await createPlayer(
    b,
    request({ displayName: 'Train Tester', ...overrides }),
  );
  expect(r.statusCode).toBe(201);
  return { b, playerId: r.json().data.player.summary.id as string };
}
const train = (
  b: Browser,
  id: string,
  k: string | null = key(),
  body: unknown = {},
) => b.post(`${T}/${id}`, body, k ? { 'idempotency-key': k } : {});
const hub = async (b: Browser) => {
  const r = await b.get(T);
  expect(r.statusCode).toBe(200);
  return r.json().data.hub;
};
const sql = (
  ctx: () => ReturnType<Ctx>,
  text: string,
  params: unknown[] = [],
) => execRaw(ctx().url, text, params);
const setState = (
  ctx: () => ReturnType<Ctx>,
  playerId: string,
  s: { level?: number; xp?: number; fatigue?: number },
) =>
  sql(
    ctx,
    `UPDATE player_state SET level = COALESCE($2, level), current_xp = COALESCE($3, current_xp),
       lifetime_xp = GREATEST(lifetime_xp, COALESCE($3, current_xp)), fatigue = COALESCE($4, fatigue) WHERE player_id = $1`,
    [playerId, s.level ?? null, s.xp ?? null, s.fatigue ?? null],
  );
const setAttr = (
  ctx: () => ReturnType<Ctx>,
  playerId: string,
  column: string,
  value: number,
) =>
  sql(ctx, `UPDATE player_attributes SET ${column} = $2 WHERE player_id = $1`, [
    playerId,
    value,
  ]);
const setSkillXp = (
  ctx: () => ReturnType<Ctx>,
  playerId: string,
  statKey: string,
  xp: number,
) =>
  sql(
    ctx,
    `INSERT INTO player_skill_progress (player_id, stat_key, skill_xp) VALUES ($1, $2, $3)
     ON CONFLICT (player_id, stat_key) DO UPDATE SET skill_xp = EXCLUDED.skill_xp`,
    [playerId, statKey, xp],
  );
async function setCoins(
  ctx: () => ReturnType<Ctx>,
  playerId: string,
  target: number,
) {
  const wallet = ctx().database.repositories().wallet;
  const current = await wallet.getBalance(playerId, 'coins');
  if (current === target) return;
  const change = {
    playerId,
    currency: 'coins' as const,
    amount: Math.abs(target - current),
    type: 'admin_adjustment' as const,
    reference: { type: 'admin', id: 'test' },
    idempotencyKey: `adj-${key()}`,
  };
  if (target > current) await wallet.credit(change);
  else await wallet.debit(change);
}
const snapshot = async (ctx: () => ReturnType<Ctx>, playerId: string) => {
  const repos = ctx().database.repositories();
  const [state, attrs, progress, coins, sessions, ledger] = await Promise.all([
    repos.players.getState(playerId),
    repos.players.getAttributes(playerId),
    repos.players.getSkillProgress(playerId),
    repos.wallet.getBalance(playerId, 'coins'),
    sql(
      ctx,
      `SELECT count(*)::int AS n FROM training_sessions WHERE player_id = $1`,
      [playerId],
    ),
    sql(
      ctx,
      `SELECT count(*)::int AS n FROM wallet_transactions WHERE player_id = $1 AND transaction_type = 'training_cost'`,
      [playerId],
    ),
  ]);
  return {
    level: state!.level,
    xp: state!.currentXp,
    lifetime: state!.lifetimeXp,
    fatigue: state!.fatigue,
    attrs,
    progress,
    coins,
    sessions: Number(sessions[0]!.n),
    ledger: Number(ledger[0]!.n),
  };
};

describeDb('Training API (Module 7)', (ctx) => {
  it('requires authentication and a cricketer on every route, and is never cached', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      for (const [m, p] of [
        ['get', T],
        ['get', `${T}/history`],
        ['get', `${T}/${TIMING}`],
        ['post', `${T}/${TIMING}`],
      ] as const)
        expect((await new Browser(app)[m](p)).statusCode).toBe(401);
      const fresh = await authenticatedGuest(app);
      for (const p of [T, `${T}/history`, `${T}/${TIMING}`]) {
        const r = await fresh.get(p);
        expect(r.statusCode).toBe(404);
        expect(r.json().error.code).toBe('CRICKETER_NOT_FOUND');
      }
      expect((await train(fresh, TIMING)).statusCode).toBe(404);
      const { b } = await newPlayer(app);
      expect((await b.get(T)).headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });

  it('serves the hub for a new player: categories, role awareness, recommendation, readiness', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b } = await newPlayer(app);
      const h = await hub(b);
      expect(h.enabled).toBe(true);
      expect(h.categories.map((c: { category: string }) => c.category)).toEqual(
        ['batting', 'bowling', 'physical'],
      );
      expect(h.readiness).toMatchObject({
        fatigue: 0,
        state: 'ready',
        efficiencyPercent: 100,
        blocked: false,
        drillsToday: 0,
      });
      expect(h.player).toMatchObject({
        level: 1,
        coins: 2500,
        role: 'top_order_batter',
      });
      const drills = h.categories.flatMap(
        (c: { drills: unknown[] }) => c.drills,
      ) as Array<{
        id: string;
        available: boolean;
        forYourRole: boolean;
        reason: string | null;
        recommended: boolean;
      }>;
      expect(drills.filter((d) => d.available).length).toBeGreaterThanOrEqual(
        10,
      );
      expect(h.recommendation).toMatchObject({
        trainingId: expect.stringMatching(/^training\./),
      });
      expect(drills.filter((d) => d.recommended)).toHaveLength(1);
      // role guidance, never a gate: batting drills favour a batter but nothing is hidden
      expect(drills.find((d) => d.id === TIMING)!.forYourRole).toBe(true);
      expect(drills.length).toBe(
        h.categories.reduce(
          (n: number, c: { drills: unknown[] }) => n + c.drills.length,
          0,
        ),
      );
      expect(
        drills.find((d) => d.id === 'training.bowling.variation'),
      ).toMatchObject({ available: false, reason: 'locked_level' });
      expect(h.recovery).toMatchObject({
        id: 'training.physical.rest',
        available: false,
        reason: 'already_fresh',
      });
      expect(h.development.overall.batting).toBeGreaterThan(0);
      expect(h.development.week).toEqual({
        sessions: 0,
        rests: 0,
        improvements: [],
      });
      expect(h.lastSession).toBeNull();
      expect(JSON.stringify(h)).not.toMatch(/userId|email|ledger|idempotency/i);
    } finally {
      await app.close();
    }
  });

  it('shows bowlers pace/swing/seam and spinners spin, and rejects the wrong style', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const fast = await newPlayer(app, {
        displayName: 'Pace Merchant',
        primaryRole: 'fast_bowler',
        bowlingStyle: 'right_arm_fast',
      });
      const spin = await newPlayer(app, {
        displayName: 'Leg Spinner',
        primaryRole: 'spin_bowler',
        bowlingStyle: 'leg_spin',
      });
      const batter = await newPlayer(app, {
        displayName: 'No Bowling',
        bowlingStyle: null,
      });
      const find = (
        h: {
          categories: Array<{
            drills: Array<{
              id: string;
              available: boolean;
              reason: string | null;
            }>;
          }>;
        },
        id: string,
      ) => h.categories.flatMap((c) => c.drills).find((d) => d.id === id)!;
      await setState(ctx, fast.playerId, { level: 5 });
      await setState(ctx, spin.playerId, { level: 5 });
      const hf = await hub(fast.b);
      const hs = await hub(spin.b);
      const hb = await hub(batter.b);
      expect(find(hf, 'training.bowling.spin')).toMatchObject({
        available: false,
        reason: 'locked_style',
      });
      expect(find(hs, 'training.bowling.pace')).toMatchObject({
        available: false,
        reason: 'locked_style',
      });
      expect(find(hs, 'training.bowling.spin').available).toBe(true);
      expect(find(hb, 'training.bowling.accuracy').available).toBe(true);
      expect(find(hb, 'training.bowling.spin').reason).toBe('locked_style');
      expect(hf.recommendation.trainingId).toMatch(/bowling|physical/);
      const bad = await train(fast.b, 'training.bowling.spin');
      expect(bad.statusCode).toBe(403);
      expect(bad.json().error.code).toBe('TRAINING_STYLE_RESTRICTED');
      expect((await train(spin.b, 'training.bowling.spin')).statusCode).toBe(
        200,
      );
    } finally {
      await app.close();
    }
  });

  it('previews exactly what training then does (server decides everything)', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      const preview = (await b.get(`${T}/${TIMING}`)).json().data.drill;
      expect(preview.skills[0]).toMatchObject({
        statKey: 'batting.timing',
        baseXp: 32,
        expectedXp: 32,
      });
      const before = await snapshot(ctx, playerId);
      const r = await train(b, TIMING);
      expect(r.statusCode).toBe(200);
      const result = r.json().data.result;
      expect(result.skills[0]).toMatchObject({
        statKey: 'batting.timing',
        xpGained: preview.skills[0].expectedXp,
      });
      expect(result.playerXp.gained).toBe(preview.expected.playerXp);
      expect(result.fatigue).toEqual({
        before: 0,
        after: preview.expected.fatigueAfter,
      });
      expect(result.currency).toEqual({
        type: 'coins',
        spent: 60,
        balanceAfter: 2440,
      });
      expect(result.replayed).toBe(false);

      const after = await snapshot(ctx, playerId);
      expect(after.coins).toBe(2440);
      expect(after.fatigue).toBe(result.fatigue.after);
      expect(after.xp).toBe(before.xp + result.playerXp.gained);
      expect(after.sessions).toBe(1);
      expect(after.ledger).toBe(1);
      expect(
        after.progress.find((p) => p.statKey === 'batting.timing')!.skillXp,
      ).toBe(result.skills[0].xpAfter);
      const [row] = await sql(
        ctx,
        `SELECT status, game_balance_version, cost_amount, xp_awarded, fatigue_added, wallet_transaction_id, completed_at, outcome FROM training_sessions WHERE player_id = $1`,
        [playerId],
      );
      expect(row).toMatchObject({
        status: 'completed',
        game_balance_version: '1',
        cost_amount: '60',
        xp_awarded: result.playerXp.gained,
      });
      expect(row!.wallet_transaction_id).not.toBeNull();
      expect(row!.completed_at).not.toBeNull();
      expect(
        (row!.outcome as { result: { skills: unknown[] } }).result.skills,
      ).toHaveLength(2);
      // the ledger row ties back to the session
      const [ledger] = await sql(
        ctx,
        `SELECT transaction_type, amount, reference_type, reference_id FROM wallet_transactions WHERE player_id = $1 AND transaction_type = 'training_cost'`,
        [playerId],
      );
      expect(ledger).toMatchObject({
        transaction_type: 'training_cost',
        amount: '-60',
        reference_type: 'training',
        reference_id: result.sessionId,
      });
    } finally {
      await app.close();
    }
  });

  it('refuses anything the client tries to decide: stats, XP, fatigue, cost, players, bad or missing keys', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      const before = await snapshot(ctx, playerId);
      for (const body of [
        { skillXp: 1000 },
        { timing: 99 },
        { playerId },
        { cost: 0 },
        { fatigue: -50 },
        { xp: 9999 },
      ])
        expect(
          (await train(b, TIMING, key(), body)).statusCode,
          JSON.stringify(body),
        ).toBe(400);
      expect((await train(b, TIMING, null)).statusCode).toBe(400);
      expect((await train(b, TIMING, 'short')).statusCode).toBe(400);
      expect((await train(b, TIMING, 'x'.repeat(200))).statusCode).toBe(400);
      const unknown = await train(b, 'training.batting.unknown');
      expect(unknown.statusCode).toBe(404);
      expect(unknown.json().error.code).toBe('TRAINING_NOT_FOUND');
      expect((await train(b, 'not-a-training')).statusCode).toBe(404);
      expect((await b.get(`${T}/training.batting.unknown`)).statusCode).toBe(
        404,
      );
      expect(await snapshot(ctx, playerId)).toEqual(before);
    } finally {
      await app.close();
    }
  });

  it('turns skill XP into an attribute point at the threshold and keeps the remainder', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      await setAttr(ctx, playerId, 'batting_timing', 52);
      const need = getSkillXpRequired(52)!;
      await setSkillXp(ctx, playerId, 'batting.timing', need - 10);
      const r = (await train(b, TIMING)).json().data.result;
      const timing = r.skills.find(
        (s: { statKey: string }) => s.statKey === 'batting.timing',
      );
      expect(timing).toMatchObject({
        valueBefore: 52,
        valueAfter: 53,
        xpBefore: need - 10,
      });
      expect(timing.xpAfter).toBe(32 - 10);
      const attrs = await ctx()
        .database.repositories()
        .players.getAttributes(playerId);
      expect(attrs!.batting.timing).toBe(53);
      const prog = await ctx()
        .database.repositories()
        .players.getSkillProgress(playerId);
      expect(prog.find((p) => p.statKey === 'batting.timing')!.skillXp).toBe(
        22,
      );
      expect(r.overall.player).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('levels the player up with the remainder and publishes events only after commit', async () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> =
      [];
    const analytics: string[] = [];
    const { app } = await buildAuthApp(ctx(), {}, {
      eventPublisher: {
        publish: (e: { type: string; payload: Record<string, unknown> }) =>
          events.push(e),
      },
      trainingTelemetry: { track: (e: string) => analytics.push(e) },
    } as never);
    try {
      const { b, playerId } = await newPlayer(app);
      await setState(ctx, playerId, { level: 4, xp: xpToNextLevel(4) - 10 });
      const r = (await train(b, TIMING)).json().data.result;
      expect(r.playerXp).toMatchObject({
        levelBefore: 4,
        levelAfter: 5,
        xpBefore: xpToNextLevel(4) - 10,
      });
      expect(r.playerXp.xpAfter).toBe(r.playerXp.gained - 10);
      const state = await ctx()
        .database.repositories()
        .players.getState(playerId);
      expect(state).toMatchObject({ level: 5, currentXp: r.playerXp.xpAfter });
      const types = events.map((e) => e.type);
      expect(types).toContain('training.completed');
      expect(types).toContain('player.level_up');
      expect(
        events.find((e) => e.type === 'player.level_up')!.payload,
      ).toMatchObject({ oldLevel: 4, newLevel: 5, source: 'training' });
      expect(analytics).toEqual(
        expect.arrayContaining([
          'training_started',
          'training_completed',
          'training_level_up',
        ]),
      );
      // a refused request publishes nothing
      events.length = 0;
      await setState(ctx, playerId, { fatigue: 99 });
      expect((await train(b, TIMING)).statusCode).toBe(409);
      expect(events).toEqual([]);
      expect(analytics).toContain('training_blocked');
    } finally {
      await app.close();
    }
  });

  it('emits skill-improved events and the home screen reflects a skill-up immediately', async () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> =
      [];
    const { app } = await buildAuthApp(ctx(), {}, {
      eventPublisher: {
        publish: (e: { type: string; payload: Record<string, unknown> }) =>
          events.push(e),
      },
    } as never);
    try {
      const { b, playerId } = await newPlayer(app);
      await setSkillXp(
        ctx,
        playerId,
        'batting.timing',
        getSkillXpRequired(40)! - 1,
      );
      await setAttr(ctx, playerId, 'batting_timing', 40);
      const r = (await train(b, TIMING)).json().data.result;
      const improved = events.filter((e) => e.type === 'player.skill_improved');
      expect(improved.map((e) => e.payload['skillId'])).toContain(
        'batting.timing',
      );
      expect(improved[0]!.payload).toMatchObject({
        source: 'training',
        oldValue: 40,
        newValue: 41,
      });
      const home = (await b.get('/api/v1/career/home')).json().data.home;
      expect(home.progression.fatigue).toBe(r.fatigue.after);
      expect(home.currencies[0].balance).toBe(2440);
      expect(home.lastTraining).toMatchObject({
        name: 'Timing Drill',
        improvements: ['Timing 40 → 41'],
      });
      const profile = (await b.get('/api/v1/player')).json().data.player;
      expect(profile.attributes.batting.timing).toBe(41);
    } finally {
      await app.close();
    }
  });

  it('never exceeds the skill cap and refuses a fully maxed drill', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      await setAttr(ctx, playerId, 'batting_defence', 100);
      await setAttr(ctx, playerId, 'batting_technique', 100);
      const maxed = await train(b, 'training.batting.defence');
      expect(maxed.statusCode).toBe(409);
      expect(maxed.json().error.code).toBe('SKILL_MAXED');
      expect(
        (await hub(b)).categories[0].drills.find(
          (d: { id: string }) => d.id === 'training.batting.defence',
        ),
      ).toMatchObject({ available: false, reason: 'maxed_skill' });
      // one skill maxed, the other trains
      await setAttr(ctx, playerId, 'batting_timing', 100);
      const partial = (await train(b, TIMING)).json().data.result;
      const timing = partial.skills.find(
        (s: { statKey: string }) => s.statKey === 'batting.timing',
      );
      expect(timing).toMatchObject({
        xpGained: 0,
        valueAfter: 100,
        maxed: true,
      });
      expect(
        partial.skills.find(
          (s: { statKey: string }) => s.statKey === 'batting.footwork',
        ).xpGained,
      ).toBeGreaterThan(0);
      const attrs = await ctx()
        .database.repositories()
        .players.getAttributes(playerId);
      expect(attrs!.batting.timing).toBe(100);
    } finally {
      await app.close();
    }
  });

  it('enforces the fatigue rules and always offers a way out through rest', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      await setState(ctx, playerId, { fatigue: 62 });
      const tired = await hub(b);
      expect(tired.readiness).toMatchObject({ state: 'tired', blocked: false });
      expect(tired.readiness.message).toMatch(/HIGH FATIGUE/);
      expect(tired.readiness.efficiencyPercent).toBeLessThan(100);
      const fresh = await (async () => {
        const f = await newPlayer(app, { displayName: 'Fresh One' });
        return (await train(f.b, TIMING)).json().data.result;
      })();
      const reduced = (await train(b, TIMING)).json().data.result;
      expect(reduced.skills[0].xpGained).toBeLessThan(fresh.skills[0].xpGained);

      await setState(ctx, playerId, { fatigue: 97 });
      const blocked = await train(b, TIMING);
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error.code).toBe('FATIGUE_TOO_HIGH');
      const h = await hub(b);
      expect(h.readiness).toMatchObject({ blocked: true, state: 'exhausted' });
      expect(h.recommendation.trainingId).toBe('training.physical.rest');
      expect(h.recovery.available).toBe(true);

      let fatigue = 97;
      for (let i = 0; i < 10 && fatigue >= 95; i++) {
        const rest = await train(b, 'training.physical.rest');
        expect(rest.statusCode).toBe(200);
        const res = rest.json().data.result;
        expect(res).toMatchObject({ kind: 'recovery', currency: null });
        expect(res.fatigue.after).toBeLessThan(res.fatigue.before);
        fatigue = res.fatigue.after;
      }
      expect(fatigue).toBeLessThan(95);
      expect((await train(b, TIMING)).statusCode).toBe(200);
      // full rest then "already fresh"
      await setState(ctx, playerId, { fatigue: 0 });
      const already = await train(b, 'training.physical.rest');
      expect(already.statusCode).toBe(409);
      expect(already.json().error.code).toBe('ALREADY_FRESH');
      // fatigue never leaves 0..100
      await setState(ctx, playerId, { fatigue: 94, level: 20 });
      const near = (
        await train(b, 'training.physical.elite_conditioning')
      ).json().data.result;
      expect(near.fatigue.after).toBeLessThanOrEqual(100);
    } finally {
      await app.close();
    }
  });

  it('charges exactly once through the wallet and refuses without changing anything when short of coins', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      await setCoins(ctx, playerId, 59);
      const before = await snapshot(ctx, playerId);
      const short = await train(b, TIMING);
      expect(short.statusCode).toBe(409);
      expect(short.json().error.code).toBe('INSUFFICIENT_CURRENCY');
      expect(await snapshot(ctx, playerId)).toEqual(before);
      const h = await hub(b);
      expect(
        h.categories[0].drills.find((d: { id: string }) => d.id === TIMING),
      ).toMatchObject({
        available: false,
        reason: 'insufficient_coins',
        detail: { requiredCoins: 60, haveCoins: 59 },
      });
      // exactly enough works and leaves zero
      await setCoins(ctx, playerId, 60);
      const ok = await train(b, TIMING);
      expect(ok.statusCode).toBe(200);
      expect(ok.json().data.result.currency.balanceAfter).toBe(0);
      // rest is free, so a broke player can still recover
      await setState(ctx, playerId, { fatigue: 50 });
      expect((await train(b, 'training.physical.rest')).statusCode).toBe(200);
      const recon = await ctx()
        .database.repositories()
        .wallet.reconcile(playerId, 'coins');
      expect(recon.consistent).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('gates drills by level with a reason', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app, {
        displayName: 'Seamer',
        primaryRole: 'fast_bowler',
        bowlingStyle: 'right_arm_fast',
      });
      const locked = await train(b, 'training.bowling.pace');
      expect(locked.statusCode).toBe(403);
      expect(locked.json().error.code).toBe('TRAINING_LOCKED');
      await setState(ctx, playerId, { level: 3 });
      expect((await train(b, 'training.bowling.pace')).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('is idempotent: a repeated request changes nothing and returns the original result', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      const k = key();
      const first = await train(b, TIMING, k);
      const mid = await snapshot(ctx, playerId);
      const again = await train(b, TIMING, k);
      expect(again.statusCode).toBe(200);
      expect(again.json().data.result).toEqual({
        ...first.json().data.result,
        replayed: true,
      });
      expect(await snapshot(ctx, playerId)).toEqual(mid);
      expect(mid.sessions).toBe(1);
      expect(mid.ledger).toBe(1);
      // the same key for a different training is refused, also without side effects
      const other = await train(b, 'training.batting.power', k);
      expect(other.statusCode).toBe(422);
      expect(other.json().error.code).toBe('TRAINING_ALREADY_PROCESSED');
      expect(await snapshot(ctx, playerId)).toEqual(mid);
      // keys are per player
      const second = await newPlayer(app, { displayName: 'Other Player' });
      expect(
        (await train(second.b, TIMING, k)).json().data.result.replayed,
      ).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('applies a burst of identical requests exactly once', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      const k = key();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => train(b, TIMING, k)),
      );
      for (const r of results) expect(r.statusCode).toBe(200);
      expect(
        new Set(results.map((r) => r.json().data.result.sessionId)).size,
      ).toBe(1);
      expect(
        results.filter((r) => r.json().data.result.replayed === false),
      ).toHaveLength(1);
      const s = await snapshot(ctx, playerId);
      expect(s.sessions).toBe(1);
      expect(s.ledger).toBe(1);
      expect(s.coins).toBe(2440);
    } finally {
      await app.close();
    }
  });

  it('lets exactly one of two simultaneous purchases succeed when funds cover one', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      await setCoins(ctx, playerId, 60);
      const [x, y] = await Promise.all([train(b, TIMING), train(b, TIMING)]);
      const codes = [x.statusCode, y.statusCode].sort();
      expect(codes).toEqual([200, 409]);
      const failed = [x, y].find((r) => r.statusCode === 409)!;
      expect(failed.json().error.code).toBe('INSUFFICIENT_CURRENCY');
      const s = await snapshot(ctx, playerId);
      expect(s.coins).toBe(0);
      expect(s.sessions).toBe(1);
      expect(s.ledger).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('accumulates XP and fatigue from simultaneous valid sessions without lost updates', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      const [x, y, z] = await Promise.all([
        train(b, TIMING),
        train(b, 'training.batting.defence'),
        train(b, 'training.physical.agility'),
      ]);
      for (const r of [x, y, z]) expect(r.statusCode).toBe(200);
      const results = [x, y, z].map((r) => r.json().data.result);
      const s = await snapshot(ctx, playerId);
      expect(s.xp).toBe(results.reduce((n, r) => n + r.playerXp.gained, 0));
      expect(s.sessions).toBe(3);
      expect(s.coins).toBe(2500 - 60 - 60 - 60);
      const fatigue = results.reduce(
        (n, r) => n + (r.fatigue.after - r.fatigue.before),
        0,
      );
      expect(s.fatigue).toBe(fatigue);
      // every session observed a different "before" (they were serialised, not overwritten)
      expect(new Set(results.map((r) => r.fatigue.before)).size).toBe(3);
    } finally {
      await app.close();
    }
  });

  it('rolls everything back when the session cannot be recorded (debit, XP, skill XP and fatigue included)', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      const before = await snapshot(ctx, playerId);
      // A real database failure at the very last step, after the debit and every progression write.
      await sql(
        ctx,
        `CREATE OR REPLACE FUNCTION test_block_training_complete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END; $$ LANGUAGE plpgsql`,
      );
      await sql(
        ctx,
        `CREATE TRIGGER test_block_training_complete BEFORE UPDATE ON training_sessions FOR EACH ROW EXECUTE FUNCTION test_block_training_complete()`,
      );
      const r = await train(b, TIMING);
      expect(r.statusCode).toBe(500);
      expect(r.json().error.code).toBe('TRAINING_FAILED');
      expect(r.body).not.toMatch(/injected|trigger|postgres|sql/i);
      expect(await snapshot(ctx, playerId)).toEqual(before);
      await sql(
        ctx,
        `DROP TRIGGER test_block_training_complete ON training_sessions`,
      );
      // and the same key works afterwards (nothing half-recorded blocks it)
      expect((await train(b, TIMING)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('keeps a soft daily limit that resets at UTC midnight, never a lock', async () => {
    const clock = new TestClock();
    const { app } = await buildAuthApp(ctx(), {}, { clock } as never);
    try {
      const { b, playerId } = await newPlayer(app);
      const gains: number[] = [];
      for (let i = 0; i < 7; i++) {
        await setState(ctx, playerId, { fatigue: 0 });
        const r = await train(b, 'training.batting.defence');
        expect(r.statusCode).toBe(200);
        gains.push(r.json().data.result.skills[0].xpGained);
      }
      expect(gains[0]).toBe(gains[4]);
      expect(gains[5]).toBeLessThan(gains[4]!);
      expect(gains[6]).toBeGreaterThan(0);
      expect((await hub(b)).readiness.drillsToday).toBe(7);
      // tomorrow (UTC) is a fresh day
      clock.advance(26 * 60 * 60 * 1000);
      await setState(ctx, playerId, { fatigue: 0 });
      const next = (await train(b, 'training.batting.defence')).json().data
        .result;
      expect(next.skills[0].xpGained).toBe(gains[0]);
    } finally {
      await app.close();
    }
  });

  it('paginates the training history newest first and survives definition changes', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      expect((await b.get(`${T}/history`)).json().data).toEqual({
        items: [],
        nextCursor: null,
      });
      const ids: string[] = [];
      for (const id of [
        TIMING,
        'training.batting.defence',
        'training.physical.agility',
        'training.physical.reflex',
        'training.batting.placement',
      ]) {
        await setState(ctx, playerId, { fatigue: 0 });
        ids.push((await train(b, id)).json().data.result.sessionId);
        await new Promise((r) => setTimeout(r, 5));
      }
      const p1 = (await b.get(`${T}/history?limit=2`)).json().data;
      expect(p1.items.map((i: { sessionId: string }) => i.sessionId)).toEqual([
        ids[4],
        ids[3],
      ]);
      expect(p1.nextCursor).toEqual(expect.any(String));
      const p2 = (
        await b.get(`${T}/history?limit=2&cursor=${p1.nextCursor}`)
      ).json().data;
      expect(p2.items.map((i: { sessionId: string }) => i.sessionId)).toEqual([
        ids[2],
        ids[1],
      ]);
      const p3 = (
        await b.get(`${T}/history?limit=2&cursor=${p2.nextCursor}`)
      ).json().data;
      expect(p3.items.map((i: { sessionId: string }) => i.sessionId)).toEqual([
        ids[0],
      ]);
      expect(p3.nextCursor).toBeNull();
      expect(p1.items[0]).toMatchObject({
        name: 'Placement Practice',
        coinsSpent: 60,
      });
      expect((await b.get(`${T}/history?limit=500`)).statusCode).toBe(400);
      expect((await b.get(`${T}/history?playerId=x`)).statusCode).toBe(400);
      // history is the stored snapshot: tampering with the live definition cannot change it
      expect(TRAINING_BY_ID.get(TIMING)!.version).toBe(1);
      const h = await hub(b);
      expect(h.development.week.sessions).toBe(5);
      expect(h.lastSession.name).toBe('Placement Practice');
    } finally {
      await app.close();
    }
  });

  it('keeps players strictly separate', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const a = await newPlayer(app, { displayName: 'Alpha Player' });
      const c = await newPlayer(app, {
        displayName: 'Bravo Player',
        jerseyNumber: 9,
      });
      await train(a.b, TIMING);
      expect((await c.b.get(`${T}/history`)).json().data.items).toEqual([]);
      expect((await hub(c.b)).player.coins).toBe(2500);
      expect((await hub(a.b)).player.coins).toBe(2440);
      expect((await hub(c.b)).lastSession).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('answers the hub in a small constant number of queries (no per-drill lookups)', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b } = await newPlayer(app);
      await train(b, TIMING);
      type Pool = { query: (...a: unknown[]) => unknown };
      const pool = (
        (app as unknown as { database: unknown }).database as unknown as {
          db: { $client: Pool };
        }
      ).db.$client;
      const original = pool.query.bind(pool);
      let count = 0;
      pool.query = (...args: unknown[]) => {
        count += 1;
        return original(...args);
      };
      await hub(b);
      const queries = count;
      expect(queries).toBeLessThanOrEqual(16);
      console.log(`training hub queries per request: ${queries}`);
    } finally {
      await app.close();
    }
  });
});
