import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '@the-cricketer/database';
import { CsrfOriginError } from './auth.errors';
import {
  AccountSuspendedError,
  AuthRequiredError,
  RegisteredAccountRequiredError,
} from './auth.errors';
import type { SessionCookie } from './auth.cookies';
import type { AuthTelemetry } from './auth.telemetry';
import type { AuthContext } from './auth.types';
import type { SessionFailure, SessionService } from './session.service';

declare module 'fastify' {
  interface FastifyRequest {
    /** Verified caller, or null. Set by optionalAuth/requireAuth; never read from client input. */
    auth: AuthContext | null;
    /** Why the presented cookie was rejected (internal; drives the error and the log line). */
    authFailure: SessionFailure | null;
    authResolved: boolean;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const QUIET_FAILURES: ReadonlySet<SessionFailure> = new Set([
  'malformed',
  'unknown_session',
  'expired_session',
]);

export interface AuthGuardDeps {
  readonly database: Database;
  readonly sessions: SessionService;
  readonly cookie: SessionCookie;
  readonly telemetry: AuthTelemetry;
  readonly trustedOrigins: readonly string[];
}

/**
 * Reusable Fastify hooks:
 *  - `originGuard`        CSRF: unsafe methods must come from a trusted Origin (or Referer).
 *  - `optionalAuth`       resolves the session if there is one; never rejects.
 *  - `requireAuth`        guest or registered account required.
 *  - `requireRegisteredUser` registered accounts only (guests get a clear upgrade error).
 *
 * Flow: read cookie -> hash -> load session -> check revoked/expired -> load minimal user
 * state -> check account status -> attach AuthContext. Handlers take the user id from
 * `request.auth`, never from the body, query or path.
 */
export function createAuthGuards(deps: AuthGuardDeps) {
  const trusted = new Set(deps.trustedOrigins);

  const optionalAuth = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    if (request.authResolved) return;
    request.authResolved = true;
    const token = deps.cookie.read(request);
    if (token === undefined) return;
    const result = await deps.sessions.resolve(
      deps.database.repositories(),
      token,
    );
    if (result.ok) {
      request.auth = result.context;
      // The idle deadline slid forward: re-send the cookie so its Max-Age follows it.
      if (result.refreshedMaxAgeSeconds !== undefined)
        deps.cookie.set(reply, token, result.refreshedMaxAgeSeconds);
      return;
    }
    request.authFailure = result.reason;
    deps.telemetry.count('session_validation_error');
    request.log[QUIET_FAILURES.has(result.reason) ? 'info' : 'warn'](
      {
        requestId: request.id,
        event: 'auth.session_rejected',
        reason: result.reason,
      },
      'session rejected',
    );
    // A suspended user keeps the cookie (so the message stays consistent); everything else is dead.
    if (result.reason !== 'suspended_user') deps.cookie.clear(reply);
  };

  const requireAuth = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    await optionalAuth(request, reply);
    if (request.auth) return;
    throw request.authFailure === 'suspended_user'
      ? new AccountSuspendedError()
      : new AuthRequiredError();
  };

  const requireRegisteredUser = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    await requireAuth(request, reply);
    if (request.auth?.accountType !== 'registered')
      throw new RegisteredAccountRequiredError();
  };

  const originGuard = async (request: FastifyRequest): Promise<void> => {
    if (SAFE_METHODS.has(request.method)) return;
    let origin = request.headers.origin;
    if (!origin && request.headers.referer) {
      try {
        origin = new URL(request.headers.referer).origin;
      } catch {
        origin = undefined;
      }
    }
    // Browsers always send Origin on cross-origin and (today) same-origin POSTs. A request with
    // neither header is not a browser acting for a user, and gets no cookie-backed access.
    if (!origin || !trusted.has(origin)) throw new CsrfOriginError();
  };

  return { optionalAuth, requireAuth, requireRegisteredUser, originGuard };
}
export type AuthGuards = ReturnType<typeof createAuthGuards>;
