import type { FastifyInstance } from 'fastify';
import type { AuthGuards } from '../auth/auth.middleware';
import type { PlayerGuards } from '../player/player.middleware';
import type { CareerController } from './career.controller';

/**
 * Registered under `/api/v1/career`. EVERY route requires an authenticated user who owns a
 * cricketer (`requirePlayer`); the player is resolved from the session, so there is no player or
 * career id anywhere in the paths, queries or bodies of these self-service routes.
 */
export async function careerRoutes(
  app: FastifyInstance,
  deps: {
    controller: CareerController;
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
  const limited = (max: number, bodyLimit = 1024) => ({
    bodyLimit,
    config: {
      rateLimit: { max: strict ? max : max * 50, timeWindow: '1 minute' },
    },
  });
  const read = { ...limited(120), preHandler: guards.requirePlayer };

  app.get('/career/home', read, c.home);
  app.get('/career/fixtures', read, c.fixtures);
  app.get('/career/history', read, c.history);
  app.get('/career/progression', read, c.progression);
  app.get('/career/objectives', read, c.objectives);
  app.get('/career/events', read, c.events);
  app.get('/career/events/:id', read, c.event);
  app.post(
    '/career/onboarding/:step',
    { ...limited(30), preHandler: guards.requirePlayer },
    c.completeOnboarding,
  );
  app.post(
    '/career/telemetry',
    { ...limited(120), preHandler: guards.requirePlayer },
    c.track,
  );
}
