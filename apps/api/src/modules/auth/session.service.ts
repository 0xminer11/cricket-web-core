import type {
  AccountType,
  AuthSessionRecord,
  Repositories,
  SessionRevokeReason,
} from '@the-cricketer/database';
import type { Clock } from '@the-cricketer/game-core';
import { ACCOUNT_ROLES } from './auth.types';
import type { AuthContext, IssuedSession } from './auth.types';
import { hashToken, isWellFormedToken } from './token.service';
import type { TokenGenerator } from './token.service';

export interface SessionPolicy {
  /** Sliding idle window per account type (seconds). */
  readonly idleTtlSeconds: Readonly<Record<AccountType, number>>;
  /** Hard cap measured from session creation (seconds). */
  readonly absoluteTtlSeconds: number;
  /** Minimum gap between last_seen writes (seconds). */
  readonly touchIntervalSeconds: number;
}

/** Why a presented cookie did not produce a session. Logged internally, never sent to clients. */
export type SessionFailure =
  | 'malformed'
  | 'unknown_session'
  | 'revoked_session'
  | 'expired_session'
  | 'suspended_user'
  | 'deleted_user';

export type SessionResolution =
  | {
      readonly ok: true;
      readonly context: AuthContext;
      /** Present when the idle deadline slid forward; the cookie should be re-sent with it. */
      readonly refreshedMaxAgeSeconds?: number;
    }
  | { readonly ok: false; readonly reason: SessionFailure };

/**
 * Opaque server-side sessions: a 256-bit random token lives in the cookie, only its SHA-256 in
 * PostgreSQL. A request is authorised by hashing the cookie, loading the row, and checking
 * revocation, expiry and the user's current status, so suspension takes effect immediately.
 */
export class SessionService {
  constructor(
    private readonly options: {
      readonly generator: TokenGenerator;
      readonly clock: Clock;
      readonly policy: SessionPolicy;
    },
  ) {}

  private expiryFor(
    accountType: AccountType,
    now: Date,
    absoluteExpiresAt: Date,
  ): Date {
    const idle =
      now.getTime() + this.options.policy.idleTtlSeconds[accountType] * 1000;
    return new Date(Math.min(idle, absoluteExpiresAt.getTime()));
  }

  async create(
    repos: Repositories,
    input: {
      readonly userId: string;
      readonly accountType: AccountType;
      readonly userAgentSummary?: string | null;
    },
  ): Promise<IssuedSession & { readonly session: AuthSessionRecord }> {
    const now = this.options.clock.now();
    const absoluteExpiresAt = new Date(
      now.getTime() + this.options.policy.absoluteTtlSeconds * 1000,
    );
    const expiresAt = this.expiryFor(input.accountType, now, absoluteExpiresAt);
    const token = this.options.generator.generate();
    const session = await repos.sessions.create({
      userId: input.userId,
      tokenHash: hashToken(token),
      now,
      expiresAt,
      absoluteExpiresAt,
      userAgentSummary: input.userAgentSummary ?? null,
    });
    return {
      token,
      session,
      maxAgeSeconds: Math.max(
        1,
        Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
      ),
    };
  }

  async resolve(
    repos: Repositories,
    rawToken: string | undefined,
  ): Promise<SessionResolution> {
    // Cheap structural check first: junk cookies never cost a database round trip.
    if (!isWellFormedToken(rawToken)) return { ok: false, reason: 'malformed' };
    const found = await repos.sessions.findByTokenHash(hashToken(rawToken));
    if (!found) return { ok: false, reason: 'unknown_session' };
    const { session, user } = found;
    const now = this.options.clock.now();
    if (session.revokedAt) return { ok: false, reason: 'revoked_session' };
    if (
      session.expiresAt.getTime() <= now.getTime() ||
      session.absoluteExpiresAt.getTime() <= now.getTime()
    )
      return { ok: false, reason: 'expired_session' };
    if (user.status === 'suspended')
      return { ok: false, reason: 'suspended_user' };
    if (user.status === 'deleted') return { ok: false, reason: 'deleted_user' };

    const context: AuthContext = {
      userId: user.id,
      sessionId: session.id,
      accountType: user.accountType,
      roles: ACCOUNT_ROLES,
    };
    // Throttled sliding expiry: at most one write per touch interval per session.
    const interval = this.options.policy.touchIntervalSeconds * 1000;
    if (now.getTime() - session.lastSeenAt.getTime() >= interval) {
      const expiresAt = this.expiryFor(
        user.accountType,
        now,
        session.absoluteExpiresAt,
      );
      const touched = await repos.sessions.touch({
        id: session.id,
        now,
        expiresAt,
        staleBefore: new Date(now.getTime() - interval),
      });
      if (touched) {
        await repos.users.touchLastSeen(user.id);
        return {
          ok: true,
          context,
          refreshedMaxAgeSeconds: Math.max(
            1,
            Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
          ),
        };
      }
    }
    return { ok: true, context };
  }

  listActive(
    repos: Repositories,
    userId: string,
  ): Promise<readonly AuthSessionRecord[]> {
    return repos.sessions.listActiveForUser(userId, this.options.clock.now());
  }

  revoke(
    repos: Repositories,
    sessionId: string,
    reason: SessionRevokeReason,
  ): Promise<boolean> {
    return repos.sessions.revoke(sessionId, reason, this.options.clock.now());
  }

  revokeAllForUser(
    repos: Repositories,
    userId: string,
    reason: SessionRevokeReason,
    options: { readonly exceptSessionId?: string } = {},
  ): Promise<number> {
    return repos.sessions.revokeAllForUser(
      userId,
      reason,
      this.options.clock.now(),
      options,
    );
  }

  /**
   * Replace a session with a fresh token for the same user (fixation defence). The old token
   * stops working immediately.
   */
  async rotate(
    repos: Repositories,
    current: { readonly sessionId: string },
    input: {
      readonly userId: string;
      readonly accountType: AccountType;
      readonly reason: SessionRevokeReason;
      readonly userAgentSummary?: string | null;
    },
  ): Promise<IssuedSession & { readonly session: AuthSessionRecord }> {
    await this.revoke(repos, current.sessionId, input.reason);
    return this.create(repos, input);
  }
}
