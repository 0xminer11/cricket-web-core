import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { seedReferenceData } from '../../packages/database/src/seed/reference';
import { createDatabase } from '../../packages/database/src/index';
import {
  applyMigrations,
  dropTestDatabase,
  createEmptyTestDatabase,
  execRaw,
  findMigrationsFolder,
  queryFirstColumn,
} from '../../packages/database/src/testing/harness';
import { describeDb, integration } from '../support/db';

const EXPECTED_TABLES = [
  'audit_logs',
  'career_event_instances',
  'career_history',
  'careers',
  'contracts',
  'currency_balances',
  'equipped_items',
  'fixtures',
  'game_versions',
  'match_balls',
  'match_innings',
  'match_overs',
  'match_participants',
  'matches',
  'player_achievements',
  'player_appearance',
  'player_attributes',
  'player_inventory',
  'player_personality',
  'player_profiles',
  'player_skill_progress',
  'player_state',
  'player_stats',
  'reward_grants',
  'sponsorships',
  'team_memberships',
  'teams',
  'training_sessions',
  'users',
  'wallet_transactions',
];

const scalar = queryFirstColumn;

describeDb('template schema (fresh migration)', (ctx) => {
  it('creates every domain table from an empty database', async () => {
    const tables = await scalar(
      ctx().url,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
    );
    expect(tables).toEqual([...EXPECTED_TABLES].sort());
  });

  it('has foreign keys, unique constraints, CHECK constraints and the planned indexes', async () => {
    const count = async (type: string) =>
      Number(
        (
          await scalar(
            ctx().url,
            `SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' AND c.contype = '${type}'`,
          )
        )[0],
      );
    expect(await count('f')).toBeGreaterThanOrEqual(45);
    expect(await count('c')).toBeGreaterThanOrEqual(202);
    expect(await count('u')).toBeGreaterThanOrEqual(9);
    const indexes = await scalar(
      ctx().url,
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'",
    );
    for (const name of [
      'player_profiles_user_id_uniq',
      'careers_player_id_idx',
      'careers_one_active_per_player_uniq',
      'team_memberships_player_status_idx',
      'fixtures_scheduled_status_idx',
      'matches_status_started_idx',
      'match_balls_match_innings_seq_uniq',
      'match_balls_over_ball_uniq',
      'match_innings_match_number_uniq',
      'match_overs_innings_number_uniq',
      'player_inventory_player_status_idx',
      'equipped_items_pk',
      'wallet_transactions_player_created_idx',
      'wallet_transactions_idempotency_uniq',
      'training_sessions_player_started_idx',
      'player_achievements_pk',
      'contracts_career_status_idx',
      'reward_grants_source_uniq',
      'currency_balances_pk',
    ])
      expect(indexes, name).toContain(name);
  });

  it('installs the integrity triggers', async () => {
    const triggers = await scalar(
      ctx().url,
      'SELECT tgname FROM pg_trigger WHERE NOT tgisinternal',
    );
    for (const name of [
      'wallet_transactions_append_only',
      'audit_logs_append_only',
      'career_history_append_only',
      'currency_balances_guard_write',
      'player_state_lifetime_xp_monotonic',
      'users_touch_updated_at',
    ])
      expect(triggers).toContain(name);
  });

  it('keeps timestamps in TIMESTAMPTZ and identifiers in UUID (except the high-volume ball table)', async () => {
    const plain = await scalar(
      ctx().url,
      "SELECT table_name || '.' || column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'",
    );
    expect(plain).toEqual([]);
    const nonUuid = await scalar(
      ctx().url,
      "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'id' AND data_type <> 'uuid'",
    );
    expect(nonUuid).toEqual(['match_balls']);
  });

  it('never creates static-definition tables (shots, deliveries, pitches, items, attributes)', async () => {
    const tables = await scalar(
      ctx().url,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name ~ '(shot|deliver|pitch|item_def|attribute_def|training_def)'",
    );
    expect(tables).toEqual([]);
  });

  it('updates updated_at through the database trigger, even for raw SQL', async () => {
    const [inserted] = await execRaw(
      ctx().url,
      "INSERT INTO users (origin) VALUES ('test') RETURNING id, updated_at",
    );
    await new Promise((r) => setTimeout(r, 15));
    const [updated] = await execRaw(
      ctx().url,
      'UPDATE users SET last_seen_at = now() WHERE id = $1 RETURNING updated_at',
      [inserted?.id],
    );
    expect((updated?.updated_at as Date).getTime()).toBeGreaterThan(
      (inserted?.updated_at as Date).getTime(),
    );
  });
});

it.runIf(integration)(
  'migrates a completely empty PostgreSQL database to the latest schema and seeds it',
  async () => {
    const fresh = await createEmptyTestDatabase();
    try {
      await applyMigrations(fresh.url);
      const tables = await scalar(
        fresh.url,
        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
      );
      expect(Number(tables[0])).toBe(EXPECTED_TABLES.length);
      const database = createDatabase({ DATABASE_URL: fresh.url });
      try {
        const seeded = await seedReferenceData(database);
        expect(seeded.teams).toHaveLength(5);
      } finally {
        await database.close();
      }
    } finally {
      await dropTestDatabase(fresh.name);
    }
  },
  60000,
);

it.runIf(integration)(
  'upgrades an existing database migration by migration (0000 then later)',
  async () => {
    const source = findMigrationsFolder();
    const partial = mkdtempSync(
      path.join(os.tmpdir(), 'cricketer-migrations-'),
    );
    cpSync(source, partial, { recursive: true });
    const journalPath = path.join(partial, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: unknown[];
    };
    expect(journal.entries.length).toBeGreaterThanOrEqual(2);
    writeFileSync(
      journalPath,
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
    );

    const db = await createEmptyTestDatabase();
    try {
      await applyMigrations(db.url, partial); // baseline only
      expect(
        await scalar(
          db.url,
          "SELECT count(*) FROM pg_trigger WHERE tgname = 'wallet_transactions_append_only'",
        ),
      ).toEqual(['0']);
      // put data in the "old" schema, then upgrade underneath it
      await scalar(
        db.url,
        "INSERT INTO users (origin) VALUES ('test') RETURNING id",
      );
      await applyMigrations(db.url); // remaining migrations on top
      expect(
        await scalar(
          db.url,
          "SELECT count(*) FROM pg_trigger WHERE tgname = 'wallet_transactions_append_only'",
        ),
      ).toEqual(['1']);
      expect(await scalar(db.url, 'SELECT count(*) FROM users')).toEqual(['1']);
      expect(
        Number(
          (
            await scalar(
              db.url,
              'SELECT count(*) FROM drizzle.__drizzle_migrations',
            )
          )[0],
        ),
      ).toBe(journal.entries.length);
      await applyMigrations(db.url); // re-running is a no-op
      expect(
        Number(
          (
            await scalar(
              db.url,
              'SELECT count(*) FROM drizzle.__drizzle_migrations',
            )
          )[0],
        ),
      ).toBe(journal.entries.length);
    } finally {
      await dropTestDatabase(db.name);
    }
  },
  60000,
);
