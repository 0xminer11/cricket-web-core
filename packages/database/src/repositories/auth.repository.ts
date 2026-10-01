import { and, eq, sql } from 'drizzle-orm';
import type { Executor } from '../connection';
import type { UserOrigin } from '../enums';
import {
  InvalidInputError,
  InvalidStateTransitionError,
  RecordNotFoundError,
} from '../errors';
import type {
  AuthCredentialRecord,
  AuthIdentityRecord,
  UserRecord,
} from '../records';
import { authIdentities, users } from '../schema/index';
import type { RepositoryContext } from './shared';
import { assertUuid, Repository, requireRow } from './shared';
import { toUser } from './user.repository';

const toIdentity = (
  row: typeof authIdentities.$inferSelect,
): AuthIdentityRecord => ({
  id: row.id,
  userId: row.userId,
  provider: row.provider,
  providerSubject: row.providerSubject,
  email: row.email,
  emailNormalized: row.emailNormalized,
  emailVerifiedAt: row.emailVerifiedAt,
  passwordChangedAt: row.passwordChangedAt,
  createdAt: row.createdAt,
});
const toCredential = (
  row: typeof authIdentities.$inferSelect,
): AuthCredentialRecord => ({
  ...toIdentity(row),
  passwordHash: row.passwordHash,
});

export interface EmailCredentialInput {
  /** Address as entered, trimmed. */
  readonly email: string;
  /** Comparison form; the unique key for the email_password provider. */
  readonly emailNormalized: string;
  /** PHC-encoded Argon2id hash. Plaintext never reaches this layer. */
  readonly passwordHash: string;
}

/**
 * Account lifecycle and login-method persistence. Guest -> registered keeps `users.id`, so every
 * foreign key (player, career, wallet, inventory...) is untouched by an upgrade.
 */
export class AuthRepository extends Repository {
  constructor(
    private readonly db: Executor,
    private readonly ctx: RepositoryContext,
  ) {
    super();
  }

  createGuestUser(origin: UserOrigin = 'organic'): Promise<UserRecord> {
    return this.run(async () => {
      const rows = await this.db
        .insert(users)
        .values({ origin, accountType: 'guest' })
        .returning();
      return toUser(requireRow(rows, 'User'));
    });
  }

  /** Create a registered user and its email identity atomically. */
  createRegisteredUser(
    input: EmailCredentialInput & { readonly origin?: UserOrigin },
  ): Promise<{ user: UserRecord; identity: AuthIdentityRecord }> {
    return this.run(() =>
      this.db.transaction(async (tx) => {
        const now = this.ctx.clock.now();
        const [user] = await tx
          .insert(users)
          .values({
            origin: input.origin ?? 'organic',
            accountType: 'registered',
            registeredAt: now,
          })
          .returning();
        const created = requireRow([user], 'User');
        const identity = await this.insertEmailIdentity(tx, created.id, input);
        return { user: toUser(created), identity };
      }),
    );
  }

  /**
   * Turn an existing guest into a registered account in place (same id). Locks the user row, so
   * two concurrent upgrades serialise: the second sees `registered` and fails. A duplicate email
   * is rejected by the unique index (UniqueViolationError), which rolls the whole upgrade back.
   */
  upgradeGuest(
    userId: string,
    input: EmailCredentialInput,
  ): Promise<{ user: UserRecord; identity: AuthIdentityRecord }> {
    return this.run(async () => {
      assertUuid(userId, 'userId');
      return this.db.transaction(async (tx) => {
        const current = (
          await tx
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .for('update')
        )[0];
        if (!current) throw new RecordNotFoundError('User');
        if (current.status !== 'active')
          throw new InvalidStateTransitionError(
            'User',
            current.status,
            'registered',
          );
        if (current.accountType !== 'guest')
          throw new InvalidStateTransitionError(
            'User',
            current.accountType,
            'registered',
          );
        const identity = await this.insertEmailIdentity(tx, userId, input);
        const rows = await tx
          .update(users)
          .set({
            accountType: 'registered',
            registeredAt: this.ctx.clock.now(),
          })
          .where(eq(users.id, userId))
          .returning();
        return { user: toUser(requireRow(rows, 'User')), identity };
      });
    });
  }

