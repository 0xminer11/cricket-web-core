import { expect, it } from 'vitest';
import { createDefinitionCatalog } from '../../packages/database/src/index';
import {
  createTestCareer,
  createTestPlayer,
} from '../../packages/database/src/testing/factories';
import { execRaw } from '../../packages/database/src/testing/harness';
import {
  STARTER_LOADOUT,
  STARTER_ROLES,
  listCreationCombinations,
  ECONOMY_CONFIG,
  GAME_BALANCE_VERSION,
} from '../../packages/game-core/src/index';
import { describeDb } from '../support/db';
import { Browser, buildAuthApp, PASSWORD, uniqueEmail } from '../support/auth';
import {
  PLAYER_URL,
  STARTER_APPEARANCE,
  authenticatedGuest,
  createPlayer,
  createTestPlayerCreationRequest as request,
  newIdempotencyKey,
} from '../support/player';

const counts = async (url: string, userId: string) => {
  const q = async (sql: string) =>
    Number((await execRaw(url, sql, [userId]))[0]?.n);
  return {
    profiles: await q(
      'SELECT count(*)::int AS n FROM player_profiles WHERE user_id = $1',
    ),
    careers: await q(
      'SELECT count(*)::int AS n FROM careers c JOIN player_profiles p ON p.id = c.player_id WHERE p.user_id = $1',
    ),
    inventory: await q(
      'SELECT count(*)::int AS n FROM player_inventory i JOIN player_profiles p ON p.id = i.player_id WHERE p.user_id = $1',
    ),
    equipped: await q(
      'SELECT count(*)::int AS n FROM equipped_items e JOIN player_profiles p ON p.id = e.player_id WHERE p.user_id = $1',
    ),
    ledger: await q(
      'SELECT count(*)::int AS n FROM wallet_transactions w JOIN player_profiles p ON p.id = w.player_id WHERE p.user_id = $1',
    ),
    balances: await q(
      'SELECT count(*)::int AS n FROM currency_balances b JOIN player_profiles p ON p.id = b.player_id WHERE p.user_id = $1',
    ),
    attributes: await q(
      'SELECT count(*)::int AS n FROM player_attributes a JOIN player_profiles p ON p.id = a.player_id WHERE p.user_id = $1',
    ),
    personality: await q(
      'SELECT count(*)::int AS n FROM player_personality a JOIN player_profiles p ON p.id = a.player_id WHERE p.user_id = $1',
    ),
    state: await q(
      'SELECT count(*)::int AS n FROM player_state a JOIN player_profiles p ON p.id = a.player_id WHERE p.user_id = $1',
    ),
    appearance: await q(
      'SELECT count(*)::int AS n FROM player_appearance a JOIN player_profiles p ON p.id = a.player_id WHERE p.user_id = $1',
    ),
    history: await q(
      "SELECT count(*)::int AS n FROM career_history h JOIN careers c ON c.id = h.career_id JOIN player_profiles p ON p.id = c.player_id WHERE p.user_id = $1 AND h.event_type = 'career_started'",
    ),
  };
};
const NOTHING = {
  profiles: 0,
  careers: 0,
  inventory: 0,
  equipped: 0,
  ledger: 0,
  balances: 0,
  attributes: 0,
  personality: 0,
  state: 0,
  appearance: 0,
  history: 0,
};

