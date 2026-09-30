import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { AUDIT_ACTOR_TYPES } from '../enums';
import { createdAt, inList, pk, positive, ts } from './helpers';

/** Operational record of which versions were activated when. Code constants stay authoritative. */
export const gameVersions = pgTable(
  'game_versions',
  {
    id: pk(),
    gameBalanceVersion: text('game_balance_version').notNull(),
    matchEngineVersion: text('match_engine_version').notNull(),
    dataSchemaVersion: integer('data_schema_version').notNull(),
    activatedAt: ts('activated_at').notNull().defaultNow(),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('game_versions_combo_uniq').on(
      t.gameBalanceVersion,
      t.matchEngineVersion,
      t.dataSchemaVersion,
    ),
    index('game_versions_activated_idx').on(t.activatedAt.desc()),
    check('game_versions_schema_version_check', positive(t.dataSchemaVersion)),
  ],
);

/** Sensitive backend/admin operations only (not gameplay). Append-only via trigger. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    actorType: text('actor_type', { enum: AUDIT_ACTOR_TYPES }).notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    requestId: text('request_id'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_target_idx').on(
      t.targetType,
      t.targetId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('audit_logs_created_idx').on(t.createdAt.desc(), t.id.desc()),
    check(
      'audit_logs_actor_type_check',
      inList(t.actorType, AUDIT_ACTOR_TYPES),
    ),
    check(
      'audit_logs_admin_actor_check',
      sql`${t.actorType} <> 'admin' OR ${t.actorId} IS NOT NULL`,
    ),
    check(
      'audit_logs_action_check',
      sql`char_length(${t.action}) BETWEEN 1 AND 80`,
    ),
  ],
);
