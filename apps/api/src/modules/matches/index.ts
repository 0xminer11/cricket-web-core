import type { Database } from '@the-cricketer/database';
import type { createService } from '@the-cricketer/server-kit';
import type { AuthModule } from '../auth/index';
import type { PlayerModule } from '../player/index';
import { MatchService } from './match.service';
export { MatchService } from './match.service';
export async function registerMatches(
  app: Awaited<ReturnType<typeof createService>>,
  deps: {
    database: Database;
    auth: AuthModule;
    player: PlayerModule;
    strict: boolean;
  },
) {
  const service = new MatchService(deps.database);
  await app.register(
    async (scope) => {
      scope.addHook('onRequest', deps.auth.guards.originGuard);
      scope.addHook('onSend', async (_request, reply, payload) => {
        void reply.header('cache-control', 'no-store');
        return payload;
      });
      const options = {
        preHandler: deps.player.guards.requirePlayer,
        bodyLimit: 1024,
        config: {
          rateLimit: { max: deps.strict ? 30 : 1500, timeWindow: '1 minute' },
        },
      };
      scope.post<{ Params: { fixtureId: string } }>(
        '/career/matches/:fixtureId/start',
        options,
        async (request) => ({
          success: true,
          data: await service.start(request.player!, request.params.fixtureId),
        }),
      );
      scope.get<{ Params: { matchId: string } }>(
        '/matches/:matchId',
        options,
        async (request) => ({
          success: true,
          data: await service.read(request.player!, request.params.matchId),
        }),
      );
    },
    { prefix: '/api/v1' },
  );
}
