import type { FastifyInstance } from 'fastify';
import type { AuthController } from './auth.controller';
import type { AuthGuards } from './auth.middleware';

/** Auth payloads are tiny; a low limit blunts oversized-body abuse before parsing. */
const BODY_LIMIT = 4096;

/**
 * Registered under `/api/v1`. Every route here is covered by the origin (CSRF) guard and gets
 * `Cache-Control: no-store`, so no proxy/CDN can ever cache or share a response that depends on
 * a cookie.
 */
export async function authRoutes(
  app: FastifyInstance,
  deps: { controller: AuthController; guards: AuthGuards },
): Promise<void> {
  const { controller: c, guards: g } = deps;
  app.addHook('onRequest', g.originGuard);
  app.addHook('onSend', async (_request, reply, payload) => {
    void reply.header('cache-control', 'no-store');
    void reply.header('pragma', 'no-cache');
    return payload;
  });
  const route = { bodyLimit: BODY_LIMIT };

  app.post('/auth/guest', { ...route, preHandler: g.optionalAuth }, c.guest);
  app.post(
    '/auth/register',
    { ...route, preHandler: g.optionalAuth },
    c.register,
  );
  app.post('/auth/login', { ...route, preHandler: g.optionalAuth }, c.login);
  app.post('/auth/logout', { ...route, preHandler: g.optionalAuth }, c.logout);
  app.post(
    '/auth/logout-all',
    { ...route, preHandler: g.requireRegisteredUser },
    c.logoutAll,
  );
  app.get('/me', { preHandler: g.requireAuth }, c.me);
  app.get('/auth/sessions', { preHandler: g.requireAuth }, c.sessions);
  app.post(
    '/auth/email/verification/request',
    { ...route, preHandler: g.requireAuth },
    c.requestVerification,
  );
  app.post('/auth/email/verify', route, c.verifyEmail);
  app.post('/auth/password/forgot', route, c.forgotPassword);
  app.post('/auth/password/reset', route, c.resetPassword);
  app.post(
    '/auth/password/change',
    { ...route, preHandler: g.requireAuth },
    c.changePassword,
  );
}
