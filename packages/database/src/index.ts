import { createClient } from 'redis';
import { parseConnectionEnvironment } from '@the-cricketer/config';
import { createDatabase } from './connection';
import type { Database, DatabaseOptions } from './connection';

export * from './connection';
export * from './definitions';
export * from './enums';
export * from './errors';
export * from './ids';
export * from './limits';
export * from './pagination';
export * from './player-foundation';
export * from './records';
export * from './repositories/index';
export * from './stats-derivations';
export * as schema from './schema/index';

/** One owner per process; connect explicitly and close through the application's onClose hook. */
export interface Connections {
  readonly database: Database;
  /** Drizzle handle bound to the shared pool (kept for Module 1 compatibility). */
  readonly db: Database['db'];
  readonly redis: ReturnType<typeof createClient>;
  connect(): Promise<void>;
  check(): Promise<void>;
  close(): Promise<void>;
}

export function createConnections(
  input: Record<string, unknown>,
  options: DatabaseOptions = {},
): Connections {
  const env = parseConnectionEnvironment(input);
  const database = createDatabase(input, options);
  const redis = createClient({
    url: env.REDIS_URL,
    socket: { connectTimeout: 5000, reconnectStrategy: false },
  });
  let dependencyError: Error | undefined;
  redis.on('error', () => {
    dependencyError = new Error('Redis connection lost');
  });
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      const results = await Promise.allSettled([
        database.close(),
        redis.isOpen ? redis.quit() : Promise.resolve(),
      ]);
      if (results.some((r) => r.status === 'rejected'))
        throw new Error('Dependency shutdown failed');
    })();
    return closing;
  };
  return {
    database,
    db: database.db,
    redis,
    async connect(): Promise<void> {
      try {
        await database.ping();
      } catch {
        await close();
        throw new Error(
          'PostgreSQL unavailable; verify DATABASE_URL and start the PostgreSQL service',
        );
      }
      try {
        await redis.connect();
        await redis.ping();
      } catch {
        await close();
        throw new Error(
          'Redis unavailable; verify REDIS_URL and start the Redis service',
        );
      }
    },
    async check(): Promise<void> {
      if (dependencyError) throw dependencyError;
      await database.ping();
      await redis.ping();
    },
    close,
  };
}