describeDb('POST /api/v1/player: the creation flow', (ctx) => {
  const url = () => ctx().url;
  const userOf = async (b: Browser) =>
    (await b.me()).json().data.user.id as string;

  it('creates a complete cricketer for a guest, atomically, and exposes it through /me and GET /player', async () => {
    const { app, events } = await withEvents(ctx());
    try {
      const guest = await authenticatedGuest(app);
      const userId = await userOf(guest);
      expect((await guest.me()).json().data.user.hasCricketer).toBe(false);
      const response = await createPlayer(guest);
      expect(response.statusCode).toBe(201);
      const { player, created } = response.json().data;
      expect(created).toBe(true);
      expect(player.summary).toMatchObject({
        displayName: 'Naveen Kumar',
        countryCode: 'IN',
        jerseyNumber: 18,
        primaryRole: 'top_order_batter',
        battingHand: 'right',
        bowlingStyle: 'off_spin',
        level: 1,
        careerTier: 'academy',
        form: 50,
      });
      expect(player.summary.id).not.toBe(userId); // account != cricketer
      expect(player.xp).toBe(0);
      expect(player.career).toMatchObject({
        tier: 'academy',
        fans: 0,
        reputation: 0,
        selectorInterest: 0,
        teamName: 'River Hawks Academy',
      });
      expect(
        player.equipped.map((e: { slot: string }) => e.slot).sort(),
      ).toEqual(Object.keys(STARTER_LOADOUT).sort());
      expect(Math.abs(player.overall.player - 40)).toBeLessThanOrEqual(2);
      expect(player.attributes.personality.riskAppetite).toBe(50);
      expect(player.personalityArchetypeId).toBe('personality.balanced');
      expect(player.appearance).toEqual(STARTER_APPEARANCE);
      // never exposes persistence internals or wallet data
      expect(JSON.stringify(player)).not.toMatch(
        /\buserId\b|user_id|creationKey|requestHash|passwordHash|\bcoins\b|\bbalance\b/i,
      );

      expect((await guest.me()).json().data.user.hasCricketer).toBe(true);
      const read = await guest.get(PLAYER_URL);
      expect(read.statusCode).toBe(200);
      expect(read.json().data.player).toEqual(player);
      expect(read.headers['cache-control']).toBe('no-store');

      expect(await counts(url(), userId)).toEqual({
        profiles: 1,
        careers: 1,
        inventory: 7,
        equipped: 7,
        ledger: 2,
        balances: 2,
        attributes: 1,
        personality: 1,
        state: 1,
        appearance: 1,
        history: 1,
      });
      // one domain event, published after the commit, with ids and categories only
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'player.created',
        payload: {
          playerId: player.summary.id,
          userId,
          primaryRole: 'top_order_batter',
          careerTier: 'academy',
          accountType: 'guest',
          balanceVersion: GAME_BALANCE_VERSION,
        },
      });
      expect(JSON.stringify(events[0])).not.toContain('Naveen');
    } finally {
      await app.close();
    }
  });

  it('lets a registered account create too, and requires authentication', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const anon = new Browser(app);
      const denied = await createPlayer(anon);
      expect(denied.statusCode).toBe(401);
      expect(denied.json().error.code).toBe('AUTH_REQUIRED');
      expect((await anon.get(PLAYER_URL)).statusCode).toBe(401);
      expect(
        (await anon.get(`${PLAYER_URL}/creation-options`)).statusCode,
      ).toBe(401);

      const registered = new Browser(app);
      await registered.register(uniqueEmail('creator'));
      const ok = await createPlayer(
        registered,
        request({ displayName: 'Registered Rahul' }),
      );
      expect(ok.statusCode).toBe(201);
      expect(ok.json().data.player.summary.displayName).toBe(
        'Registered Rahul',
      );
    } finally {
      await app.close();
    }
  });

  it('refuses suspended accounts', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const guest = await authenticatedGuest(app);
      const userId = await userOf(guest);
      await ctx()
        .database.repositories()
        .users.changeStatus(userId, 'suspended');
      const r = await createPlayer(guest);
      expect(r.statusCode).toBe(403);
      expect(r.json().error.code).toBe('ACCOUNT_SUSPENDED');
      expect(await counts(url(), userId)).toEqual(NOTHING);
    } finally {
      await app.close();
    }
  });

  it('allows exactly one cricketer per user and rejects a second without side effects', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const guest = await authenticatedGuest(app);
      const userId = await userOf(guest);
      expect((await createPlayer(guest)).statusCode).toBe(201);
      const before = await counts(url(), userId);
      const again = await createPlayer(
        guest,
        request({
          displayName: 'Second Try',
          primaryRole: 'fast_bowler',
          bowlingStyle: 'right_arm_fast',
        }),
      );
      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe('CRICKETER_ALREADY_EXISTS');
      const noKey = await createPlayer(guest, request(), null);
      expect(noKey.json().error.code).toBe('CRICKETER_ALREADY_EXISTS');
      expect(await counts(url(), userId)).toEqual(before);
      // the database enforces it too, independent of the application check
      await expect(
        ctx().database.repositories().players.create({
          userId,
          displayName: 'Direct Insert',
          countryCode: 'IN',
          jerseyNumber: 1,
          battingHand: 'right',
          primaryRole: 'finisher',
        }),
      ).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' });
    } finally {
      await app.close();
    }
  });

  it('survives simultaneous creation: exactly one cricketer, one wallet grant, one kit', async () => {
    const { app, events } = await withEvents(ctx());
    try {
      const guest = await authenticatedGuest(app);
      const userId = await userOf(guest);
      const key = newIdempotencyKey();
      const tabs = Array.from({ length: 6 }, () => {
        const tab = new Browser(app);
        tab.cookie = guest.cookie;
        return tab;
      });
      const results = await Promise.all(
        tabs.map((t) => createPlayer(t, request(), key)),
      );
      const statuses = results
        .map((r: { statusCode: number }) => r.statusCode)
        .sort();
      expect(statuses.filter((s: number) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s: number) => s === 200)).toHaveLength(5); // identical request + key = safe replay
      const ids = new Set(
        results.map(
          (r: { json(): { data: { player: { summary: { id: string } } } } }) =>
            r.json().data.player.summary.id,
        ),
      );
      expect(ids.size).toBe(1);
      expect((await counts(url(), userId)).profiles).toBe(1);
      expect(await counts(url(), userId)).toMatchObject({
        careers: 1,
        inventory: 7,
        equipped: 7,
        ledger: 2,
      });
      expect(events).toHaveLength(1);

      // without a shared key, losers get a clean conflict and still nothing duplicates
      const other = await authenticatedGuest(app);
      const otherId = await userOf(other);
      const raced = await Promise.all(
        Array.from({ length: 5 }, () => {
          const tab = new Browser(app);
          tab.cookie = other.cookie;
          return createPlayer(tab, request(), newIdempotencyKey());
        }),
      );
      const codes = raced.map((r: { statusCode: number }) => r.statusCode);
      expect(codes.filter((c: number) => c === 201)).toHaveLength(1);
      expect(codes.filter((c: number) => c === 409)).toHaveLength(4);
      expect(await counts(url(), otherId)).toMatchObject({
        profiles: 1,
        careers: 1,
        inventory: 7,
        ledger: 2,
      });
    } finally {
      await app.close();
    }
  });

  it('is idempotent: same key + same request replays; same key + different request is refused', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const guest = await authenticatedGuest(app);
      const userId = await userOf(guest);
      const key = newIdempotencyKey();
      const first = await createPlayer(guest, request(), key);
      expect(first.statusCode).toBe(201);
      const replay = await createPlayer(
        guest,
        request({ displayName: '  Naveen    Kumar ' }),
        key,
      ); // same after normalisation
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data.created).toBe(false);
      expect(replay.json().data.player).toEqual(first.json().data.player);
      const reused = await createPlayer(
        guest,
        request({ displayName: 'Someone Else' }),
        key,
      );
      expect(reused.statusCode).toBe(422);
      expect(reused.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await counts(url(), userId)).toMatchObject({
        profiles: 1,
        inventory: 7,
        ledger: 2,
      });
      // malformed keys are rejected up front
      const bad = await guest.post(PLAYER_URL, request(), {
        'idempotency-key': 'short',
      });
      expect(bad.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('grants exactly the Module 0 starter wallet through the ledger, once', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const guest = await authenticatedGuest(app);
      const userId = await userOf(guest);
      const key = newIdempotencyKey();
      await createPlayer(guest, request(), key);
      await createPlayer(guest, request(), key);
      await createPlayer(guest, request(), newIdempotencyKey());
      const rows = await execRaw(
        url(),
        `SELECT t.currency_type, t.amount, t.transaction_type, b.balance FROM wallet_transactions t JOIN player_profiles p ON p.id = t.player_id JOIN currency_balances b ON b.player_id = t.player_id AND b.currency_type = t.currency_type WHERE p.user_id = $1 ORDER BY t.currency_type`,
        [userId],
      );
      expect(rows).toHaveLength(2);
      expect(
        rows.map((r) => [
          r.currency_type,
          Number(r.amount),
          r.transaction_type,
          Number(r.balance),
        ]),
      ).toEqual([
        [
          'coins',
          ECONOMY_CONFIG.starter.coins,
          'starter_grant',
          ECONOMY_CONFIG.starter.coins,
        ],
        [
          'gems',
          ECONOMY_CONFIG.starter.gems,
          'starter_grant',
          ECONOMY_CONFIG.starter.gems,
        ],
      ]);
    } finally {
      await app.close();
    }
  });

  it('grants and equips exactly the starter kit, all owned by the new cricketer', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const guest = await authenticatedGuest(app);
      const userId = await userOf(guest);
      await createPlayer(guest);
      const inv = await execRaw(
        url(),
        `SELECT i.item_definition_id, i.status, i.acquisition_source, i.quantity, i.upgrade_level FROM player_inventory i JOIN player_profiles p ON p.id = i.player_id WHERE p.user_id = $1 ORDER BY 1`,
        [userId],
      );
      expect(inv.map((r) => r.item_definition_id)).toEqual(
        Object.values(STARTER_LOADOUT).sort(),
      );
      for (const r of inv)
        expect([
          r.status,
          r.acquisition_source,
          Number(r.quantity),
          Number(r.upgrade_level),
        ]).toEqual(['active', 'starter', 1, 0]);
      const worn = await execRaw(
        url(),
        `SELECT e.equipment_slot, i.item_definition_id, i.player_id = e.player_id AS owned FROM equipped_items e JOIN player_inventory i ON i.id = e.inventory_item_id JOIN player_profiles p ON p.id = e.player_id WHERE p.user_id = $1 ORDER BY 1`,
        [userId],
      );
      expect(worn.map((r) => [r.equipment_slot, r.item_definition_id])).toEqual(
        Object.entries(STARTER_LOADOUT).sort(([a], [b]) => a.localeCompare(b)),
      );
      for (const r of worn) expect(r.owned).toBe(true);
      const hist = await execRaw(
        url(),
        `SELECT h.event_type, h.reference_id FROM career_history h JOIN careers c ON c.id = h.career_id JOIN player_profiles p ON p.id = c.player_id WHERE p.user_id = $1 ORDER BY h.occurred_at, h.event_type`,
        [userId],
      );
      expect(hist.map((h) => h.event_type)).toEqual(
        expect.arrayContaining(['career_started', 'team_joined']),
      );
      const [membership] = await execRaw(
        url(),
        `SELECT t.definition_id, m.shirt_number FROM team_memberships m JOIN teams t ON t.id = m.team_id JOIN player_profiles p ON p.id = m.player_id WHERE p.user_id = $1 AND m.status = 'active'`,
        [userId],
      );
      expect(membership).toMatchObject({
        definition_id: 'team.academy.riverhawks',
        shirt_number: 18,
      });
    } finally {
      await app.close();
    }
  });

  it('rolls EVERYTHING back when a late step fails, publishes nothing, and can be retried', async () => {
    const real = createDefinitionCatalog();
    const failing = {
      ...real,
      // the 7th kit item (pants) cannot be resolved by the repositories: the failure lands after
      // profile, attributes, wallet, career and six items were already written inside the transaction
      item: (id: string) => {
        if (id === 'item.pants.starter_01')
          throw new Error('simulated starter-grant failure');
        return real.item(id);
      },
    };
    const broken = await withEvents(ctx(), { catalog: failing });
    try {
      const guest = await authenticatedGuest(broken.app);
      const userId = await userOf(guest);
      const key = newIdempotencyKey();
      const r = await createPlayer(guest, request(), key);
      expect(r.statusCode).toBe(500);
      expect(r.json().error.code).toBe('PLAYER_CREATION_FAILED');
      expect(r.body).not.toMatch(/simulated|pants|sql|stack/i);
      expect(await counts(url(), userId)).toEqual(NOTHING);
      expect(
        await execRaw(
          url(),
          `SELECT 1 FROM audit_logs WHERE action = 'player.created' AND actor_id = $1`,
          [userId],
        ),
      ).toHaveLength(0);
      expect(broken.events).toHaveLength(0);
      expect((await guest.me()).json().data.user.hasCricketer).toBe(false);
      expect((await guest.get(PLAYER_URL)).statusCode).toBe(404);

      // the same user can retry on a healthy server (same key is fine: nothing was stored)
      const healthy = await buildAuthApp(ctx());
      try {
        const retry = new Browser(healthy.app);
        retry.cookie = guest.cookie;
        const ok = await createPlayer(retry, request(), key);
        expect(ok.statusCode).toBe(201);
        expect(await counts(url(), userId)).toMatchObject({
          profiles: 1,
          careers: 1,
          inventory: 7,
          equipped: 7,
          ledger: 2,
        });
      } finally {
        await healthy.app.close();
      }
    } finally {
      await broken.app.close();
    }
  });

  it('records one audit entry with the balance version and no personal data', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const guest = await authenticatedGuest(app);
      const userId = await userOf(guest);
      const r = await createPlayer(
        guest,
        request({ displayName: 'Audit Subject' }),
      );
      const rows = await execRaw(
        url(),
        `SELECT actor_type, actor_id, target_type, target_id, metadata FROM audit_logs WHERE action = 'player.created' AND actor_id = $1`,
        [userId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actor_type: 'user',
        target_type: 'player',
        target_id: r.json().data.player.summary.id,
      });
      expect(rows[0]?.metadata).toMatchObject({
        gameBalanceVersion: GAME_BALANCE_VERSION,
        careerTier: 'academy',
        primaryRole: 'top_order_batter',
      });
      expect(JSON.stringify(rows)).not.toMatch(/Audit Subject/);
      const [profile] = await execRaw(
        url(),
        'SELECT creation_balance_version, starter_personality_id, creation_key IS NOT NULL AS has_key FROM player_profiles WHERE user_id = $1',
        [userId],
      );
      expect(profile).toMatchObject({
        creation_balance_version: GAME_BALANCE_VERSION,
        starter_personality_id: 'personality.balanced',
        has_key: true,
      });
    } finally {
      await app.close();
    }
  });
});

