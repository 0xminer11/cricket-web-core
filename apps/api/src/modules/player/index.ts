import { parsePlayerEnvironment } from '@the-cricketer/config';
import type { Database } from '@the-cricketer/database';
import { SystemClock } from '@the-cricketer/game-core';
import type { Clock } from '@the-cricketer/game-core';
import type { createService } from '@the-cricketer/server-kit';
import type { AuthModule } from '../auth/index';
import { NamePolicy } from './name-policy';
import { PlayerCreationService } from './player-creation.service';
import { createDevTools } from './dev-tools';
import { EquipmentService } from './equipment.service';
import { PlayerController } from './player.controller';
import { LogEventPublisher, LogPlayerTelemetry } from './player.events';
import type { DomainEventPublisher, PlayerTelemetry } from './player.events';
import { createPlayerGuards } from './player.middleware';
import { PlayerReadModel } from './player.read-model';
import { playerRoutes } from './player.routes';

export * from './player.errors';
export * from './player.events';
export * from './player.middleware';
export { NamePolicy } from './name-policy';
export { PlayerCreationService } from './player-creation.service';
export { PlayerReadModel } from './player.read-model';
export { EquipmentService } from './equipment.service';
export { buildCreationOptions } from './creation-options';

type Service = Awaited<ReturnType<typeof createService>>;

export interface PlayerModuleOptions {
  readonly clock?: Clock;
  readonly eventPublisher?: DomainEventPublisher;
  readonly playerTelemetry?: PlayerTelemetry;
}
export interface PlayerModule {
  readonly creation: PlayerCreationService;
  readonly readModel: PlayerReadModel;
  readonly guards: ReturnType<typeof createPlayerGuards>;
}
declare module 'fastify' {
  interface FastifyInstance {
    player: PlayerModule;
  }
}

export async function registerPlayer(
  app: Service,
  deps: {
    readonly database: Database;
    readonly auth: AuthModule;
    readonly input: Record<string, unknown>;
    readonly strict: boolean;
    /** Register development-only helpers (never in staging/production). */
    readonly devTools: boolean;
    readonly options?: PlayerModuleOptions;
  },
): Promise<PlayerModule> {
  const { database, auth, input } = deps;
  const options = deps.options ?? {};
  const readModel = new PlayerReadModel(database);
  const telemetry = options.playerTelemetry ?? new LogPlayerTelemetry(app.log);
  const creation = new PlayerCreationService({
    database,
    readModel,
    namePolicy: new NamePolicy(parsePlayerEnvironment(input)),
    events: options.eventPublisher ?? new LogEventPublisher(app.log),
    telemetry,
    clock: options.clock ?? new SystemClock(),
  });
  const guards = createPlayerGuards({ database, auth: auth.guards });
  const equipment = new EquipmentService(database, telemetry);
  const controller = new PlayerController(
    creation,
    readModel,
    telemetry,
    equipment,
  );
  app.decorateRequest('player', null);
  await app.register(
    async (scope) => {
      await playerRoutes(scope, {
        controller,
        auth: auth.guards,
        guards,
        strict: deps.strict,
        ...(deps.devTools ? { devTools: createDevTools(database) } : {}),
      });
    },
    { prefix: '/api/v1' },
  );
  const module: PlayerModule = { creation, readModel, guards };
  app.decorate('player', module);
  return module;
}
