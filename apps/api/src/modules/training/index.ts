import { SystemClock } from '@the-cricketer/game-core';
import type { Clock } from '@the-cricketer/game-core';
import type { Database } from '@the-cricketer/database';
import type { createService } from '@the-cricketer/server-kit';
import type { AuthModule } from '../auth/index';
import { LogEventPublisher } from '../player/player.events';
import type { DomainEventPublisher } from '../player/player.events';
import type { PlayerModule } from '../player/index';
import { TrainingController } from './training.controller';
import { trainingRoutes } from './training.routes';
import { TrainingService } from './training.service';
import { LogTrainingTelemetry } from './training.telemetry';
import type { TrainingTelemetry } from './training.telemetry';

export * from './training.errors';
export { TrainingService } from './training.service';

type Service = Awaited<ReturnType<typeof createService>>;

export interface TrainingModuleOptions {
  readonly clock?: Clock;
  readonly eventPublisher?: DomainEventPublisher;
  readonly trainingTelemetry?: TrainingTelemetry;
}
export interface TrainingModule {
  readonly service: TrainingService;
}

export async function registerTraining(
  app: Service,
  deps: {
    readonly database: Database;
    readonly auth: AuthModule;
    readonly player: PlayerModule;
    readonly strict: boolean;
    readonly options?: TrainingModuleOptions;
  },
): Promise<TrainingModule> {
  const options = deps.options ?? {};
  const service = new TrainingService({
    database: deps.database,
    clock: options.clock ?? new SystemClock(),
    events: options.eventPublisher ?? new LogEventPublisher(app.log),
    telemetry: options.trainingTelemetry ?? new LogTrainingTelemetry(app.log),
    log: app.log,
  });
  const controller = new TrainingController(service);
  await app.register(
    async (scope) => {
      await trainingRoutes(scope, {
        controller,
        auth: deps.auth.guards,
        guards: deps.player.guards,
        strict: deps.strict,
      });
    },
    { prefix: '/api/v1' },
  );
  return { service };
}