describeDb('creation input validation and security', (ctx) => {
  const code = async (
    app: Awaited<ReturnType<typeof buildAuthApp>>['app'],
    body: Record<string, unknown>,
  ) => {
    const b = await authenticatedGuest(app);
    const r = await createPlayer(b, body);
    return {
      status: r.statusCode,
      code: r.json().error?.code as string | undefined,
    };
  };
  it('rejects every invalid choice with a stable code and creates nothing', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const cases: Array<[string, Record<string, unknown>, number, string]> = [
        [
          'empty name',
          request({ displayName: '' }),
          400,
          'INVALID_PLAYER_NAME',
        ],
        [
          'whitespace name',
          request({ displayName: '     ' }),
          400,
          'INVALID_PLAYER_NAME',
        ],
        [
          'two chars',
          request({ displayName: 'Ab' }),
          400,
          'INVALID_PLAYER_NAME',
        ],
        [
          '25 chars',
          request({ displayName: 'A'.repeat(25) }),
          400,
          'INVALID_PLAYER_NAME',
        ],
        [
          'control chars',
          request({ displayName: 'Nav\u0000een' }),
          400,
          'INVALID_PLAYER_NAME',
        ],
        [
          'invisible name',
          request({ displayName: '​​​​' }),
          400,
          'INVALID_PLAYER_NAME',
        ],
        [
          'emoji',
          request({ displayName: 'Naveen 😀' }),
          400,
          'INVALID_PLAYER_NAME',
        ],
        [
          'reserved',
          request({ displayName: 'Admin' }),
          400,
          'INVALID_PLAYER_NAME',
        ],
        [
          'reserved spaced',
          request({ displayName: 'A d m i n' }),
          400,
          'INVALID_PLAYER_NAME',
        ],
        ['bad country', request({ countryCode: 'ZZ' }), 400, 'INVALID_COUNTRY'],
        [
          'lowercase country',
          request({ countryCode: 'in' }),
          400,
          'INVALID_COUNTRY',
        ],
        [
          'jersey -1',
          request({ jerseyNumber: -1 }),
          400,
          'INVALID_JERSEY_NUMBER',
        ],
        [
          'jersey 100',
          request({ jerseyNumber: 100 }),
          400,
          'INVALID_JERSEY_NUMBER',
        ],
        [
          'jersey 1.5',
          request({ jerseyNumber: 1.5 }),
          400,
          'INVALID_JERSEY_NUMBER',
        ],
        [
          'hand',
          request({ battingHand: 'ambidextrous' }),
          400,
          'INVALID_BATTING_HAND',
        ],
        [
          'role',
          request({ primaryRole: 'umpire' }),
          400,
          'INVALID_PLAYER_ROLE',
        ],
        [
          'style',
          request({ bowlingStyle: 'underarm' }),
          400,
          'INVALID_BOWLING_STYLE',
        ],
        [
          'fast + leg spin',
          request({ primaryRole: 'fast_bowler', bowlingStyle: 'leg_spin' }),
          400,
          'ROLE_BOWLING_STYLE_MISMATCH',
        ],
        [
          'spin + no style',
          request({ primaryRole: 'spin_bowler', bowlingStyle: null }),
          400,
          'ROLE_BOWLING_STYLE_MISMATCH',
        ],
        [
          'unknown hair',
          request({
            appearance: {
              ...STARTER_APPEARANCE,
              hairStyleId: 'appearance.hair.nonexistent',
            },
          }),
          400,
          'INVALID_APPEARANCE_OPTION',
        ],
        [
          'locked hair',
          request({
            appearance: {
              ...STARTER_APPEARANCE,
              hairStyleId: 'appearance.hair.mohawk_01',
            },
          }),
          400,
          'INVALID_APPEARANCE_OPTION',
        ],
        [
          'locked body',
          request({
            appearance: {
              ...STARTER_APPEARANCE,
              bodyPresetId: 'appearance.body.elite_01',
            },
          }),
          400,
          'INVALID_APPEARANCE_OPTION',
        ],
        [
          'bad height',
          request({ appearance: { ...STARTER_APPEARANCE, heightScale: 3 } }),
          400,
          'INVALID_APPEARANCE_OPTION',
        ],
        [
          'personality',
          request({ personalityArchetypeId: 'personality.god_mode' }),
          400,
          'INVALID_PERSONALITY_ARCHETYPE',
        ],
      ];
      for (const [label, body, status, expected] of cases) {
        const r = await code(app, body);
        expect(r, label).toEqual({ status, code: expected });
      }
      expect(
        await execRaw(ctx().url, 'SELECT 1 FROM player_profiles'),
      ).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('accepts legitimate names from many scripts and normalises whitespace', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      for (const [input, expected] of [
        ['नवीन कुमार', 'नवीन कुमार'],
        ['தமிழ் வீரன்', 'தமிழ் வீரன்'],
        ['  Jean-Luc   O’Brien ', 'Jean-Luc O’Brien'],
        ['李小龙', '李小龙'],
        ['محمد علی', 'محمد علی'],
        ['Dickson Scunthorpe', 'Dickson Scunthorpe'],
      ] as const) {
        const b = await authenticatedGuest(app);
        const r = await createPlayer(b, request({ displayName: input }));
        expect(r.statusCode, input).toBe(201);
        expect(r.json().data.player.summary.displayName).toBe(expected);
      }
    } finally {
      await app.close();
    }
  });

  it('enforces the configurable blocked-term list by whole words only', async () => {
    const { app } = await buildAuthApp(ctx(), {
      PLAYER_NAME_BLOCKED_TERMS: 'dick, badword',
    });
    try {
      expect((await code(app, request({ displayName: 'Big Dick' }))).code).toBe(
        'INVALID_PLAYER_NAME',
      );
      expect((await code(app, request({ displayName: 'BADWORD' }))).code).toBe(
        'INVALID_PLAYER_NAME',
      );
      expect(
        (await code(app, request({ displayName: 'Dickson Smith' }))).code,
      ).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('ignores or rejects every attempt to set server-owned state', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const guest = await authenticatedGuest(app);
      const userId = (await guest.me()).json().data.user.id as string;
      for (const extra of [
        { attributes: { batting: { timing: 100, power: 100 } } },
        { power: 100 },
        { timing: 100 },
        { level: 50 },
        { xp: 999999 },
        { coins: 1000000 },
        { gems: 9999 },
        { overall: 99 },
        { inventory: ['item.bat.pro_willow_01'] },
        { equipped: {} },
        { careerTier: 'international' },
        { fans: 1e9 },
        { selectorInterest: 100 },
        { reputation: 1000 },
        { userId: '00000000-0000-4000-8000-000000000001' },
        { playerId: 'x' },
        { accountType: 'registered' },
      ]) {
        const r = await createPlayer(guest, request(extra));
        expect(r.statusCode, JSON.stringify(extra)).toBe(400);
        expect(r.json().error.code).toBe('VALIDATION_ERROR');
      }
      const nested = await createPlayer(
        guest,
        request({ appearance: { ...STARTER_APPEARANCE, power: 5 } }),
      );
      expect(nested.statusCode).toBe(400);
      expect(
        await execRaw(
          ctx().url,
          'SELECT 1 FROM player_profiles WHERE user_id = $1',
          [userId],
        ),
      ).toHaveLength(0);
      // a normal request still creates the cricketer with SERVER-generated numbers only
      const ok = await createPlayer(
        guest,
        request({ gameBalanceVersion: '0' }),
      );
      expect(ok.statusCode).toBe(201); // a stale client version is informational, not an error
      const player = ok.json().data.player;
      expect(player.summary.level).toBe(1);
      expect(player.xp).toBe(0);
      expect(player.career).toMatchObject({ tier: 'academy', fans: 0 });
      const [wallet] = await execRaw(
        ctx().url,
        `SELECT b.balance FROM currency_balances b JOIN player_profiles p ON p.id = b.player_id WHERE p.user_id = $1 AND b.currency_type = 'coins'`,
        [userId],
      );
      expect(Number(wallet?.balance)).toBe(ECONOMY_CONFIG.starter.coins);
    } finally {
      await app.close();
    }
  });

  it('applies the CSRF origin check to creation', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const guest = await authenticatedGuest(app);
      const evil = new Browser(
        app,
        'cricketer_session',
        'https://evil.example',
      );
      evil.cookie = guest.cookie;
      const r = await createPlayer(evil);
      expect(r.statusCode).toBe(403);
      expect(r.json().error.code).toBe('CSRF_ORIGIN_INVALID');
      const oversized = await guest.post(
        PLAYER_URL,
        request({ displayName: 'x'.repeat(20000) }),
      );
      expect(oversized.statusCode).toBe(413 as number);
    } finally {
      await app.close();
    }
  });

  it('never lets one user read or create for another', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const a = await authenticatedGuest(app);
      const b = await authenticatedGuest(app);
      const ra = await createPlayer(
        a,
        request({ displayName: 'Alpha Player' }),
      );
      expect((await b.get(PLAYER_URL)).statusCode).toBe(404);
      const rb = await createPlayer(
        b,
        request({
          displayName: 'Bravo Player',
          userId: (await a.me()).json().data.user.id,
        }),
      );
      expect(rb.statusCode).toBe(400);
      const rb2 = await createPlayer(
        b,
        request({ displayName: 'Bravo Player' }),
      );
      expect(rb2.statusCode).toBe(201);
      expect(
        (await a.get(PLAYER_URL)).json().data.player.summary.displayName,
      ).toBe('Alpha Player');
      expect(
        (await b.get(PLAYER_URL)).json().data.player.summary.displayName,
      ).toBe('Bravo Player');
      expect(ra.json().data.player.summary.id).not.toBe(
        rb2.json().data.player.summary.id,
      );
      // path ids are not accepted for self-service reads
      expect(
        (await b.get(`${PLAYER_URL}/${ra.json().data.player.summary.id}`))
          .statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describeDb('every role, style and personality persists correctly', (ctx) => {
  it('creates all valid role/style combinations and stores exactly the generated starting state', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const combos = listCreationCombinations();
      expect(combos.length).toBeGreaterThan(40);
      const overalls: number[] = [];
      for (const [i, { role, style }] of combos.entries()) {
        const b = await authenticatedGuest(app);
        const r = await createPlayer(
          b,
          request({
            displayName: `Role Tester ${i}`,
            primaryRole: role,
            bowlingStyle: style,
            personalityArchetypeId:
              i % 2 ? 'personality.calm' : 'personality.aggressive',
          }),
        );
        expect(r.statusCode, `${role}/${style}`).toBe(201);
        const p = r.json().data.player;
        overalls.push(p.overall.player);
        expect(p.summary.bowlingStyle).toBe(style);
        const [row] = await execRaw(
          ctx().url,
          `SELECT a.batting_timing, a.bowling_pace, a.bowling_spin, a.physical_reflex, s.level FROM player_attributes a JOIN player_state s ON s.player_id = a.player_id WHERE a.player_id = $1`,
          [p.summary.id],
        );
        expect(Number(row?.batting_timing)).toBe(p.attributes.batting.timing);
        expect(Number(row?.bowling_pace)).toBe(p.attributes.bowling.pace);
        expect(Number(row?.bowling_spin)).toBe(p.attributes.bowling.spin);
        expect(Number(row?.physical_reflex)).toBe(p.attributes.physical.reflex);
        if (STARTER_ROLES[role].bowling === 'required')
          expect(p.overall.bowling).toBeGreaterThanOrEqual(30);
      }
      expect(Math.max(...overalls) - Math.min(...overalls)).toBeLessThanOrEqual(
        4,
      );
    } finally {
      await app.close();
    }
  }, 120000);

  it('stores the chosen personality traits, hand, bowling style and appearance', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const b = await authenticatedGuest(app);
      const appearance = {
        ...STARTER_APPEARANCE,
        bodyPresetId: 'appearance.body.sturdy_01',
        hairColorId: 'appearance.haircolor.auburn',
        beardStyleId: 'appearance.beard.full_01',
        heightScale: 1.04,
      };
      const r = await createPlayer(
        b,
        request({
          battingHand: 'left',
          primaryRole: 'finisher',
          bowlingStyle: null,
          personalityArchetypeId: 'personality.aggressive',
          appearance,
        }),
      );
      const p = r.json().data.player;
      expect(p.summary).toMatchObject({
        battingHand: 'left',
        bowlingStyle: null,
        primaryRole: 'finisher',
      });
      expect(p.attributes.personality).toEqual({
        confidence: 54,
        discipline: 44,
        leadership: 50,
        professionalism: 47,
        riskAppetite: 59,
        teamMindset: 46,
      });
      expect(p.appearance).toEqual(appearance);
      const [row] = await execRaw(
        ctx().url,
        `SELECT p.confidence, p.risk_appetite, a.height_scale, a.beard_style_id FROM player_personality p JOIN player_appearance a ON a.player_id = p.player_id WHERE p.player_id = $1`,
        [p.summary.id],
      );
      expect(Number(row?.risk_appetite)).toBe(59);
      expect(Number(row?.height_scale)).toBeCloseTo(1.04, 3);
      expect(row?.beard_style_id).toBe('appearance.beard.full_01');
    } finally {
      await app.close();
    }
  });
});

