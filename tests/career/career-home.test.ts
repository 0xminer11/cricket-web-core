import { expect, it } from 'vitest';
import { execRaw } from '../../packages/database/src/testing/harness';
import { PLAYER_CONFIG } from '../../packages/game-core/src/index';
import { describeDb } from '../support/db';
import { Browser, buildAuthApp } from '../support/auth';
import type { App } from '../support/auth';
import {
  PLAYER_URL,
  authenticatedGuest,
  createPlayer,
  createTestPlayerCreationRequest as request,
} from '../support/player';

const CAREER = '/api/v1/career';
const ROUTES = [
  `${CAREER}/home`,
  `${CAREER}/fixtures`,
  `${CAREER}/history`,
  `${CAREER}/progression`,
  `${CAREER}/objectives`,
  `${CAREER}/events`,
];

async function newPlayer(
  app: App,
  overrides: Record<string, unknown> = {},
): Promise<{ b: Browser; playerId: string }> {
  const b = await authenticatedGuest(app);
  const r = await createPlayer(
    b,
    request({ displayName: 'Career Tester', ...overrides }),
  );
  expect(r.statusCode).toBe(201);
  return { b, playerId: r.json().data.player.summary.id as string };
}
const home = async (b: Browser) => {
  const r = await b.get(`${CAREER}/home`);
  expect(r.statusCode).toBe(200);
  return r.json().data.home;
};
const fixtureCount = async (url: string, playerId: string): Promise<number> =>
  Number(
    (
      await execRaw(
        url,
        `SELECT count(*)::int AS n FROM fixtures f JOIN careers c ON c.id = f.career_id WHERE c.player_id = $1`,
        [playerId],
      )
    )[0]?.n,
  );

