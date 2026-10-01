import { sql } from 'drizzle-orm';
import { check, index, pgTable, text } from 'drizzle-orm/pg-core';
import { ACCOUNT_TYPES, USER_ORIGINS, USER_STATUSES } from '../enums';
import { createdAt, iff, inList, pk, ts, updatedAt } from './helpers';

/**
 * Account anchor. Credentials, sessions and tokens live in schema/auth.ts and reference users.id,
 * so the same id (and every game foreign key) survives a guest becoming a registered account.
 */
export const users = pgTable(
  'users',
  {
    id: pk(),
    status: text('status', { enum: USER_STATUSES }).notNull().default('active'),
    /** organic | development | test. Production must never contain development rows. */
    origin: text('origin', { enum: USER_ORIGINS }).notNull().default('organic'),
    /** guest -> registered is the only transition; the id never changes. */
    accountType: text('account_type', { enum: ACCOUNT_TYPES })
      .notNull()
      .default('guest'),
    /** Set when the account first gains a login method (equals created_at for direct sign-ups). */
    registeredAt: ts('registered_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastSeenAt: ts('last_seen_at'),
    /** Soft delete marker; hard deletion is a separate, audited account-deletion workflow. */
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    check('users_status_check', inList(t.status, USER_STATUSES)),
    check('users_origin_check', inList(t.origin, USER_ORIGINS)),
    check(
      'users_deleted_at_check',
      iff(sql`${t.status} = 'deleted'`, sql`${t.deletedAt} IS NOT NULL`),
    ),
    check('users_account_type_check', inList(t.accountType, ACCOUNT_TYPES)),
    check(
      'users_registered_at_check',
      iff(
        sql`${t.accountType} = 'registered'`,
        sql`${t.registeredAt} IS NOT NULL`,
      ),
    ),
    index('users_status_idx').on(t.status),
  ],
);