describeDb('creation options, previews and funnel events', (ctx) => {
  it('serves registry-driven options with only unlocked cosmetics and exact previews', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const b = await authenticatedGuest(app);
      const r = await b.get(`${PLAYER_URL}/creation-options`);
      expect(r.statusCode).toBe(200);
      expect(r.headers['cache-control']).toBe('no-store');
      const o = r.json().data.options;
      expect(o.gameBalanceVersion).toBe(GAME_BALANCE_VERSION);
      expect(o.roles).toHaveLength(10);
      expect(o.battingHands).toEqual(['right', 'left']);
      expect(o.bowlingStyles).toHaveLength(8);
      expect(o.personalities.length).toBeGreaterThanOrEqual(5);
      expect(o.countries.all).toHaveLength(249);
      expect(o.countries.priority.slice(0, 3)).toEqual(['IN', 'AU', 'GB']);
      expect(o.starter).toMatchObject({
        careerTier: 'academy',
        coins: 2500,
        gems: 50,
        level: 1,
        teamName: 'River Hawks Academy',
      });
      expect(o.starter.loadout).toHaveLength(7);
      const ids = o.appearance.flatMap((c: { options: { id: string }[] }) =>
        c.options.map((x) => x.id),
      );
      expect(ids).not.toContain('appearance.hair.mohawk_01');
      expect(ids).not.toContain('appearance.body.elite_01');
      expect(ids).toContain('appearance.hair.short_01');
      for (const role of o.roles) {
        expect(Object.keys(role.previews).length).toBeGreaterThanOrEqual(1);
        for (const style of role.allowedBowlingStyles)
          expect(role.previews[style]).toBeDefined();
        if (role.bowling !== 'required')
          expect(role.previews.none).toBeDefined();
        else expect(role.previews.none).toBeUndefined();
      }
      // a preview equals what creation will then produce
      const role = o.roles.find((x: { id: string }) => x.id === 'fast_bowler');
      const created = await createPlayer(
        b,
        request({ primaryRole: 'fast_bowler', bowlingStyle: 'right_arm_fast' }),
      );
      expect(created.json().data.player.attributes.bowling).toEqual(
        role.previews.right_arm_fast.attributes.bowling,
      );
      expect(created.json().data.player.overall).toEqual(
        role.previews.right_arm_fast.overall,
      );
      expect(JSON.stringify(o)).not.toMatch(/ROLE_WEIGHTS|weights|formula/i);
    } finally {
      await app.close();
    }
  });

  it('accepts funnel events from signed-in players, rejects junk, and uses pseudonymous ids', async () => {
    const tracked: Array<{ event: string; props: Record<string, unknown> }> =
      [];
    const { app } = await buildAuthApp(
      ctx(),
      {},
      {
        playerTelemetry: {
          track: (event: string, props: Record<string, unknown>) =>
            void tracked.push({ event, props }),
        } as never,
      },
    );
    try {
      const b = await authenticatedGuest(app);
      const userId = (await b.me()).json().data.user.id as string;
      const post = (body: unknown) =>
        b.post(`${PLAYER_URL}/creation/events`, body);
      expect((await post({ event: 'started' })).statusCode).toBe(200);
      expect(
        (await post({ event: 'step_completed', step: 2 })).statusCode,
      ).toBe(200);
      expect(
        (await post({ event: 'role_selected', role: 'finisher' })).statusCode,
      ).toBe(200);
      for (const bad of [
        { event: 'hacked' },
        { event: 'step_completed', step: 99 },
        { event: 'started', email: 'a@b.co' },
        {},
      ])
        expect((await post(bad)).statusCode).toBe(400);
      expect(
        (
          await new Browser(app).post(`${PLAYER_URL}/creation/events`, {
            event: 'started',
          })
        ).statusCode,
      ).toBe(401);
      await createPlayer(b);
      expect(tracked.map((t) => t.event)).toEqual([
        'cricketer_creation_started',
        'cricketer_creation_step_completed',
        'cricketer_creation_role_selected',
        'cricketer_creation_completed',
        'player_created',
        'career_started',
      ]);
      for (const t of tracked) expect(t.props.userId).toBe(userId);
      expect(JSON.stringify(tracked)).not.toMatch(/Naveen|email|password/i);
    } finally {
      await app.close();
    }
  });

  it('GET /player is 404 CRICKETER_NOT_FOUND until a cricketer exists', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const b = await authenticatedGuest(app);
      const r = await b.get(PLAYER_URL);
      expect(r.statusCode).toBe(404);
      expect(r.json().error.code).toBe('CRICKETER_NOT_FOUND');
    } finally {
      await app.close();
    }
  });
});

