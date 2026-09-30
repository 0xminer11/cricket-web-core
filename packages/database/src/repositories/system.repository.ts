import { and, desc, eq } from 'drizzle-orm';
import {
  DATA_SCHEMA_VERSION,
  GAME_BALANCE_VERSION,
  MATCH_ENGINE_VERSION,
} from '@the-cricketer/game-core';
import type { Executor } from '../connection';
import type { AuditActorType } from '../enums';
import { InvalidInputError } from '../errors';
import {
  clampLimit,
  encodeTimeCursor,
  keysetDesc,
  toPage,
} from '../pagination';
import type { Page, PageRequest } from '../pagination';
import type { AuditLogRecord, GameVersionRecord } from '../records';
import { auditLogs, gameVersions } from '../schema/index';
import { Repository, requireRow } from './shared';

const toAudit = (row: typeof auditLogs.$inferSelect): AuditLogRecord => ({
  id: row.id,
  actorType: row.actorType,
  actorId: row.actorId,
  action: row.action,
  targetType: row.targetType,
  targetId: row.targetId,
  requestId: row.requestId,
  metadata: row.metadata,
  createdAt: row.createdAt,
});
const toVersion = (
  row: typeof gameVersions.$inferSelect,
): GameVersionRecord => ({
  id: row.id,
  gameBalanceVersion: row.gameBalanceVersion,
  matchEngineVersion: row.matchEngineVersion,
  dataSchemaVersion: row.dataSchemaVersion,
  activatedAt: row.activatedAt,
  notes: row.notes,
});

/** Sensitive-operation trail (append-only). Not for ordinary gameplay events. */
export class AuditRepository extends Repository {
  constructor(private readonly db: Executor) {
    super();
  }

  record(input: {
    readonly actorType: AuditActorType;
    readonly actorId?: string;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly requestId?: string;
    readonly metadata?: Record<string, unknown>;
  }): Promise<AuditLogRecord> {
    return this.run(async () => {
      if (input.actorType === 'admin' && !input.actorId)
        throw new InvalidInputError('Admin audit entries need an actorId');
      const rows = await this.db
        .insert(auditLogs)
        .values({
          actorType: input.actorType,
          ...(input.actorId ? { actorId: input.actorId } : {}),
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          ...(input.requestId ? { requestId: input.requestId } : {}),
          metadata: input.metadata ?? {},
        })
        .returning();
      return toAudit(requireRow(rows, 'Audit log'));
    });
  }

  listForTarget(
    targetType: string,
    targetId: string,
    page: PageRequest = {},
  ): Promise<Page<AuditLogRecord>> {
    return this.run(async () => {
      const limit = clampLimit(page.limit);
      const rows = await this.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.targetType, targetType),
            eq(auditLogs.targetId, targetId),
            keysetDesc(auditLogs.createdAt, auditLogs.id, page.cursor),
          ),
        )
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(limit + 1);
      return toPage(rows.map(toAudit), limit, (r) =>
        encodeTimeCursor(r.createdAt, r.id),
      );
    });
  }
}

export class GameVersionRepository extends Repository {
  constructor(private readonly db: Executor) {
    super();
  }

  /**
   * Register the version triple compiled into this build (idempotent). Code constants remain
   * authoritative; the table is operational visibility ("what has ever been live").
   */
  ensureCurrent(notes?: string): Promise<GameVersionRecord> {
    return this.run(async () => {
      await this.db
        .insert(gameVersions)
        .values({
          gameBalanceVersion: GAME_BALANCE_VERSION,
          matchEngineVersion: MATCH_ENGINE_VERSION,
          dataSchemaVersion: DATA_SCHEMA_VERSION,
          ...(notes ? { notes } : {}),
        })
        .onConflictDoNothing();
      const rows = await this.db
        .select()
        .from(gameVersions)
        .where(
          and(
            eq(gameVersions.gameBalanceVersion, GAME_BALANCE_VERSION),
            eq(gameVersions.matchEngineVersion, MATCH_ENGINE_VERSION),
            eq(gameVersions.dataSchemaVersion, DATA_SCHEMA_VERSION),
          ),
        );
      return toVersion(requireRow(rows, 'Game version'));
    });
  }

  getLatest(): Promise<GameVersionRecord | null> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(gameVersions)
        .orderBy(desc(gameVersions.activatedAt), desc(gameVersions.id))
        .limit(1);
      return rows[0] ? toVersion(rows[0]) : null;
    });
  }
}
