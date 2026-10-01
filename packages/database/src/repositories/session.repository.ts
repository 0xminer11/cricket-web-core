import { and, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { Executor } from '../connection';
import type { SessionRevokeReason } from '../enums';
import { InvalidInputError } from '../errors';
import type { AuthSessionRecord, AuthSessionWithUser } from '../records';
import { authSessions, users } from '../schema/index';
import { assertUuid, Repository, requireRow } from './shared';

const toSession = (
  row: typeof authSessions.$inferSelect,
): AuthSessionRecord => ({
  id: row.id,
  userId: row.userId,
  createdAt: row.createdAt,
  lastSeenAt: row.lastSeenAt,
  expiresAt: row.expiresAt,
  absoluteExpiresAt: row.absoluteExpiresAt,
  revokedAt: row.revokedAt,
  revokedReason: row.revokedReason,
  userAgentSummary: row.userAgentSummary,
});

const TOKEN_HASH = /^[0-9a-f]{64}$/;
const assertTokenHash = (value: string): void => {
  if (!TOKEN_HASH.test(value))
    throw new InvalidInputError('tokenHash must be a SHA-256 hex digest');
};

/**
 * Persistence for server-side sessions. Callers pass the SHA-256 digest of the cookie token;
 * the raw token never reaches this layer, so it cannot be logged or stored from here.
 */
export class SessionRepository extends Repository {
  constructor(private readonly db: Executor) {
    super();
  }

  create(input: {
    readonly userId: string;
    readonly tokenHash: string;
    readonly now: Date;
    readonly expiresAt: Date;
    readonly absoluteExpiresAt: Date;
    readonly userAgentSummary?: string | null;
  }): Promise<AuthSessionRecord> {
    return this.run(async () => {
      assertUuid(input.userId, 'userId');
      assertTokenHash(input.tokenHash);
      const rows = await this.db
        .insert(authSessions)
        .values({
          userId: input.userId,
          tokenHash: input.tokenHash,
          createdAt: input.now,
          lastSeenAt: input.now,
          expiresAt: input.expiresAt,
          absoluteExpiresAt: input.absoluteExpiresAt,
          userAgentSummary: input.userAgentSummary ?? null,
        })
        .returning();
      return toSession(requireRow(rows, 'Session'));
    });
  }

  /**
   * The row for a token digest whatever its state. The auth service decides validity (expired,
   * revoked, suspended...) so it can log the internal reason while answering generically.
   */
  findByTokenHash(tokenHash: string): Promise<AuthSessionWithUser | null> {
    return this.run(async () => {
      assertTokenHash(tokenHash);
      const rows = await this.db
        .select({
          session: authSessions,
          userId: users.id,
          status: users.status,
          accountType: users.accountType,
        })
        .from(authSessions)
        .innerJoin(users, eq(users.id, authSessions.userId))
        .where(eq(authSessions.tokenHash, tokenHash));
      const row = rows[0];
      if (!row) return null;
      return {
        session: toSession(row.session),
        user: {
          id: row.userId,
          status: row.status,
          accountType: row.accountType,
        },
      };
    });
  }

  /**
   * Slide the idle deadline. Compare-and-set on `last_seen_at` so concurrent requests collapse
   * into one write; returns the session only when this call performed the update.
   */
  touch(input: {
    readonly id: string;
    readonly now: Date;
    readonly expiresAt: Date;
    readonly staleBefore: Date;
  }): Promise<AuthSessionRecord | null> {
    return this.run(async () => {
      assertUuid(input.id, 'sessionId');
      const rows = await this.db
        .update(authSessions)
        .set({ lastSeenAt: input.now, expiresAt: input.expiresAt })
        .where(
          and(
            eq(authSessions.id, input.id),
            isNull(authSessions.revokedAt),
            lt(authSessions.lastSeenAt, input.staleBefore),
          ),
        )
        .returning();
      return rows[0] ? toSession(rows[0]) : null;
    });
  }

  /** Idempotent: revoking an already-revoked session changes nothing and returns false. */
  revoke(id: string, reason: SessionRevokeReason, now: Date): Promise<boolean> {
    return this.run(async () => {
      assertUuid(id, 'sessionId');
      const rows = await this.db
        .update(authSessions)
        .set({ revokedAt: now, revokedReason: reason })
        .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)))
        .returning({ id: authSessions.id });
      return rows.length > 0;
    });
  }

  revokeAllForUser(
    userId: string,
    reason: SessionRevokeReason,
    now: Date,
    options: { readonly exceptSessionId?: string } = {},
  ): Promise<number> {
    return this.run(async () => {
      assertUuid(userId, 'userId');
      const rows = await this.db
        .update(authSessions)
        .set({ revokedAt: now, revokedReason: reason })
        .where(
          and(
            eq(authSessions.userId, userId),
            isNull(authSessions.revokedAt),
            options.exceptSessionId
              ? sql`${authSessions.id} <> ${options.exceptSessionId}`
              : undefined,
          ),
        )
        .returning({ id: authSessions.id });
      return rows.length;
    });
  }

  listActiveForUser(
    userId: string,
    now: Date,
  ): Promise<readonly AuthSessionRecord[]> {
    return this.run(async () => {
      assertUuid(userId, 'userId');
      const rows = await this.db
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.userId, userId),
            isNull(authSessions.revokedAt),
            sql`${authSessions.expiresAt} > ${now.toISOString()}::timestamptz`,
          ),
        )
        .orderBy(sql`${authSessions.lastSeenAt} DESC`);
      return rows.map(toSession);
    });
  }

  /** Delete sessions that expired, or were revoked, before `cutoff`. Returns the number removed. */
  deleteExpired(cutoff: Date): Promise<number> {
    return this.run(async () => {
      const rows = await this.db
        .delete(authSessions)
        .where(
          or(
            lt(authSessions.expiresAt, cutoff),
            and(
              isNotNull(authSessions.revokedAt),
              lt(authSessions.revokedAt, cutoff),
            ),
          ),
        )
        .returning({ id: authSessions.id });
      return rows.length;
    });
  }
}