describeDb('account lifecycle with a cricketer (Modules 3 + 4)', (ctx) => {
  it('guest -> create -> upgrade keeps the same user, player, career, wallet and inventory', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const b = await authenticatedGuest(app);
      const userId = (await b.me()).json().data.user.id as string;
      const created = (await createPlayer(b)).json().data.player;
      const inventoryBefore = (
        await execRaw(
          ctx().url,
          'SELECT id FROM player_inventory WHERE player_id = $1 ORDER BY id',
          [created.summary.id],
        )
      ).map((r) => r.id);

      const email = uniqueEmail('upgrade-player');
      const up = await b.register(email);
      expect(up.statusCode).toBe(201);
      expect(up.json().data.user).toMatchObject({
        id: userId,
        accountType: 'registered',
        hasCricketer: true,
      });
      const after = (await b.get(PLAYER_URL)).json().data.player;
      expect(after).toEqual(created); // identical: same ids, stats, career, kit
      expect(after.career.id).toBe(created.career.id);
      const inventoryAfter = (
        await execRaw(
          ctx().url,
          'SELECT id FROM player_inventory WHERE player_id = $1 ORDER BY id',
          [created.summary.id],
        )
      ).map((r) => r.id);
      expect(inventoryAfter).toEqual(inventoryBefore);
      expect(
        (
          await execRaw(
            ctx().url,
            'SELECT user_id FROM player_profiles WHERE id = $1',
            [created.summary.id],
          )
        )[0]?.user_id,
      ).toBe(userId);
      expect(await counts(ctx().url, userId)).toMatchObject({
        profiles: 1,
        careers: 1,
        inventory: 7,
        ledger: 2,
      });

      // logout -> login: still there
      await b.logout();
      expect((await b.get(PLAYER_URL)).statusCode).toBe(401);
      const back = await b.login(email);
      expect(back.json().data.user).toMatchObject({
        id: userId,
        hasCricketer: true,
      });
      expect((await b.get(PLAYER_URL)).json().data.player).toEqual(created);
      // and creating again is refused
      expect((await createPlayer(b)).json().error.code).toBe(
        'CRICKETER_ALREADY_EXISTS',
      );
    } finally {
      await app.close();
    }
  });

  it('works for a registered account across logout and login', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const email = uniqueEmail('registered-player');
      const b = new Browser(app);
      await b.register(email);
      const created = (
        await createPlayer(b, request({ displayName: 'Reg Player' }))
      ).json().data.player;
      await b.logout();
      const other = new Browser(app);
      const login = await other.login(email, PASSWORD);
      expect(login.json().data.user.hasCricketer).toBe(true);
      expect((await other.get(PLAYER_URL)).json().data.player).toEqual(created);
    } finally {
      await app.close();
    }
  });

  it('keeps pre-existing seeded players readable (they carry no creation metadata)', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const repos = ctx().database.repositories();
      const seeded = await createTestPlayer(repos, {
        displayName: 'Seeded Player',
      });
      await createTestCareer(repos, seeded.profile.id);
      const profile = await repos.players.findByUserId(seeded.user.id);
      expect(profile).toMatchObject({
        creationKey: null,
        creationBalanceVersion: null,
        starterPersonalityId: null,
      });
      const read = await app.player.readModel.profile(seeded.profile.id);
      expect(read.summary.displayName).toBe('Seeded Player');
      expect(read.personalityArchetypeId).toBeNull();
    } finally {
      await app.close();
    }
  });
});

/** An app whose published domain events are captured. */
async function withEvents(
  db: Parameters<typeof buildAuthApp>[0],
  extra: NonNullable<Parameters<typeof buildAuthApp>[2]> = {},
) {
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const built = await buildAuthApp(
    db,
    {},
    {
      ...extra,
      eventPublisher: { publish: (event: never) => void events.push(event) },
    },
  );
  return { ...built, events };
}
