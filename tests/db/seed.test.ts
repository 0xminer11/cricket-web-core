import { expect, it } from 'vitest';
import {
  TEAMS,
  MATCH_ENGINE_VERSION,
} from '../../packages/game-core/src/index';
import {
  DEV_IDS,
  seedDevelopmentData,
  seedReferenceData,
} from '../../packages/database/src/seed/index';
import { sql } from '../../packages/database/src/testing/harness';
import { describeDb } from '../support/db';

describeDb('seeding', (ctx) => {
  const repos = () => ctx().database.repositories();

  it('seeds reference data idempotently with stable team ids', async () => {
    const first = await seedReferenceData(ctx().database);
    const second = await seedReferenceData(ctx().database);
    expect(first.teams).toHaveLength(TEAMS.length);
    expect(second.teams.map((t) => t.id)).toEqual(first.teams.map((t) => t.id));
    expect(second.version.id).toBe(first.version.id);
    expect(first.version).toMatchObject({
      gameBalanceVersion: '1',
      matchEngineVersion: MATCH_ENGINE_VERSION,
      dataSchemaVersion: 2,
    });
    const count = await ctx().database.db.execute(
      sql`SELECT (SELECT count(*) FROM teams)::int AS teams, (SELECT count(*) FROM game_versions)::int AS versions`,
    );
    expect(count.rows[0]).toEqual({ teams: TEAMS.length, versions: 1 });
  });

  it('seeds complete, valid development players once and marks them as development users', async () => {
    const first = await seedDevelopmentData(ctx().database, 'development');
    expect(first.created).toEqual([
      'Dev Cricketer',
      'Dev Batter',
      'Dev Fast Bowler',
      'Dev All-Rounder',
    ]);
    const again = await seedDevelopmentData(ctx().database, 'test');
    expect(again.created).toEqual([]);
    expect(again.matchId).toBeNull();

    const user = await repos().users.findById(DEV_IDS.cricketerUser);
    expect(user?.origin).toBe('development');
    const dev = await repos().players.findByUserId(DEV_IDS.cricketerUser);
    const dashboard = await repos().players.getDashboard(dev?.id ?? '');
    expect(dashboard).toMatchObject({
      profile: {
        displayName: 'Dev Cricketer',
        primaryRole: 'top_order_batter',
      },
      state: { level: 5 },
      career: { currentTier: 'academy' },
    });
    expect(dashboard?.balances).toEqual([
      { currencyType: 'coins', balance: 5000 },
      { currencyType: 'gems', balance: 100 },
    ]);
    expect(dashboard?.equipped.map((e) => e.itemDefinitionId)).toEqual([
      'item.bat.street_willow_01',
      'item.gloves.quick_touch_01',
      'item.pads.mobile_guard_01',
    ]);
    expect(
      await repos().wallet.reconcile(dev?.id ?? '', 'coins'),
    ).toMatchObject({ consistent: true });
    const nonOrganic = await ctx().database.db.execute(
      sql`SELECT count(*)::int AS n FROM users WHERE origin <> 'organic'`,
    );
    expect(nonOrganic.rows[0]).toEqual({ n: 4 });
  });

  it('seeds a completed development match whose aggregates match its balls', async () => {
    const dev = await repos().players.findByUserId(DEV_IDS.cricketerUser);
    const history = await repos().matches.listPlayerMatchHistory(dev?.id ?? '');
    expect(history.items).toHaveLength(1);
    const entry = history.items[0];
    expect(entry).toMatchObject({
      status: 'completed',
      won: true,
      matchFormatId: 'format.2_over',
    });
    expect(entry?.scores.map((s) => [s.runs, s.wickets, s.legalBalls])).toEqual(
      [
        [19, 1, 12],
        [11, 0, 12],
      ],
    );
    const summary = await repos().matches.getMatchSummary(entry?.matchId ?? '');
    for (const innings of summary.innings)
      expect(
        (await repos().matches.verifyInningsAggregates(innings.id)).consistent,
      ).toBe(true);
  });

  it('refuses to create development data outside development/test', async () => {
    await expect(
      seedDevelopmentData(ctx().database, 'production'),
    ).rejects.toThrow(/not allowed/);
    await expect(
      seedDevelopmentData(ctx().database, 'staging'),
    ).rejects.toThrow(/not allowed/);
  });
});
