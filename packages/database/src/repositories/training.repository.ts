import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { GAME_BALANCE_VERSION } from '@the-cricketer/game-core';
import type { Executor } from '../connection';
import {
  InvalidStateTransitionError,
  OwnershipViolationError,
} from '../errors';
import {
  clampLimit,
  encodeTimeCursor,
  keysetDesc,
  toPage,
} from '../pagination';
import type { Page, PageRequest } from '../pagination';
import type { TrainingSessionRecord } from '../records';
import { trainingSessions } from '../schema/index';
import type { RepositoryContext } from './shared';
import { assertSafeInt, assertUuid, Repository, requireRow } from './shared';

const toSession = (
  row: typeof trainingSessions.$inferSelect,
): TrainingSessionRecord => ({
  id: row.id,
  playerId: row.playerId,
  trainingDefinitionId: row.trainingDefinitionId,
  status: row.status,
  costCurrency: row.costCurrency,
  costAmount: row.costAmount,
  xpAwarded: row.xpAwarded,
  fatigueAdded: row.fatigueAdded,
  outcome: row.outcome,
  walletTransactionId: row.walletTransactionId,
  gameBalanceVersion: row.gameBalanceVersion,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
});

/** Persistence for the training audit trail. Cost/XP math and the wallet debit belong to the caller. */
export class TrainingRepository extends Repository {
  constructor(
    private readonly db: Executor,
    private readonly ctx: RepositoryContext,
  ) {
    super();
  }

  /**
   * Record a started session; the cost is snapshotted from the static definition. The caller debits
   * the wallet in the same transaction and passes the ledger id. Replays return the original.
   */
  start(input: {
    readonly playerId: string;
    readonly trainingDefinitionId: string;
    readonly walletTransactionId?: string;
    readonly idempotencyKey?: string;
  }): Promise<{ session: TrainingSessionRecord; replayed: boolean }> {
    return this.run(async () => {
      assertUuid(input.playerId, 'playerId');
      const definition = this.ctx.catalog.training(input.trainingDefinitionId);
      const inserted = await this.db
        .insert(trainingSessions)
        .values({
          playerId: input.playerId,
          trainingDefinitionId: input.trainingDefinitionId,
          costCurrency: definition.cost.currency,
          costAmount: definition.cost.amount,
          gameBalanceVersion: GAME_BALANCE_VERSION,
          ...(input.walletTransactionId
            ? { walletTransactionId: input.walletTransactionId }
            : {}),
          ...(input.idempotencyKey
            ? { idempotencyKey: input.idempotencyKey }
            : {}),
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0])
        return { session: toSession(inserted[0]), replayed: false };
      const existing = await this.db
        .select()
        .from(trainingSessions)
        .where(
          and(
            eq(trainingSessions.playerId, input.playerId),
            eq(trainingSessions.idempotencyKey, input.idempotencyKey ?? ''),
          ),
        );
      return {
        session: toSession(requireRow(existing, 'Training session')),
        replayed: true,
      };
    });
  }

  /** started -> completed, exactly once; a second call throws InvalidStateTransitionError. */
  complete(input: {
    readonly playerId: string;
    readonly sessionId: string;
    readonly xpAwarded: number;
    readonly fatigueAdded: number;
    readonly outcome: unknown;
    /** The ledger row of the cost, when the drill cost something. */
    readonly walletTransactionId?: string;
  }): Promise<TrainingSessionRecord> {
    return this.run(async () => {
      assertUuid(input.sessionId, 'sessionId');
      assertSafeInt(input.xpAwarded, 'xpAwarded');
      assertSafeInt(input.fatigueAdded, 'fatigueAdded', { max: 100 });
      return this.transition(input.playerId, input.sessionId, 'completed', {
        xpAwarded: input.xpAwarded,
        fatigueAdded: input.fatigueAdded,
        outcome: input.outcome,
        ...(input.walletTransactionId
          ? { walletTransactionId: input.walletTransactionId }
          : {}),
        completedAt: this.ctx.clock.now(),
      });
    });
  }

  cancel(playerId: string, sessionId: string): Promise<TrainingSessionRecord> {
    return this.run(async () => {
      assertUuid(sessionId, 'sessionId');
      return this.transition(playerId, sessionId, 'cancelled', {});
    });
  }