  private async insertEmailIdentity(
    tx: Executor,
    userId: string,
    input: EmailCredentialInput,
  ): Promise<AuthIdentityRecord> {
    if (!input.passwordHash.startsWith('$argon2'))
      throw new InvalidInputError('passwordHash must be a PHC argon2 string');
    const rows = await tx
      .insert(authIdentities)
      .values({
        userId,
        provider: 'email_password',
        providerSubject: input.emailNormalized,
        email: input.email,
        emailNormalized: input.emailNormalized,
        passwordHash: input.passwordHash,
        passwordChangedAt: this.ctx.clock.now(),
      })
      .returning();
    return toIdentity(requireRow(rows, 'Identity'));
  }

  findCredentialByEmail(
    emailNormalized: string,
  ): Promise<AuthCredentialRecord | null> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.provider, 'email_password'),
            eq(authIdentities.providerSubject, emailNormalized),
          ),
        );
      return rows[0] ? toCredential(rows[0]) : null;
    });
  }

  findCredentialByUserId(userId: string): Promise<AuthCredentialRecord | null> {
    return this.run(async () => {
      assertUuid(userId, 'userId');
      const rows = await this.db
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.userId, userId),
            eq(authIdentities.provider, 'email_password'),
          ),
        );
      return rows[0] ? toCredential(rows[0]) : null;
    });
  }

  findEmailIdentityByUserId(
    userId: string,
  ): Promise<AuthIdentityRecord | null> {
    return this.run(async () => {
      assertUuid(userId, 'userId');
      const rows = await this.db
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.userId, userId),
            eq(authIdentities.provider, 'email_password'),
          ),
        );
      return rows[0] ? toIdentity(rows[0]) : null;
    });
  }

  setPasswordHash(userId: string, passwordHash: string): Promise<boolean> {
    return this.run(async () => {
      assertUuid(userId, 'userId');
      if (!passwordHash.startsWith('$argon2'))
        throw new InvalidInputError('passwordHash must be a PHC argon2 string');
      const rows = await this.db
        .update(authIdentities)
        .set({ passwordHash, passwordChangedAt: this.ctx.clock.now() })
        .where(
          and(
            eq(authIdentities.userId, userId),
            eq(authIdentities.provider, 'email_password'),
          ),
        )
        .returning({ id: authIdentities.id });
      return rows.length > 0;
    });
  }

  /** Replace a hash with a stronger-parameter one for the same password (no password-change stamp). */
  rehashPassword(userId: string, passwordHash: string): Promise<boolean> {
    return this.run(async () => {
      assertUuid(userId, 'userId');
      if (!passwordHash.startsWith('$argon2'))
        throw new InvalidInputError('passwordHash must be a PHC argon2 string');
      const rows = await this.db
        .update(authIdentities)
        .set({ passwordHash })
        .where(
          and(
            eq(authIdentities.userId, userId),
            eq(authIdentities.provider, 'email_password'),
          ),
        )
        .returning({ id: authIdentities.id });
      return rows.length > 0;
    });
  }

  /** Idempotent: an already-verified address keeps its original timestamp. */
  markEmailVerified(
    userId: string,
    emailNormalized: string,
  ): Promise<AuthIdentityRecord | null> {
    return this.run(async () => {
      assertUuid(userId, 'userId');
      const rows = await this.db
        .update(authIdentities)
        .set({
          emailVerifiedAt: sql`COALESCE(${authIdentities.emailVerifiedAt}, ${this.ctx.clock.now().toISOString()}::timestamptz)`,
        })
        .where(
          and(
            eq(authIdentities.userId, userId),
            eq(authIdentities.provider, 'email_password'),
            eq(authIdentities.emailNormalized, emailNormalized),
          ),
        )
        .returning();
      return rows[0] ? toIdentity(rows[0]) : null;
    });
  }
}
