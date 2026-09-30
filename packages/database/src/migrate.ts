import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { parseDatabaseEnvironment } from '@the-cricketer/config';

/**
 * Forward-only migrations. This is the ONLY schema-changing command permitted against staging and
 * production. A session advisory lock serialises concurrent deploys (e.g. several replicas
 * starting at once); the migrator itself runs each pending migration in a transaction.
 */
const MIGRATION_LOCK_ID = 727_274_001;
const env = parseDatabaseEnvironment(process.env);
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
  max: 2,
});
const lockClient = await pool.connect();
try {
  await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
  await migrate(drizzle(pool), { migrationsFolder: './migrations' });
  console.log('Forward migrations applied');
} finally {
  await lockClient
    .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID])
    .catch(() => undefined);
  lockClient.release();
  await pool.end();
}
