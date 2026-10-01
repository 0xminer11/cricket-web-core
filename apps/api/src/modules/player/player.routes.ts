import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthGuards } from '../auth/auth.middleware';
import type { PlayerController } from './player.controller';
import type { PlayerGuards } from './player.middleware';

export interface DevTools {
  grantSampleGear: (request: FastifyRequest) => Promise<unknown>;
}

/** Creation payloads are small (a few hundred bytes); cap the body far below the global limit. */
const BODY_LIMIT = 8192;

/**
 * Registered under `/api/v1`. Same protections as the auth routes: trusted-origin (CSRF) check on
 * unsafe methods and `Cache-Control: no-store`.
 */
export async function playerRoutes(
  app: FastifyInstance,
  deps: {
    controller: PlayerController;
    auth: AuthGuards;
    guards: PlayerGuards;
    /** Staging/production apply the strict limits; development and tests stay permissive. */
    strict: boolean;
    /** Development/test only: sample-gear grant for exercising the dressing room. */
    devTools?: DevTools;
  },
): Promise<void> {
  const { controller: c, auth, guards, strict, devTools } = deps;
  app.addHook('onRequest', auth.originGuard);
  app.addHook('onSend', async (_request, reply, payload) => {
    void reply.header('cache-control', 'no-store');
    void reply.header('pragma', 'no-cache');
    return payload;
  });
  const limited = (max: number) => ({
    bodyLimit: BODY_LIMIT,
    config: {
      rateLimit: { max: strict ? max : max * 50, timeWindow: '1 minute' },
    },
  });

  app.get(
    '/player/creation-options',
    { preHandler: auth.requireAuth },
    c.creationOptions,
  );
  app.post(
    '/player',
    { ...limited(20), preHandler: auth.requireAuth },
    c.create,
  );
  app.get('/player', { preHandler: guards.requirePlayer }, c.me);
  app.get(
    '/player/inventory',
    { preHandler: guards.requirePlayer },
    c.inventory,
  );
  app.get(
    '/player/equipment',
    { preHandler: guards.requirePlayer },
    c.equipmentList,
  );
  app.put(
    '/player/equipment/:slot',
    { ...limited(60), preHandler: guards.requirePlayer },
    c.equip,
  );
  app.get(
    '/player/appearance',
    { preHandler: guards.requirePlayer },
    c.appearance,
  );
  app.patch(
    '/player/appearance',
    { ...limited(30), preHandler: guards.requirePlayer },
    c.updateAppearance,
  );
  app.post(
    '/player/viewer/events',
    { ...limited(60), preHandler: auth.requireAuth },
    c.viewerEvent,
  );
  if (devTools)
    app.post(
      '/dev/player/grant-sample-gear',
      { preHandler: guards.requirePlayer },
      devTools.grantSampleGear,
    );
  app.post(
    '/player/creation/events',
    { ...limited(60), preHandler: auth.requireAuth },
    c.event,
  );
}
