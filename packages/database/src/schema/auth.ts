import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  AUTH_PROVIDERS,
  AUTH_TOKEN_PURPOSES,
  SESSION_REVOKE_REASONS,
} from '../enums';
import { createdAt, inList, pk, ts, updatedAt } from './helpers';
import { users } from './identity';

/**
 * Login methods for an account. One user can hold several (email today, Google/Apple later)
 * without duplicating the in-game player. Credentials live here, not on `users`.
 * `provider_subject` is the provider's stable id: the normalized email for email_password,
 * the OIDC `sub` for external providers.
 */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: AUTH_PROVIDERS }).notNull(),
    providerSubject: text('provider_subject').notNull(),
    /** Address as entered (trimmed); display only. */
    email: text('email'),
    /** Comparison form (see normalizeEmail in the API). Unique per provider via provider_subject. */
    emailNormalized: text('email_normalized'),
    emailVerifiedAt: ts('email_verified_at'),
    /** PHC-format Argon2id string. Only email_password identities have one. */
    passwordHash: text('password_hash'),
    passwordChangedAt: ts('password_changed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('auth_identities_provider_subject_uniq').on(
      t.provider,
      t.providerSubject,
    ),
    uniqueIndex('auth_identities_user_provider_uniq').on(t.userId, t.provider),
    index('auth_identities_email_normalized_idx').on(t.emailNormalized),
    check('auth_identities_provider_check', inList(t.provider, AUTH_PROVIDERS)),
    check(
      'auth_identities_email_password_check',
      sql`${t.provider} <> 'email_password' OR (${t.emailNormalized} IS NOT NULL AND ${t.email} IS NOT NULL AND ${t.passwordHash} IS NOT NULL AND ${t.providerSubject} = ${t.emailNormalized})`,
    ),
    check(
      'auth_identities_password_provider_check',
      sql`${t.provider} = 'email_password' OR ${t.passwordHash} IS NULL`,
    ),
  ],
);

/**
 * Server-side sessions. Only the SHA-256 of the opaque cookie token is stored. `expires_at` is
 * the current (sliding) deadline; `absolute_expires_at` is the hard cap it can never exceed.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: createdAt(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    absoluteExpiresAt: ts('absolute_expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    revokedReason: text('revoked_reason', { enum: SESSION_REVOKE_REASONS }),
    /** Coarse "Chrome on macOS" label for a future devices list. No IP is stored. */
    userAgentSummary: text('user_agent_summary'),
  },
  (t) => [
    uniqueIndex('auth_sessions_token_hash_uniq').on(t.tokenHash),
    index('auth_sessions_user_revoked_idx').on(t.userId, t.revokedAt),
    index('auth_sessions_expires_idx').on(t.expiresAt),
    check(
      'auth_sessions_token_hash_check',
      sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'auth_sessions_expiry_check',
      sql`${t.expiresAt} <= ${t.absoluteExpiresAt}`,
    ),
    check(
      'auth_sessions_revoked_check',
      sql`(${t.revokedAt} IS NULL) = (${t.revokedReason} IS NULL)`,
    ),
    check(
      'auth_sessions_revoked_reason_check',
      sql`${t.revokedReason} IS NULL OR ${inList(t.revokedReason, SESSION_REVOKE_REASONS)}`,
    ),
  ],
);

/** Single-use, time-limited email verification and password reset tokens (hash only). */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: AUTH_TOKEN_PURPOSES }).notNull(),
    tokenHash: text('token_hash').notNull(),
    /** Address the token was issued for (verification); a later email change cannot reuse it. */
    emailNormalized: text('email_normalized'),
    expiresAt: ts('expires_at').notNull(),
    consumedAt: ts('consumed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('auth_tokens_token_hash_uniq').on(t.tokenHash),
    index('auth_tokens_user_purpose_idx').on(t.userId, t.purpose, t.consumedAt),
    index('auth_tokens_expires_idx').on(t.expiresAt),
    check('auth_tokens_purpose_check', inList(t.purpose, AUTH_TOKEN_PURPOSES)),
    check(
      'auth_tokens_token_hash_check',
      sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);
