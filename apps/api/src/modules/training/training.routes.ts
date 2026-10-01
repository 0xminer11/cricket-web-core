import type { FastifyInstance } from 'fastify';
import type { AuthGuards } from '../auth/auth.middleware';
import type { PlayerGuards } from '../player/player.middleware';
import type { TrainingController } from './training.controller';

/**
 * Registered under `/api/v1/training`. Every route requires an authenticated user who owns a
 * cricketer; the player is resolved from the session (no player id anywhere).
 */
export async function trainingRoutes(
  app: FastifyInstance,
  deps: {
    controller: TrainingController;
    auth: AuthGuards;
    guards: PlayerGuards;
    strict: boolean;
  },
): Promise<void> {
  const { controller: c, auth, guards, strict } = deps;
  app.addHook('onRequest', auth.originGuard);
  app.addHook('onSend', async (_request, reply, payload) => {
    void reply.header('cache-control', 'no-store');
    void reply.header('pragma', 'no-cache');
    return payload;
  });
  const limited = (max: number) => ({
    bodyLimit: 1024,
    config: {
      rateLimit: { max: strict ? max : max * 50, timeWindow: '1 minute' },
    },
  });
  const pre = { preHandler: guards.requirePlayer };

  app.get('/training', { ...limited(120), ...pre }, c.hub);
  // static segments before the :trainingId parameter
  app.get('/training/history', { ...limited(120), ...pre }, c.history);
  app.post('/training/telemetry', { ...limited(120), ...pre }, c.track);
  app.get('/training/:trainingId', { ...limited(120), ...pre }, c.detail);
  app.post('/training/:trainingId', { ...limited(60), ...pre }, c.start);
}
