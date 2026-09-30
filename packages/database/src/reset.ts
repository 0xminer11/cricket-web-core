import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { parseDatabaseEnvironment } from '@the-cricketer/config';

/**
 * DEVELOPMENT ONLY: drops every object and re-applies migrations. Never wired into deploys,
 * CI deploy steps, container entrypoints or any automatic path. Refuses to run unless the
 * environment is development/test AND the database host is loopback/docker-local.
 */
const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development';
const env = parseDatabaseEnvironment(process.env);
const host = new URL(env.DATABASE_URL).hostname;
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'postgres',
]);

if (
  !['development', 'test'].includes(appEnv) ||
  process.env.NODE_ENV === 'production'
) {
  console.error(
    `db:reset refused: APP_ENV=${appEnv}. It only runs in development or test.`,
  );
  process.exit(1);
}
if (!LOCAL_HOSTS.has(host)) {
  console.error(
    'db:reset refused: DATABASE_URL does not point at a local database host.',
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
try {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await pool.query('CREATE SCHEMA public');
  await migrate(drizzle(pool), { migrationsFolder: './migrations' });
  console.log(
    'Development database reset and migrated. Run pnpm db:seed to load seed data.',
  );
} finally {
  await pool.end();
}