describeDb('Career Home API (Module 6)', (ctx) => {
  it('requires authentication and a cricketer on every route, and never caches', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      for (const path of ROUTES)
        expect((await new Browser(app).get(path)).statusCode).toBe(401);
      const fresh = await authenticatedGuest(app);
      for (const path of ROUTES) {
        const r = await fresh.get(path);
        expect(r.statusCode).toBe(404);
        expect(r.json().error.code).toBe('CRICKETER_NOT_FOUND');
      }
      const { b } = await newPlayer(app);
      expect((await b.get(`${CAREER}/home`)).headers['cache-control']).toBe(
        'no-store',
      );
    } finally {
      await app.close();
    }
  });

  it('returns the complete starter career with real, consistent values', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      const h = await home(b);
      const profile = (await b.get(PLAYER_URL)).json().data.player;

      expect(h.player).toMatchObject({
        displayName: 'Career Tester',
        primaryRole: 'top_order_batter',
        battingHand: 'right',
      });
      // Overall comes from the same Module 0 calculation as /player
      expect(h.player.overall).toBe(profile.summary.overall);
      expect(h.progression).toMatchObject({
        level: 1,
        isMaxLevel: false,
        form: 50,
        formLabel: 'Average',
        formTrend: null, // no match history: nothing is invented
        fatigue: 0,
        readiness: 'ready',
      });
      expect(h.progression.xpToNext).toBeGreaterThan(0);
      expect(h.currencies).toEqual([
        { code: 'coins', name: 'Coins', balance: 2500 },
        { code: 'gems', name: 'Gems', balance: 50 },
      ]);
      expect(h.career).toMatchObject({
        tier: 'academy',
        tierName: 'Academy',
        teamName: 'River Hawks Academy',
        season: 1,
        reputation: 0,
        fans: 0,
        reputationMax: 1000,
        selectorInterestMax: 100,
      });
      expect(h.career.tiers.map((t: { status: string }) => t.status)).toEqual([
        'current',
        'locked',
        'locked',
        'locked',
        'locked',
        'locked',
      ]);
      expect(h.career.nextTier).toMatchObject({
        id: 'club',
        minReputation: 80,
      });

      // never empty after creation: a real next match and a short run of fixtures
      expect(h.nextMatch).toMatchObject({
        status: 'scheduled',
        yourTeam: { name: 'River Hawks Academy' },
        isHome: true,
        competition: { name: 'Academy League' },
        format: { id: 'format.2_over', name: '2 Overs', overs: 2 },
        venue: { name: 'River Hawks Ground' },
        pitch: { name: 'Green' },
        round: 1,
        result: null,
      });
      expect(h.nextMatch.opponent.name).not.toBe('River Hawks Academy');
      expect(h.upcomingFixtures).toHaveLength(4);
      expect(h.upcomingFixtures[0].id).toBe(h.nextMatch.id);
      expect(await fixtureCount(ctx().url, playerId)).toBe(5);

      expect(h.stats).toMatchObject({
        focus: 'batting',
        matches: 0,
        batting: { runs: 0, average: null, strikeRate: null },
        bowling: {
          wickets: 0,
          economy: null,
          average: null,
          bestFigures: null,
        },
      });
      expect(h.recentMatches).toEqual([]);
      expect(h.objectives.length).toBeGreaterThan(0);
      expect(h.objectives.length).toBeLessThanOrEqual(3);
      expect(h.objectives[0]).toMatchObject({ progress: 0, completed: false });
      expect(h.achievements.completed).toBe(0);
      expect(h.careerEvent).toBeNull();
      expect(h.contract).toBeNull();
      expect(h.equipped).toMatchObject({
        bat: { name: 'Street Willow' },
        kit: { name: 'Academy Jersey' },
        equippedCount: 7,
        missingRequired: [],
      });
      expect(h.readiness).toEqual({ status: 'ready', issues: [] });
      expect(h.training).toMatchObject({
        category: 'batting',
        cost: { currency: 'coins' },
      });
      expect(h.personality).toMatchObject({ archetype: 'Balanced' });
      expect(h.onboarding).toEqual({ introCompleted: false });
      expect(h.features).toEqual({
        training: true,
        matches: false,
        shop: false,
      });
      expect(h.degraded).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('exposes no secrets, ledger rows, identities or internal ids', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      const text = (await b.get(`${CAREER}/home`)).body;
      expect(text).not.toMatch(
        /email|password|session|token|identity|ledger|idempotency|userId|player_id|rngSeed|weight/i,
      );
      expect(text).not.toContain(playerId);
    } finally {
      await app.close();
    }
  });

  it('bootstraps fixtures exactly once, even for simultaneous first loads and refreshes', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      expect(await fixtureCount(ctx().url, playerId)).toBe(0); // creation itself schedules nothing
      const results = await Promise.all(
        Array.from({ length: 6 }, () => b.get(`${CAREER}/home`)),
      );
      for (const r of results) {
        expect(r.statusCode).toBe(200);
        // every racing first load sees the schedule, not just the one that created it
        expect(r.json().data.home.nextMatch).not.toBeNull();
        expect(r.json().data.home.upcomingFixtures).toHaveLength(4);
      }
      await b.get(`${CAREER}/fixtures`);
      await home(b);
      expect(await fixtureCount(ctx().url, playerId)).toBe(5);
      // the schedule is stable across loads (no random opponents on refresh)
      const a = (await home(b)).upcomingFixtures.map(
        (f: { id: string }) => f.id,
      );
      const c = (await home(b)).upcomingFixtures.map(
        (f: { id: string }) => f.id,
      );
      expect(a).toEqual(c);
    } finally {
      await app.close();
    }
  });

  it('does not reseed a career whose fixtures are all finished', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      await home(b);
      await execRaw(
        ctx().url,
        `UPDATE fixtures SET status = 'cancelled' WHERE career_id = (SELECT id FROM careers WHERE player_id = $1)`,
        [playerId],
      );
      const h = await home(b);
      expect(h.nextMatch).toBeNull();
      expect(h.upcomingFixtures).toEqual([]);
      expect(await fixtureCount(ctx().url, playerId)).toBe(5);
      const done = (await b.get(`${CAREER}/fixtures?status=completed`)).json()
        .data;
      expect(done.items).toHaveLength(5);
    } finally {
      await app.close();
    }
  });

  it('paginates fixtures, filters by status and rejects unknown or player-selecting parameters', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b } = await newPlayer(app);
      await home(b);
      const first = (await b.get(`${CAREER}/fixtures?limit=2`)).json().data;
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = (
        await b.get(`${CAREER}/fixtures?limit=2&cursor=${first.nextCursor}`)
      ).json().data;
      expect(second.items).toHaveLength(2);
      expect(second.items[0].id).not.toBe(first.items[1].id);
      const rest = (
        await b.get(`${CAREER}/fixtures?limit=2&cursor=${second.nextCursor}`)
      ).json().data;
      expect(rest.items).toHaveLength(1);
      expect(rest.nextCursor).toBeNull();
      expect((await b.get(`${CAREER}/fixtures?status=bogus`)).statusCode).toBe(
        400,
      );
      expect((await b.get(`${CAREER}/fixtures?playerId=x`)).statusCode).toBe(
        400,
      );
      expect((await b.get(`${CAREER}/fixtures?limit=500`)).statusCode).toBe(
        400,
      );
      expect(
        (await b.get(`${CAREER}/fixtures?cursor=not-a-cursor`)).statusCode,
      ).toBeGreaterThanOrEqual(400);
    } finally {
      await app.close();
    }
  });

  it('keeps every player strictly inside their own career', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const a = await newPlayer(app, { displayName: 'Alpha Player' });
      const c = await newPlayer(app, {
        displayName: 'Bravo Player',
        jerseyNumber: 7,
      });
      const ha = await home(a.b);
      const hc = await home(c.b);
      expect(ha.player.displayName).toBe('Alpha Player');
      expect(hc.player.displayName).toBe('Bravo Player');
      const idsA = (await a.b.get(`${CAREER}/fixtures`))
        .json()
        .data.items.map((f: { id: string }) => f.id);
      const idsC = (await c.b.get(`${CAREER}/fixtures`))
        .json()
        .data.items.map((f: { id: string }) => f.id);
      expect(idsA.filter((id: string) => idsC.includes(id))).toEqual([]);

      // a private career event of A is invisible to B (same answer as "does not exist")
      const repos = ctx().database.repositories();
      const careerA = await repos.careers.getActiveCareer(a.playerId);
      const event = await repos.careers.createEventInstance({
        careerId: careerA!.id,
        eventDefinitionId: 'career_event.coach.extra_nets',
        careerMatchesAtTrigger: 0,
      });
      expect((await a.b.get(`${CAREER}/events/${event.id}`)).statusCode).toBe(
        200,
      );
      const other = await c.b.get(`${CAREER}/events/${event.id}`);
      expect(other.statusCode).toBe(404);
      expect(other.json().error.code).toBe('CAREER_EVENT_NOT_FOUND');
      expect((await c.b.get(`${CAREER}/events/not-a-uuid`)).statusCode).toBe(
        404,
      );
      expect((await c.b.get(`${CAREER}/events`)).json().data.items).toEqual([]);
      expect((await home(c.b)).careerEvent).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('shows a pending career event with labels only (no effects, weights or cooldowns)', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      const repos = ctx().database.repositories();
      const career = await repos.careers.getActiveCareer(playerId);
      const event = await repos.careers.createEventInstance({
        careerId: career!.id,
        eventDefinitionId: 'career_event.coach.extra_nets',
        careerMatchesAtTrigger: 0,
      });
      const h = await home(b);
      expect(h.careerEvent).toMatchObject({
        id: event.id,
        title: 'Extra Nets Session',
        status: 'pending',
      });
      const detail = (await b.get(`${CAREER}/events/${event.id}`)).json().data
        .event;
      expect(detail.choices).toEqual([
        { id: 'train', label: 'Take the session' },
        { id: 'rest', label: 'Rest and recover' },
      ]);
      expect(JSON.stringify(detail)).not.toMatch(
        /effects|delta|weight|cooldown|reputation/i,
      );
      const list = (await b.get(`${CAREER}/events`)).json().data;
      expect(list.items).toHaveLength(1);
      // choosing is deferred to the Career Engine module: no write endpoint exists yet
      expect(
        (
          await b.post(`${CAREER}/events/${event.id}/choice`, {
            choiceId: 'train',
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('handles high fatigue, the level cap, huge fan counts and missing gear', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app);
      await home(b);
      const repos = ctx().database.repositories();
      await repos.players.adjustFatigue(playerId, 80);
      let h = await home(b);
      expect(h.progression.readiness).toBe('exhausted');
      expect(h.readiness.status).toBe('caution');
      expect(h.readiness.issues[0].code).toBe('FATIGUE_VERY_HIGH');
      await repos.players.adjustFatigue(playerId, -25); // 55: below the soft warning
      h = await home(b);
      expect(h.progression.readiness).toBe('ready');
      await repos.players.adjustFatigue(playerId, 10); // 65: tired
      h = await home(b);
      expect(h.readiness.issues[0].code).toBe('FATIGUE_HIGH');

      await execRaw(
        ctx().url,
        `UPDATE player_state SET level = $2, current_xp = 0 WHERE player_id = $1`,
        [playerId, PLAYER_CONFIG.levelCap],
      );
      await execRaw(
        ctx().url,
        `UPDATE careers SET fans = 1500000, reputation = 999 WHERE player_id = $1`,
        [playerId],
      );
      h = await home(b);
      expect(h.progression).toMatchObject({
        level: 50,
        isMaxLevel: true,
        xpToNext: null,
      });
      expect(h.career.fans).toBe(1500000);
      expect(h.career.reputation).toBe(999);

      await execRaw(
        ctx().url,
        `DELETE FROM equipped_items WHERE player_id = $1 AND equipment_slot = 'bat'`,
        [playerId],
      );
      h = await home(b);
      expect(h.readiness.status).toBe('blocked');
      expect(h.equipped).toMatchObject({ bat: null, missingRequired: ['bat'] });
      expect(
        h.readiness.issues.some(
          (i: { message: string }) =>
            i.message === 'Bat required before a match.',
        ),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('is role-aware: bowlers get bowling statistics and a bowling-leaning recommendation', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b, playerId } = await newPlayer(app, {
        displayName: 'Pace Merchant',
        primaryRole: 'fast_bowler',
        bowlingStyle: 'right_arm_fast',
      });
      let h = await home(b);
      expect(h.stats.focus).toBe('bowling');
      expect(h.training.category).not.toBe('batting');
      await execRaw(
        ctx().url,
        `UPDATE player_stats SET matches = 4, matches_won = 3, wickets = 7, balls_bowled = 48, runs_conceded = 60, best_bowling_wickets = 3, best_bowling_runs = 14 WHERE player_id = $1 AND scope_type = 'career'`,
        [playerId],
      );
      h = await home(b);
      expect(h.stats).toMatchObject({
        matches: 4,
        wins: 3,
        bowling: {
          wickets: 7,
          economy: 7.5,
          average: 8.6,
          bestFigures: '3/14',
        },
        batting: { average: null, strikeRate: null }, // never NaN
      });
      const allRound = await newPlayer(app, {
        displayName: 'All Rounder',
        primaryRole: 'batting_all_rounder',
        bowlingStyle: 'off_spin',
      });
      expect((await home(allRound.b)).stats.focus).toBe('all_round');
    } finally {
      await app.close();
    }
  });

  it('serves progression, history, objectives and onboarding', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b } = await newPlayer(app);
      const prog = (await b.get(`${CAREER}/progression`)).json().data;
      expect(prog.career.tier).toBe('academy');
      expect(prog.guidance).toMatch(/nothing is guaranteed/);
      const history = (await b.get(`${CAREER}/history`)).json().data;
      expect(history.items.map((i: { title: string }) => i.title)).toEqual(
        expect.arrayContaining([
          'Career started',
          'Joined River Hawks Academy',
        ]),
      );
      expect(history.nextCursor).toBeNull();
      const obj = (await b.get(`${CAREER}/objectives`)).json().data;
      expect(obj.active.length).toBeGreaterThan(0);
      expect(obj.completed).toEqual([]);
      for (const o of obj.active)
        expect(o.progress).toBeLessThanOrEqual(o.target);

      expect((await home(b)).onboarding.introCompleted).toBe(false);
      expect(
        (await b.post(`${CAREER}/onboarding/career_home_intro`, {})).statusCode,
      ).toBe(200);
      expect(
        (await b.post(`${CAREER}/onboarding/career_home_intro`, {})).statusCode,
      ).toBe(200);
      expect((await home(b)).onboarding.introCompleted).toBe(true);
      const unknown = await b.post(`${CAREER}/onboarding/nope`, {});
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json().error.code).toBe('ONBOARDING_STEP_UNKNOWN');
    } finally {
      await app.close();
    }
  });

  it('accepts only the documented funnel events', async () => {
    const events: Array<{ event: string; props: Record<string, unknown> }> = [];
    const { app } = await buildAuthApp(ctx(), {}, {
      careerTelemetry: {
        track: (event: string, props: Record<string, unknown>) =>
          events.push({ event, props }),
      },
    } as never);
    try {
      const { b } = await newPlayer(app);
      expect(
        (await b.post(`${CAREER}/telemetry`, { event: 'career_home_viewed' }))
          .statusCode,
      ).toBe(200);
      expect(
        (await b.post(`${CAREER}/telemetry`, { event: 'training_opened' }))
          .statusCode,
      ).toBe(200);
      expect(
        (await b.post(`${CAREER}/telemetry`, { event: 'bogus' })).statusCode,
      ).toBe(400);
      expect(
        (
          await b.post(`${CAREER}/telemetry`, {
            event: 'training_opened',
            extra: 1,
          })
        ).statusCode,
      ).toBe(400);
      expect(events.map((e) => e.event)).toEqual([
        'career_home_viewed',
        'training_opened',
      ]);
      expect(events[0]?.props['secondsSinceCreation']).toEqual(
        expect.any(Number),
      );
      expect(events[1]?.props['secondsSinceCreation']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('answers the dashboard in a small, fixed number of queries (no N+1)', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { b } = await newPlayer(app);
      await home(b); // bootstrap once
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
      const before = count;
      await home(b);
      const perRequest = count - before;
      // includes the auth/session lookup and the player guard
      expect(perRequest).toBeLessThanOrEqual(22);
      // a larger schedule does not add queries
      await execRaw(
        ctx().url,
        `INSERT INTO fixtures (career_id, competition_definition_id, home_team_id, away_team_id, match_format_id, scheduled_at, season_number, round)
         SELECT career_id, competition_definition_id, home_team_id, away_team_id, match_format_id, scheduled_at + (g || ' days')::interval, season_number, round + g FROM fixtures, generate_series(10, 40) AS g WHERE round = 1 AND career_id IS NOT NULL`,
      );
      const mid = count;
      await home(b);
      expect(count - mid).toBe(perRequest);
      console.log(`career home queries per request: ${perRequest}`);
    } finally {
      await app.close();
    }
  });
});
