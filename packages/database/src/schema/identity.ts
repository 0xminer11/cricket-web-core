import { sql } from 'drizzle-orm';
import { check, index, pgTable, text } from 'drizzle-orm/pg-core';
import { USER_ORIGINS, USER_STATUSES } from '../enums';
import { createdAt, iff, inList, pk, ts, updatedAt } from './helpers';

/** Minimal account anchor. Credentials/sessions belong to Module 3 and reference users.id. */
export const users = pgTable(
  'users',
  {
    id: pk(),
    status: text('status', { enum: USER_STATUSES }).notNull().default('active'),
    /** organic | development | test. Production must never contain development rows. */
    origin: text('origin', { enum: USER_ORIGINS }).notNull().default('organic'),
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
    index('users_status_idx').on(t.status),
  ],
);
