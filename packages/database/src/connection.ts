import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { parseDatabaseEnvironment } from '@the-cricketer/config';
import type { Clock } from '@the-cricketer/game-core';
import { defaultCatalog } from './definitions';
import type { DefinitionCatalog } from './definitions';
import {
  DatabaseConnectionError,
  mapDatabaseError,
  PersistenceError,
  TransactionConflictError,
} from './errors';
import type { PersistenceErrorCode } from './errors';
import { createRepositories } from './repositories/index';
import type { Repositories } from './repositories/index';
import * as schema from './schema/index';

export type Schema = typeof schema;
/** Either the pool-backed database or a transaction; repositories accept both. */
export type Executor = PgDatabase<NodePgQueryResultHKT, Schema>;

/** Minimal structural logger (pino-compatible). Never receives SQL, parameters or records. */
export interface DatabaseLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface DatabaseOptions {
  readonly logger?: DatabaseLogger;
  readonly catalog?: DefinitionCatalog;
  readonly clock?: Clock;
}

export interface TransactionOptions {
  /** Used in slow-transaction / failure logs. */
  readonly operation?: string;
  readonly requestId?: string;
  readonly isolationLevel?:
    'read committed' | 'repeatable read' | 'serializable';
  /** Retries after serialization failure / deadlock (default 2 => 3 attempts). */
  readonly retries?: number;
}

export interface Database {
  readonly db: ReturnType<typeof drizzle<Schema>>;
  /**
   * Run `fn` atomically. Throws mapped PersistenceErrors, never raw driver errors. On
   * serialization failures/deadlocks the whole callback is re-run, so it must only do database
   * work (no external side effects).
   */
  transaction<T>(
    fn: (tx: Executor) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
  /** Repository bundle bound to the pool, or to `executor` (e.g. a transaction). */
  repositories(executor?: Executor): Repositories;
  ping(): Promise<void>;
  close(): Promise<void>;
}

const OPERATIONAL_CODES: ReadonlySet<PersistenceErrorCode> = new Set([
  'CONNECTION_ERROR',
  'QUERY_TIMEOUT',
  'TRANSACTION_CONFLICT',
  'INTEGRITY_ERROR',
  'UNKNOWN_DATABASE_ERROR',
]);
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createDatabase(
  input: Record<string, unknown>,
  options: DatabaseOptions = {},
): Database {
  const env = parseDatabaseEnvironment(input);
  const catalog = options.catalog ?? defaultCatalog;
  const clock = options.clock ?? { now: () => new Date() };
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
    statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS * 2,
    application_name: 'the-cricketer',
  });
  // An idle client dying must not crash the process; the next query surfaces a mapped error.
  pool.on('error', (error) => {
    const mapped = mapDatabaseError(error);
    options.logger?.error(
      { errorType: mapped instanceof Error ? mapped.name : 'Error' },
      'PostgreSQL pool client error',
    );
  });
  const db = drizzle(pool, { schema });
  const slowMs = env.DATABASE_SLOW_QUERY_MS;
  let closing: Promise<void> | undefined;

  const database: Database = {
    db,
    repositories: (executor: Executor = db) =>
      createRepositories(executor, { catalog, clock }),
    async transaction(fn, opts = {}) {
      const attempts = (opts.retries ?? 2) + 1;
      for (let attempt = 1; ; attempt += 1) {
        const started = performance.now();
        try {
          const result = await db.transaction(fn, {
            isolationLevel: opts.isolationLevel ?? 'read committed',
          });
          const durationMs = Math.round(performance.now() - started);
          if (slowMs > 0 && durationMs >= slowMs)
            options.logger?.warn(
              {
                operation: opts.operation ?? 'transaction',
                requestId: opts.requestId,
                durationMs,
              },
              'slow database transaction',
            );
          return result;
        } catch (error) {
          const mapped = mapDatabaseError(error);
          if (
            mapped instanceof TransactionConflictError &&
            attempt < attempts
          ) {
            await sleep(10 * attempt + Math.floor(Math.random() * 20));
            continue;
          }
          // Expected domain outcomes (insufficient balance, duplicates) are not log-worthy.
          if (
            mapped instanceof PersistenceError &&
            OPERATIONAL_CODES.has(mapped.code)
          )
            options.logger?.warn(
              {
                operation: opts.operation ?? 'transaction',
                requestId: opts.requestId,
                errorType: mapped instanceof Error ? mapped.name : 'Error',
                durationMs: Math.round(performance.now() - started),
                attempt,
              },
              'database transaction failed',
            );
          throw mapped;
        }
      }
    },
    async ping() {
      try {
        await pool.query('SELECT 1');
      } catch (error) {
        const mapped = mapDatabaseError(error);
        throw mapped instanceof DatabaseConnectionError
          ? mapped
          : new DatabaseConnectionError();
      }
    },
    close() {
      closing ??= pool.end();
      return closing;
    },
  };
  return database;
}