  private async transition(
    playerId: string,
    sessionId: string,
    to: 'completed' | 'cancelled',
    set: Partial<typeof trainingSessions.$inferInsert>,
  ): Promise<TrainingSessionRecord> {
    const rows = await this.db
      .update(trainingSessions)
      .set({ status: to, ...set })
      .where(
        and(
          eq(trainingSessions.id, sessionId),
          eq(trainingSessions.playerId, playerId),
          eq(trainingSessions.status, 'started'),
        ),
      )
      .returning();
    if (rows[0]) return toSession(rows[0]);
    const existing = await this.db
      .select({ status: trainingSessions.status })
      .from(trainingSessions)
      .where(
        and(
          eq(trainingSessions.id, sessionId),
          eq(trainingSessions.playerId, playerId),
        ),
      );
    if (!existing[0]) throw new OwnershipViolationError('Training session');
    throw new InvalidStateTransitionError(
      'Training session',
      existing[0].status,
      to,
    );
  }

  get(playerId: string, sessionId: string): Promise<TrainingSessionRecord> {
    return this.run(async () => {
      assertUuid(sessionId, 'sessionId');
      const rows = await this.db
        .select()
        .from(trainingSessions)
        .where(
          and(
            eq(trainingSessions.id, sessionId),
            eq(trainingSessions.playerId, playerId),
          ),
        );
      if (!rows[0]) throw new OwnershipViolationError('Training session');
      return toSession(rows[0]);
    });
  }

  /**
   * Counts of completed sessions since a moment (the start of the UTC day), split into drills and
   * rests. One aggregate query: this is the "training load" the engine reads.
   */
  countSince(
    playerId: string,
    since: Date,
    restDefinitionId: string,
  ): Promise<{ readonly drills: number; readonly rests: number }> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const rows = await this.db
        .select({
          drills: sql<number>`count(*) filter (where ${trainingSessions.trainingDefinitionId} <> ${restDefinitionId})::int`,
          rests: sql<number>`count(*) filter (where ${trainingSessions.trainingDefinitionId} = ${restDefinitionId})::int`,
        })
        .from(trainingSessions)
        .where(
          and(
            eq(trainingSessions.playerId, playerId),
            eq(trainingSessions.status, 'completed'),
            gte(trainingSessions.startedAt, since),
          ),
        );
      return { drills: rows[0]?.drills ?? 0, rests: rows[0]?.rests ?? 0 };
    });
  }

  /** Completed sessions, newest first (started_at DESC, id DESC), keyset paginated. */
  listCompleted(
    playerId: string,
    page: PageRequest & { readonly since?: Date } = {},
  ): Promise<Page<TrainingSessionRecord>> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const limit = clampLimit(page.limit);
      const rows = await this.db
        .select()
        .from(trainingSessions)
        .where(
          and(
            eq(trainingSessions.playerId, playerId),
            eq(trainingSessions.status, 'completed'),
            page.since
              ? gte(trainingSessions.startedAt, page.since)
              : undefined,
            keysetDesc(
              trainingSessions.startedAt,
              trainingSessions.id,
              page.cursor,
            ),
          ),
        )
        .orderBy(desc(trainingSessions.startedAt), desc(trainingSessions.id))
        .limit(limit + 1);
      return toPage(rows.map(toSession), limit, (r) =>
        encodeTimeCursor(r.startedAt, r.id),
      );
    });
  }

  list(
    playerId: string,
    page: PageRequest = {},
  ): Promise<Page<TrainingSessionRecord>> {
    return this.run(async () => {
      const limit = clampLimit(page.limit);
      const rows = await this.db
        .select()
        .from(trainingSessions)
        .where(
          and(
            eq(trainingSessions.playerId, playerId),
            keysetDesc(
              trainingSessions.startedAt,
              trainingSessions.id,
              page.cursor,
            ),
          ),
        )
        .orderBy(desc(trainingSessions.startedAt), desc(trainingSessions.id))
        .limit(limit + 1);
      return toPage(rows.map(toSession), limit, (r) =>
        encodeTimeCursor(r.startedAt, r.id),
      );
    });
  }
}
