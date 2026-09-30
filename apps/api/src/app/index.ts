import { createService } from '@the-cricketer/server-kit';
import { parseEnvironment } from '@the-cricketer/config';
import { validateGameDefinitions } from '@the-cricketer/game-core';
import { createDatabase } from '@the-cricketer/database';

/**
 * The shared pool is exposed as `app.database` (fastify decorator) for route modules added by
 * later modules; those modules declare the fastify type augmentation next to their routes.
 */
export async function buildApp(input: Record<string, unknown> = process.env) {
  const env = parseEnvironment(input);
  if (env.environment !== 'production') {
    const result = validateGameDefinitions();
    if (result.errors.length) throw new Error(result.errors.join('; '));
  }
  // One pool per process. It connects lazily, so a database outage does not stop the API from
  // booting; /ready reports it instead. Unit tests without DATABASE_URL run database-free.
  // The service logger only exists after createService; the pool logs through this late binding.
  type ServiceLog = {
    warn: (o: object, m: string) => void;
    error: (o: object, m: string) => void;
  };
  const logTarget: { app?: { log: ServiceLog } } = {};
  const database = input.DATABASE_URL
    ? createDatabase(input, {
        logger: {
          warn: (obj, msg) => logTarget.app?.log.warn(obj, msg),
          error: (obj, msg) => logTarget.app?.log.error(obj, msg),
        },
      })
    : undefined;
  const app = await createService('api', env, {
    ...(database ? { readiness: { database: () => database.ping() } } : {}),
  });
  logTarget.app = app;
  if (database) {
    app.decorate('database', database);
    app.addHook('onClose', async () => {
      await database.close();
    });
  }
  return app;
}
