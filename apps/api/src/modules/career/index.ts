import type { Database } from '@the-cricketer/database';
import type { Clock } from '@the-cricketer/game-core';
import type { createService } from '@the-cricketer/server-kit';
import type { AuthModule } from '../auth/index';
import type { PlayerModule } from '../player/index';
import { CareerController } from './career.controller';
import { CareerHomeService } from './career-home.service';
import { CareerService } from './career.service';
import { LogCareerTelemetry } from './career.telemetry';
import type { CareerTelemetry } from './career.telemetry';
import { careerRoutes } from './career.routes';

export * from './career.errors';
export { CareerHomeService } from './career-home.service';
export { CareerService } from './career.service';
export { FixtureBootstrapService } from './fixture-bootstrap.service';

type Service = Awaited<ReturnType<typeof createService>>;

export interface CareerModuleOptions {
  readonly clock?: Clock;
  readonly careerTelemetry?: CareerTelemetry;
}
export interface CareerModule {
  readonly home: CareerHomeService;
  readonly career: CareerService;
}

export async function registerCareer(
  app: Service,
  deps: {
    readonly database: Database;
    readonly auth: AuthModule;
    readonly player: PlayerModule;
    readonly strict: boolean;
    readonly options?: CareerModuleOptions;
  },
): Promise<CareerModule> {
  const { database, auth, player } = deps;
  const home = new CareerHomeService(database, app.log, deps.options?.clock);
  const career = new CareerService(database);
  const telemetry =
    deps.options?.careerTelemetry ?? new LogCareerTelemetry(app.log);
  const controller = new CareerController(home, career, telemetry, database);
  await app.register(
    async (scope) => {
      await careerRoutes(scope, {
        controller,
        auth: auth.guards,
        guards: player.guards,
        strict: deps.strict,
      });
    },
    { prefix: '/api/v1' },
  );
  return { home, career };
}
