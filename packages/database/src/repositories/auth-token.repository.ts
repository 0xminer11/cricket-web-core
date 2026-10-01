import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { Executor } from '../connection';
import type { AuthTokenPurpose } from '../enums';
import { InvalidInputError } from '../errors';
import type { AuthTokenRecord } from '../records';
import { authTokens } from '../schema/index';
import { assertUuid, Repository, requireRow } from './shared';

const toToken = (row: typeof authTokens.$inferSelect): AuthTokenRecord => ({
  id: row.id,
  userId: row.userId,
  purpose: row.purpose,
  emailNormalized: row.emailNormalized,
  expiresAt: row.expiresAt,
  consumedAt: row.consumedAt,
  createdAt: row.createdAt,
});

const TOKEN_HASH = /^[0-9a-f]{64}$/;

/** Email-verification and password-reset tokens. Only digests are stored or accepted. */
export class AuthTokenRepository extends Repository {
  constructor(private readonly db: Executor) {
    super();
  }

  /**
   * Store a new token and retire every earlier unconsumed token of the same purpose for that
   * user, so only the most recently issued link works.
   */
  issue(input: {
    readonly userId: string;
    readonly purpose: AuthTokenPurpose;
    readonly tokenHash: string;
    readonly emailNormalized?: string;
    readonly now: Date;
    readonly expiresAt: Date;
  }): Promise<AuthTokenRecord> {
    return this.run(async () => {
      assertUuid(input.userId, 'userId');
      if (!TOKEN_HASH.test(input.tokenHash))
        throw new InvalidInputError('tokenHash must be a SHA-256 hex digest');
      return this.db.transaction(async (tx) => {
        await tx
          .update(authTokens)
          .set({ consumedAt: input.now })
          .where(
            and(
              eq(authTokens.userId, input.userId),
              eq(authTokens.purpose, input.purpose),
              isNull(authTokens.consumedAt),
            ),
          );
        const rows = await tx
          .insert(authTokens)
          .values({
            userId: input.userId,
            purpose: input.purpose,
            tokenHash: input.tokenHash,
            emailNormalized: input.emailNormalized ?? null,
            createdAt: input.now,
            expiresAt: input.expiresAt,
          })
          .returning();
        return toToken(requireRow(rows, 'Token'));
      });
    });
  }

  /** Lookup is scoped by purpose: a reset token can never be found as a verification token. */
  findByTokenHash(
    tokenHash: string,
    purpose: AuthTokenPurpose,
  ): Promise<AuthTokenRecord | null> {
    return this.run(async () => {
      if (!TOKEN_HASH.test(tokenHash)) return null;
      const rows = await this.db
        .select()
        .from(authTokens)
        .where(
          and(
            eq(authTokens.tokenHash, tokenHash),
            eq(authTokens.purpose, purpose),
          ),
        );
      return rows[0] ? toToken(rows[0]) : null;
    });
  }

  /**
   * Atomically spend a token. The single UPDATE is the single-use guarantee: of any number of
   * concurrent attempts exactly one gets `true`.
   */
  consume(id: string, now: Date): Promise<boolean> {
    return this.run(async () => {
      assertUuid(id, 'tokenId');
      const rows = await this.db
        .update(authTokens)
        .set({ consumedAt: now })
        .where(
          and(
            eq(authTokens.id, id),
            isNull(authTokens.consumedAt),
            gt(authTokens.expiresAt, now),
          ),
        )
        .returning({ id: authTokens.id });
      return rows.length > 0;
    });
  }

  invalidateAllForUser(
    userId: string,
    purpose: AuthTokenPurpose,
    now: Date,
  ): Promise<number> {
    return this.run(async () => {
      assertUuid(userId, 'userId');
      const rows = await this.db
        .update(authTokens)
        .set({ consumedAt: now })
        .where(
          and(
            eq(authTokens.userId, userId),
            eq(authTokens.purpose, purpose),
            isNull(authTokens.consumedAt),
          ),
        )
        .returning({ id: authTokens.id });
      return rows.length;
    });
  }

  /** Remove tokens that expired, or were consumed, before `cutoff`. */
  deleteExpired(cutoff: Date): Promise<number> {
    return this.run(async () => {
      const rows = await this.db
        .delete(authTokens)
        .where(
          or(
            lt(authTokens.expiresAt, cutoff),
            and(
              isNotNull(authTokens.consumedAt),
              lt(authTokens.consumedAt, cutoff),
            ),
          ),
        )
        .returning({ id: authTokens.id });
      return rows.length;
    });
  }
}
