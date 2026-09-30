import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../connection';
import type { Database, DatabaseOptions } from '../connection';

/**
 * Isolated PostgreSQL databases for integration tests. Tests NEVER run against the developer or
 * any other database: a migrated template (`cricketer_test_template`) is rebuilt once per run, and
 * each test file clones it into its own `cricketer_test_<random>` database that is dropped
 * afterwards. Only names with that prefix can ever be created or dropped here.
 */
export const TEMPLATE_DATABASE = 'cricketer_test_template';
const TEST_NAME = /^cricketer_test_[a-z0-9_]+$/;

function serverUrl(): URL {
  const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw)
    throw new Error(
      'DATABASE_URL (or TEST_DATABASE_URL) is required for integration tests',
    );
  return new URL(raw);
}
const urlFor = (name: string): string => {
  const url = serverUrl();
  url.pathname = `/${name}`;
  return url.toString();
};

export function findMigrationsFolder(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(dir, 'migrations');
    if (existsSync(path.join(candidate, 'meta', '_journal.json')))
      return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('Could not locate the migrations folder');
}

async function withAdmin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: urlFor('postgres') });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function assertTestName(name: string): void {
  if (!TEST_NAME.test(name))
    throw new Error(`Refusing to touch non-test database "${name}"`);
}

export async function dropTestDatabase(name: string): Promise<void> {
  assertTestName(name);
  await withAdmin((c) =>
    c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
  );
}

export async function createEmptyTestDatabase(): Promise<{
  name: string;
  url: string;
}> {
  const name = `cricketer_test_${randomBytes(6).toString('hex')}`;
  assertTestName(name);
  await withAdmin((c) => c.query(`CREATE DATABASE "${name}"`));
  return { name, url: urlFor(name) };
}

/** Apply migrations to a database. `folder` lets tests replay a truncated journal (upgrade test). */
export async function applyMigrations(
  url: string,
  folder = findMigrationsFolder(),
): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: folder });
  } finally {
    await pool.end();
  }
}

/** Rebuild the migrated template from scratch (also proves migrations work on an empty database). */
export async function prepareTemplateDatabase(): Promise<void> {
  await dropTestDatabase(TEMPLATE_DATABASE);
  await withAdmin((c) => c.query(`CREATE DATABASE "${TEMPLATE_DATABASE}"`));
  await applyMigrations(urlFor(TEMPLATE_DATABASE));
}

export interface TestDatabase {
  readonly name: string;
  readonly url: string;
  readonly database: Database;
  drop(): Promise<void>;
}

export async function createTestDatabase(
  options: DatabaseOptions = {},
): Promise<TestDatabase> {
  const name = `cricketer_test_${randomBytes(6).toString('hex')}`;
  assertTestName(name);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await withAdmin((c) =>
        c.query(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DATABASE}"`),
      );
      break;
    } catch (error) {
      // 55006: template briefly in use by a concurrent clone; retry.
      const code = (error as { code?: string }).code;
      if (attempt >= 8 || (code !== '55006' && code !== '40001')) throw error;
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
  const url = urlFor(name);
  const database = createDatabase(
    { DATABASE_URL: url, DATABASE_POOL_MAX: '8' },
    options,
  );
  return {
    name,
    url,
    database,
    async drop() {
      await database.close();
      await dropTestDatabase(name);
    },
  };
}

/** Re-exported so tests can issue raw SQL (tamper attempts) without a direct drizzle-orm dependency. */
export { sql } from 'drizzle-orm';

/** Run a read-only query and return the first column of each row (schema assertions in tests). */
export async function queryFirstColumn(
  url: string,
  text: string,
): Promise<string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(text)).rows.map((row: Record<string, unknown>) =>
      String(Object.values(row)[0]),
    );
  } finally {
    await client.end();
  }
}

/** Execute a statement with parameters against a test database URL and return rows. */
export async function execRaw(
  url: string,
  text: string,
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as Record<string, unknown>[];
  } finally {
    await client.end();
  }
}
