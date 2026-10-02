import { registerMatches } from '../modules/matches/index';
import { createService } from '@the-cricketer/server-kit';
import { parseAuthEnvironment, parseEnvironment } from '@the-cricketer/config';
import { validateGameDefinitions } from '@the-cricketer/game-core';
import { createDatabase } from '@the-cricketer/database';
import type { DefinitionCatalog } from '@the-cricketer/database';
import { registerAuth } from '../modules/auth/index';
import type { AuthModuleOptions } from '../modules/auth/index';
import { registerTraining } from '../modules/training/index';
import type { TrainingModuleOptions } from '../modules/training/index';
import { registerCareer } from '../modules/career/index';
import type { CareerModuleOptions } from '../modules/career/index';
import { registerPlayer } from '../modules/player/index';
import type { PlayerModuleOptions } from '../modules/player/index';

/**
 * The shared pool is exposed as `app.database` (fastify decorator) for route modules added by
 * later modules; those modules declare the fastify type augmentation next to their routes.
 */
/** Seams for tests and later adapters; production wiring passes none. */
export interface AppOptions
  extends
    AuthModuleOptions,
    PlayerModuleOptions,
    CareerModuleOptions,
    TrainingModuleOptions {
  /** Static-definition lookup used by the repositories (tests inject faults to prove rollback). */
  readonly catalog?: DefinitionCatalog;
}

export async function buildApp(
  input: Record<string, unknown> = process.env,
  options: AppOptions = {},
) {
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
        ...(options.clock ? { clock: options.clock } : {}),
        ...(options.catalog ? { catalog: options.catalog } : {}),
      })
    : undefined;
  // Authentication needs the database. Without DATABASE_URL (unit tests) the API serves only
  // health/readiness and registers no account routes.
  const authEnv = database ? parseAuthEnvironment(input, env) : undefined;
  const app = await createService('api', env, {
    ...(database ? { readiness: { database: () => database.ping() } } : {}),
    // Cookie-authenticated routes: credentialed CORS for the exact trusted web origins only.
    ...(authEnv
      ? {
          credentialedCors: {
            pathPrefix: '/api/',
            origins: authEnv.trustedOrigins,
          },
        }
      : {}),
  });
  logTarget.app = app;
  if (database) {
    app.decorate('database', database);
    app.addHook('onClose', async () => {
      await database.close();
    });
    if (authEnv) {
      const auth = await registerAuth(app, {
        database,
        env,
        authEnv,
        input,
        options,
      });
      const player = await registerPlayer(app, {
        database,
        auth,
        input,
        strict: env.deployed,
        devTools:
          env.environment === 'development' || env.environment === 'test',
        options,
      });
      await registerTraining(app, {
        database,
        auth,
        player,
        strict: env.deployed,
        options,
      });
      await registerMatches(app, {
        database,
        auth,
        player,
        strict: env.deployed,
        devTools:
          env.environment === 'development' || env.environment === 'test',
      });
      await registerCareer(app, {
        database,
        auth,
        player,
        strict: env.deployed,
        options,
      });
    }
  }
  return app;
}
