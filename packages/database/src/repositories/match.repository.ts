import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type {
  ContactQuality,
  DeliveryLength,
  DeliveryLine,
  DismissalType,
  ExtraType,
  PlayerRole,
} from '@the-cricketer/game-core';
import {
  DATA_SCHEMA_VERSION,
  GAME_BALANCE_VERSION,
  MATCH_ENGINE_VERSION,
} from '@the-cricketer/game-core';
import type { Executor } from '../connection';
import { MATCH_TRANSITIONS } from '../enums';
import type {
  MatchMode,
  MatchResultType,
  MatchStatus,
  ParticipantType,
} from '../enums';
import {
  IntegrityError,
  InvalidInputError,
  InvalidStateTransitionError,
  OwnershipViolationError,
  RecordNotFoundError,
} from '../errors';
import {
  clampLimit,
  decodeSequenceCursor,
  encodeSequenceCursor,
  encodeTimeCursor,
  keysetDesc,
  toPage,
} from '../pagination';
import type { Page, PageRequest } from '../pagination';
import type {
  BallRecord,
  InningsRecord,
  MatchHistoryEntry,
  MatchParticipantRecord,
  MatchRecord,
  MatchSummary,
  OverRecord,
} from '../records';
import {
  matchBalls,
  matchInnings,
  matchOvers,
  matchParticipants,
  matches,
} from '../schema/index';
import type { RepositoryContext } from './shared';
import {
  assertSafeInt,
  assertUuid,
  Repository,
  requireRow,
  toNumber,
  toNumberOrNull,
} from './shared';

const toMatch = (row: typeof matches.$inferSelect): MatchRecord => ({
  id: row.id,
  fixtureId: row.fixtureId,
  matchMode: row.matchMode,
  matchFormatId: row.matchFormatId,
  pitchDefinitionId: row.pitchDefinitionId,
  matchEngineVersion: row.matchEngineVersion,
  gameBalanceVersion: row.gameBalanceVersion,
  dataSchemaVersion: row.dataSchemaVersion,
  rngSeed: row.rngSeed,
  rngAlgorithmVersion: row.rngAlgorithmVersion,
  status: row.status,
  homeTeamId: row.homeTeamId,
  awayTeamId: row.awayTeamId,
  winnerTeamId: row.winnerTeamId,
  resultType: row.resultType,
  resultSummary: row.resultSummary,
  createdAt: row.createdAt,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
});
const toParticipant = (
  row: typeof matchParticipants.$inferSelect,
): MatchParticipantRecord => ({
  id: row.id,
  matchId: row.matchId,
  teamId: row.teamId,
  playerId: row.playerId,
  participantType: row.participantType,
  battingPosition: row.battingPosition,
  selectedRole: row.selectedRole,
  displayNameSnapshot: row.displayNameSnapshot,
  overallSnapshot: row.overallSnapshot,
  performanceRating: toNumberOrNull(row.performanceRating),
});
const toInnings = (row: typeof matchInnings.$inferSelect): InningsRecord => ({
  id: row.id,
  matchId: row.matchId,
  inningsNumber: row.inningsNumber,
  battingTeamId: row.battingTeamId,
  bowlingTeamId: row.bowlingTeamId,
  isSuperOver: row.isSuperOver,
  runs: row.runs,
  wickets: row.wickets,
  legalBalls: row.legalBalls,
  extras: row.extras,
  target: row.target,
  status: row.status,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
});
const toOver = (row: typeof matchOvers.$inferSelect): OverRecord => ({
  id: row.id,
  inningsId: row.inningsId,
  overNumber: row.overNumber,
  bowlerParticipantId: row.bowlerParticipantId,
  runs: row.runs,
  wickets: row.wickets,
  legalBalls: row.legalBalls,
  completedAt: row.completedAt,
});
const toBall = (row: typeof matchBalls.$inferSelect): BallRecord => ({
  id: row.id,
  matchId: row.matchId,
  inningsId: row.inningsId,
  overId: row.overId,
  sequenceNumber: row.sequenceNumber,
  overNumber: row.overNumber,
  ballInOver: row.ballInOver,
  strikerParticipantId: row.strikerParticipantId,
  nonStrikerParticipantId: row.nonStrikerParticipantId,
  bowlerParticipantId: row.bowlerParticipantId,
  deliveryDefinitionId: row.deliveryDefinitionId,
  shotDefinitionId: row.shotDefinitionId,
  line: row.line,
  length: row.length,
  runsOffBat: row.runsOffBat,
  extras: row.extras,
  extraType: row.extraType,
  wicket: row.wicket,
  wicketType: row.wicketType,
  dismissedParticipantId: row.dismissedParticipantId,
  legalDelivery: row.legalDelivery,
  contactQuality: row.contactQuality,
  ballSpeed: toNumberOrNull(row.ballSpeed),
});

export interface CreateMatchParticipantInput {
  readonly teamId: string;
  readonly participantType: ParticipantType;
  /** Required for human participants, forbidden for AI (enforced by a CHECK constraint). */
  readonly playerId?: string;
  readonly battingPosition?: number;
  readonly selectedRole?: PlayerRole;
  readonly displayName: string;
  readonly overall?: number;
}
export interface CreateMatchInput {
  readonly fixtureId?: string;
  readonly matchMode: MatchMode;
  readonly matchFormatId: string;
  readonly pitchDefinitionId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly rngSeed?: string;
  readonly rngAlgorithmVersion?: string;
  readonly participants: readonly CreateMatchParticipantInput[];
}
export interface RecordBallInput {
  readonly overId: string;
  /** 1-based, contiguous per innings; the repository rejects gaps and repeats. */
  readonly sequenceNumber: number;
  readonly ballInOver: number;
  readonly strikerParticipantId: string;
  readonly nonStrikerParticipantId: string;
  readonly bowlerParticipantId: string;
  readonly deliveryDefinitionId: string;
  readonly shotDefinitionId?: string;
  readonly line: DeliveryLine;
  readonly length: DeliveryLength;
  readonly runsOffBat: number;
  readonly extras: number;
  readonly extraType?: ExtraType;
  readonly wicketType?: DismissalType;
  readonly dismissedParticipantId?: string;
  /** Derived by the engine; the CHECK constraint verifies it against extraType. */
  readonly legalDelivery: boolean;
  readonly contactQuality?: ContactQuality;
  readonly ballSpeed?: number;
}
export interface AggregateCheck {
  readonly consistent: boolean;
  readonly stored: {
    runs: number;
    wickets: number;
    legalBalls: number;
    extras: number;
  };
  readonly fromBalls: {
    runs: number;
    wickets: number;
    legalBalls: number;
    extras: number;
  };
}

/**
 * Persistence for matches, innings, overs and balls. No cricket rules live here (when an over or
 * innings ends is the engine's call); this layer guarantees ordering, uniqueness, status
 * transitions and that aggregates are updated in the same transaction as the ball that changes them.
 */
export class MatchRepository extends Repository {
  constructor(
    private readonly db: Executor,
    private readonly ctx: RepositoryContext,
  ) {
    super();
  }

  // ---- lifecycle ---------------------------------------------------------------------------

  /** Create the match header (pinning engine/balance/schema versions) and its participants. */
  createMatch(input: CreateMatchInput): Promise<MatchSummary> {
    return this.run(async () => {
      this.ctx.catalog.matchFormat(input.matchFormatId);
      this.ctx.catalog.pitch(input.pitchDefinitionId);
      for (const p of input.participants)
        if (p.teamId !== input.homeTeamId && p.teamId !== input.awayTeamId)
          throw new InvalidInputError(
            'Participant team must be one of the match teams',
          );
      return this.db.transaction(async (tx) => {
        const rows = await tx
          .insert(matches)
          .values({
            ...(input.fixtureId ? { fixtureId: input.fixtureId } : {}),
            matchMode: input.matchMode,
            matchFormatId: input.matchFormatId,
            pitchDefinitionId: input.pitchDefinitionId,
            matchEngineVersion: MATCH_ENGINE_VERSION,
            gameBalanceVersion: GAME_BALANCE_VERSION,
            dataSchemaVersion: DATA_SCHEMA_VERSION,
            ...(input.rngSeed ? { rngSeed: input.rngSeed } : {}),
            ...(input.rngAlgorithmVersion
              ? { rngAlgorithmVersion: input.rngAlgorithmVersion }
              : {}),
            homeTeamId: input.homeTeamId,
            awayTeamId: input.awayTeamId,
          })
          .returning();
        const match = requireRow(rows, 'Match');
        const participants =
          input.participants.length === 0
            ? []
            : await tx
                .insert(matchParticipants)
                .values(
                  input.participants.map((p) => ({
                    matchId: match.id,
                    teamId: p.teamId,
                    participantType: p.participantType,
                    ...(p.playerId ? { playerId: p.playerId } : {}),
                    ...(p.battingPosition !== undefined
                      ? { battingPosition: p.battingPosition }
                      : {}),
                    ...(p.selectedRole ? { selectedRole: p.selectedRole } : {}),
                    displayNameSnapshot: p.displayName,
                    ...(p.overall !== undefined
                      ? { overallSnapshot: p.overall }
                      : {}),
                  })),
                )
                .returning();
        return {
          match: toMatch(match),
          participants: participants.map(toParticipant),
          innings: [],
        };
      });
    });
  }

  markReady(matchId: string): Promise<MatchRecord> {
    return this.transition(matchId, 'ready', {});
  }
  startMatch(matchId: string): Promise<MatchRecord> {
    return this.transition(matchId, 'in_progress', {
      startedAt: this.ctx.clock.now(),
    });
  }
  cancelMatch(matchId: string): Promise<MatchRecord> {
    return this.transition(matchId, 'cancelled', {});
  }
  abandonMatch(matchId: string): Promise<MatchRecord> {
    return this.transition(matchId, 'abandoned', {
      resultType: 'abandoned',
      completedAt: this.ctx.clock.now(),
    });
  }

  /**
   * in_progress -> completed, exactly once. All innings must be completed. The row lock plus the
   * status compare-and-set mean two simultaneous submissions cannot both succeed; callers gate
   * rewards on this call (and reward_grants) inside the same transaction.
   */
  completeMatch(input: {
    readonly matchId: string;
    readonly resultType: Exclude<MatchResultType, 'abandoned'>;
    readonly winnerTeamId?: string;
    readonly resultSummary?: string;
  }): Promise<MatchRecord> {
    return this.run(async () => {
      assertUuid(input.matchId, 'matchId');
      if ((input.resultType === 'win') !== (input.winnerTeamId !== undefined))
        throw new InvalidInputError(
          'A winner is required for (and only for) a win',
        );
      return this.db.transaction(async (tx) => {
        const locked = (
          await tx
            .select()
            .from(matches)
            .where(eq(matches.id, input.matchId))
            .for('update')
        )[0];
        if (!locked) throw new RecordNotFoundError('Match');
        if (locked.status !== 'in_progress')
          throw new InvalidStateTransitionError(
            'Match',
            locked.status,
            'completed',
          );
        const open = await tx
          .select({ id: matchInnings.id })
          .from(matchInnings)
          .where(
            and(
              eq(matchInnings.matchId, input.matchId),
              sql`${matchInnings.status} <> 'completed'`,
            ),
          )
          .limit(1);
        if (open[0])
          throw new InvalidStateTransitionError(
            'Match',
            'has unfinished innings',
            'completed',
          );
        const rows = await tx
          .update(matches)
          .set({
            status: 'completed',
            resultType: input.resultType,
            winnerTeamId: input.winnerTeamId ?? null,
            resultSummary: input.resultSummary ?? null,
            completedAt: this.ctx.clock.now(),
          })
          .where(eq(matches.id, input.matchId))
          .returning();
        return toMatch(requireRow(rows, 'Match'));
      });
    });
  }

  private transition(
    matchId: string,
    to: MatchStatus,
    set: Partial<typeof matches.$inferInsert>,
  ): Promise<MatchRecord> {
    return this.run(async () => {
      assertUuid(matchId, 'matchId');
      const from = (Object.keys(MATCH_TRANSITIONS) as MatchStatus[]).filter(
        (s) => MATCH_TRANSITIONS[s].includes(to),
      );
      const rows = await this.db
        .update(matches)
        .set({ status: to, ...set })
        .where(and(eq(matches.id, matchId), inArray(matches.status, from)))
        .returning();
      if (rows[0]) return toMatch(rows[0]);
      const current = await this.db
        .select({ status: matches.status })
        .from(matches)
        .where(eq(matches.id, matchId));
      if (!current[0]) throw new RecordNotFoundError('Match');
      throw new InvalidStateTransitionError('Match', current[0].status, to);
    });
  }

  // ---- innings / overs ---------------------------------------------------------------------

  createInnings(input: {
    readonly matchId: string;
    readonly inningsNumber: number;
    readonly battingTeamId: string;
    readonly bowlingTeamId: string;
    readonly isSuperOver?: boolean;
    readonly target?: number;
  }): Promise<InningsRecord> {
    return this.run(async () => {
      assertUuid(input.matchId, 'matchId');
      return this.db.transaction(async (tx) => {
        const match = (
          await tx
            .select({ status: matches.status })
            .from(matches)
            .where(eq(matches.id, input.matchId))
            .for('share')
        )[0];
        if (!match) throw new RecordNotFoundError('Match');
        if (match.status !== 'in_progress')
          throw new InvalidStateTransitionError(
            'Match',
            match.status,
            'accepting innings',
          );
        const rows = await tx
          .insert(matchInnings)
          .values({
            matchId: input.matchId,
            inningsNumber: input.inningsNumber,
            battingTeamId: input.battingTeamId,
            bowlingTeamId: input.bowlingTeamId,
            ...(input.isSuperOver ? { isSuperOver: true } : {}),
            ...(input.target !== undefined ? { target: input.target } : {}),
            status: 'in_progress',
            startedAt: this.ctx.clock.now(),
          })
          .returning();
        return toInnings(requireRow(rows, 'Innings'));
      });
    });
  }

  startOver(input: {
    readonly inningsId: string;
    readonly overNumber: number;
    readonly bowlerParticipantId: string;
  }): Promise<OverRecord> {
    return this.run(async () => {
      assertUuid(input.inningsId, 'inningsId');
      const innings = (
        await this.db
          .select()
          .from(matchInnings)
          .where(eq(matchInnings.id, input.inningsId))
      )[0];
      if (!innings) throw new RecordNotFoundError('Innings');
      if (innings.status !== 'in_progress')
        throw new InvalidStateTransitionError(
          'Innings',
          innings.status,
          'accepting overs',
        );
      const rows = await this.db
        .insert(matchOvers)
        .values({
          matchId: innings.matchId,
          inningsId: input.inningsId,
          overNumber: input.overNumber,
          bowlerParticipantId: input.bowlerParticipantId,
        })
        .returning();
      return toOver(requireRow(rows, 'Over'));
    });
  }

  /**
   * Persist one delivery and, in the same transaction, add its runs/extras/wicket/legal-ball to the
   * over and innings aggregates. Locking the innings row (via that UPDATE) serialises writers so
   * sequence numbers stay contiguous. Composite FKs guarantee over/innings/participants all belong
   * to the same match.
   */
  recordBall(input: RecordBallInput): Promise<BallRecord> {
    return this.run(async () => {
      assertUuid(input.overId, 'overId');
      assertSafeInt(input.sequenceNumber, 'sequenceNumber', { min: 1 });
      this.ctx.catalog.delivery(input.deliveryDefinitionId);
      if (input.shotDefinitionId) this.ctx.catalog.shot(input.shotDefinitionId);
      const wicket = input.wicketType !== undefined;
      const total = input.runsOffBat + input.extras;
      return this.db.transaction(async (tx) => {
        const over = (
          await tx
            .select()
            .from(matchOvers)
            .where(eq(matchOvers.id, input.overId))
        )[0];
        if (!over) throw new RecordNotFoundError('Over');
        if (over.completedAt)
          throw new InvalidStateTransitionError(
            'Over',
            'completed',
            'accepting balls',
          );

        const innings = await tx
          .update(matchInnings)
          .set({
            runs: sql`${matchInnings.runs} + ${total}`,
            extras: sql`${matchInnings.extras} + ${input.extras}`,
            wickets: sql`${matchInnings.wickets} + ${wicket ? 1 : 0}`,
            legalBalls: sql`${matchInnings.legalBalls} + ${input.legalDelivery ? 1 : 0}`,
          })
          .where(
            and(
              eq(matchInnings.id, over.inningsId),
              eq(matchInnings.status, 'in_progress'),
            ),
          )
          .returning({ id: matchInnings.id });
        if (!innings[0])
          throw new InvalidStateTransitionError(
            'Innings',
            'not in progress',
            'accepting balls',
          );

        const last = await tx
          .select({
            max: sql<number>`COALESCE(MAX(${matchBalls.sequenceNumber}), 0)`,
          })
          .from(matchBalls)
          .where(eq(matchBalls.inningsId, over.inningsId));
        if (input.sequenceNumber !== Number(last[0]?.max ?? 0) + 1)
          throw new InvalidInputError(
            'Ball sequenceNumber must continue the innings without gaps or repeats',
          );

        await tx
          .update(matchOvers)
          .set({
            runs: sql`${matchOvers.runs} + ${total}`,
            wickets: sql`${matchOvers.wickets} + ${wicket ? 1 : 0}`,
            legalBalls: sql`${matchOvers.legalBalls} + ${input.legalDelivery ? 1 : 0}`,
          })
          .where(eq(matchOvers.id, over.id));

        const rows = await tx
          .insert(matchBalls)
          .values({
            matchId: over.matchId,
            inningsId: over.inningsId,
            overId: over.id,
            sequenceNumber: input.sequenceNumber,
            overNumber: over.overNumber,
            ballInOver: input.ballInOver,
            strikerParticipantId: input.strikerParticipantId,
            nonStrikerParticipantId: input.nonStrikerParticipantId,
            bowlerParticipantId: input.bowlerParticipantId,
            deliveryDefinitionId: input.deliveryDefinitionId,
            ...(input.shotDefinitionId
              ? { shotDefinitionId: input.shotDefinitionId }
              : {}),
            line: input.line,
            length: input.length,
            runsOffBat: input.runsOffBat,
            extras: input.extras,
            ...(input.extraType ? { extraType: input.extraType } : {}),
            wicket,
            ...(input.wicketType ? { wicketType: input.wicketType } : {}),
            ...(input.dismissedParticipantId
              ? { dismissedParticipantId: input.dismissedParticipantId }
              : {}),
            legalDelivery: input.legalDelivery,
            ...(input.contactQuality
              ? { contactQuality: input.contactQuality }
              : {}),
            ...(input.ballSpeed !== undefined
              ? { ballSpeed: input.ballSpeed.toFixed(2) }
              : {}),
          })
          .returning();
        return toBall(requireRow(rows, 'Ball'));
      });
    });
  }

  completeOver(overId: string): Promise<OverRecord> {
    return this.run(async () => {
      assertUuid(overId, 'overId');
      const rows = await this.db
        .update(matchOvers)
        .set({ completedAt: this.ctx.clock.now() })
        .where(
          and(
            eq(matchOvers.id, overId),
            sql`${matchOvers.completedAt} IS NULL`,
          ),
        )
        .returning();
      if (!rows[0])
        throw new InvalidStateTransitionError(
          'Over',
          'missing or completed',
          'completed',
        );
      return toOver(rows[0]);
    });
  }

  /** in_progress -> completed; refuses if the stored aggregates disagree with the ball records. */
  completeInnings(inningsId: string): Promise<InningsRecord> {
    return this.run(async () => {
      assertUuid(inningsId, 'inningsId');
      return this.db.transaction(async (tx) => {
        const locked = (
          await tx
            .select()
            .from(matchInnings)
            .where(eq(matchInnings.id, inningsId))
            .for('update')
        )[0];
        if (!locked) throw new RecordNotFoundError('Innings');
        if (locked.status !== 'in_progress')
          throw new InvalidStateTransitionError(
            'Innings',
            locked.status,
            'completed',
          );
        const check = await new MatchRepository(
          tx,
          this.ctx,
        ).verifyInningsAggregates(inningsId);
        if (!check.consistent)
          throw new IntegrityError(
            'Innings aggregates do not match ball records',
          );
        const rows = await tx
          .update(matchInnings)
          .set({ status: 'completed', completedAt: this.ctx.clock.now() })
          .where(eq(matchInnings.id, inningsId))
          .returning();
        return toInnings(requireRow(rows, 'Innings'));
      });
    });
  }

  /** Recompute totals from match_balls and compare with the stored innings row (read-only). */
  verifyInningsAggregates(inningsId: string): Promise<AggregateCheck> {
    return this.run(async () => {
      assertUuid(inningsId, 'inningsId');
      const innings = (
        await this.db
          .select()
          .from(matchInnings)
          .where(eq(matchInnings.id, inningsId))
      )[0];
      if (!innings) throw new RecordNotFoundError('Innings');
      const agg = (
        await this.db
          .select({
            runs: sql<string>`COALESCE(SUM(${matchBalls.runsOffBat} + ${matchBalls.extras}), 0)`,
            extras: sql<string>`COALESCE(SUM(${matchBalls.extras}), 0)`,
            wickets: sql<string>`COUNT(*) FILTER (WHERE ${matchBalls.wicket})`,
            legalBalls: sql<string>`COUNT(*) FILTER (WHERE ${matchBalls.legalDelivery})`,
          })
          .from(matchBalls)
          .where(eq(matchBalls.inningsId, inningsId))
      )[0];
      const fromBalls = {
        runs: toNumber(agg?.runs ?? 0),
        wickets: toNumber(agg?.wickets ?? 0),
        legalBalls: toNumber(agg?.legalBalls ?? 0),
        extras: toNumber(agg?.extras ?? 0),
      };
      const stored = {
        runs: innings.runs,
        wickets: innings.wickets,
        legalBalls: innings.legalBalls,
        extras: innings.extras,
      };
      return {
        consistent:
          stored.runs === fromBalls.runs &&
          stored.wickets === fromBalls.wickets &&
          stored.legalBalls === fromBalls.legalBalls &&
          stored.extras === fromBalls.extras,
        stored,
        fromBalls,
      };
    });
  }

  /** Write final 0..10 performance ratings (drives the derived recent-form history). */
  setPerformanceRatings(
    matchId: string,
    ratings: readonly { participantId: string; rating: number }[],
  ): Promise<void> {
    return this.run(async () => {
      await this.db.transaction(async (tx) => {
        for (const { participantId, rating } of ratings) {
          const rows = await tx
            .update(matchParticipants)
            .set({ performanceRating: rating.toFixed(1) })
            .where(
              and(
                eq(matchParticipants.id, participantId),
                eq(matchParticipants.matchId, matchId),
              ),
            )
            .returning({ id: matchParticipants.id });
          if (!rows[0]) throw new OwnershipViolationError('Match participant');
        }
      });
    });
  }

  // ---- reads -------------------------------------------------------------------------------

  getMatch(matchId: string): Promise<MatchRecord | null> {
    return this.run(async () => {
      assertUuid(matchId, 'matchId');
      const rows = await this.db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId));
      return rows[0] ? toMatch(rows[0]) : null;
    });
  }

  /** Player-facing fetch: only resolves if `playerId` took part (else OwnershipViolationError). */
  getMatchForPlayer(playerId: string, matchId: string): Promise<MatchSummary> {
    return this.run(async () => {
      assertUuid(matchId, 'matchId');
      const part = await this.db
        .select({ id: matchParticipants.id })
        .from(matchParticipants)
        .where(
          and(
            eq(matchParticipants.matchId, matchId),
            eq(matchParticipants.playerId, playerId),
          ),
        );
      if (!part[0]) throw new OwnershipViolationError('Match');
      return this.getMatchSummary(matchId);
    });
  }

  /** Header + participants + innings totals (three queries; never loads balls). */
  getMatchSummary(matchId: string): Promise<MatchSummary> {
    return this.run(async () => {
      assertUuid(matchId, 'matchId');
      const [header, participants, innings] = await Promise.all([
        this.db.select().from(matches).where(eq(matches.id, matchId)),
        this.db
          .select()
          .from(matchParticipants)
          .where(eq(matchParticipants.matchId, matchId))
          .orderBy(
            matchParticipants.teamId,
            matchParticipants.battingPosition,
            matchParticipants.id,
          ),
        this.db
          .select()
          .from(matchInnings)
          .where(eq(matchInnings.matchId, matchId))
          .orderBy(matchInnings.inningsNumber),
      ]);
      return {
        match: toMatch(requireRow(header, 'Match')),
        participants: participants.map(toParticipant),
        innings: innings.map(toInnings),
      };
    });
  }

  listOvers(inningsId: string): Promise<readonly OverRecord[]> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(matchOvers)
        .where(eq(matchOvers.inningsId, inningsId))
        .orderBy(matchOvers.overNumber);
      return rows.map(toOver);
    });
  }

  /** Balls in delivery order, paged by sequence number (max 500 per page). */
  listBalls(
    inningsId: string,
    page: PageRequest = {},
  ): Promise<Page<BallRecord>> {
    return this.run(async () => {
      assertUuid(inningsId, 'inningsId');
      const limit = clampLimit(page.limit, 500);
      const after = page.cursor ? decodeSequenceCursor(page.cursor) : 0;
      const rows = await this.db
        .select()
        .from(matchBalls)
        .where(
          and(
            eq(matchBalls.inningsId, inningsId),
            gt(matchBalls.sequenceNumber, after),
          ),
        )
        .orderBy(asc(matchBalls.sequenceNumber))
        .limit(limit + 1);
      return toPage(rows.map(toBall), limit, (b) =>
        encodeSequenceCursor(b.sequenceNumber),
      );
    });
  }

  /**
   * Latest matches for a player with opponent, result and score line, without touching balls:
   * one keyset page of participation+match rows, then one query for the innings of those matches.
   */
  listPlayerMatchHistory(
    playerId: string,
    page: PageRequest = {},
  ): Promise<Page<MatchHistoryEntry>> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const limit = clampLimit(page.limit);
      const rows = await this.db
        .select({ p: matchParticipants, m: matches })
        .from(matchParticipants)
        .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
        .where(
          and(
            eq(matchParticipants.playerId, playerId),
            keysetDesc(
              matchParticipants.createdAt,
              matchParticipants.id,
              page.cursor,
            ),
          ),
        )
        .orderBy(desc(matchParticipants.createdAt), desc(matchParticipants.id))
        .limit(limit + 1);
      const shown = rows.slice(0, limit);
      const inningsRows = shown.length
        ? await this.db
            .select({
              matchId: matchInnings.matchId,
              battingTeamId: matchInnings.battingTeamId,
              runs: matchInnings.runs,
              wickets: matchInnings.wickets,
              legalBalls: matchInnings.legalBalls,
            })
            .from(matchInnings)
            .where(
              inArray(
                matchInnings.matchId,
                shown.map((r) => r.m.id),
              ),
            )
            .orderBy(matchInnings.matchId, matchInnings.inningsNumber)
        : [];
      const entries = rows.map(
        ({
          p,
          m,
        }): MatchHistoryEntry & { cursorKey: Date; cursorId: string } => ({
          matchId: m.id,
          participantId: p.id,
          playerTeamId: p.teamId,
          opponentTeamId:
            p.teamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId,
          matchFormatId: m.matchFormatId,
          matchMode: m.matchMode,
          status: m.status,
          resultType: m.resultType,
          won: m.status === 'completed' ? m.winnerTeamId === p.teamId : null,
          performanceRating: toNumberOrNull(p.performanceRating),
          scores: inningsRows
            .filter((i) => i.matchId === m.id)
            .map(({ battingTeamId, runs, wickets, legalBalls }) => ({
              teamId: battingTeamId,
              runs,
              wickets,
              legalBalls,
            })),
          createdAt: p.createdAt,
          completedAt: m.completedAt,
          cursorKey: p.createdAt,
          cursorId: p.id,
        }),
      );
      const paged = toPage(entries, limit, (e) =>
        encodeTimeCursor(e.cursorKey, e.cursorId),
      );
      return {
        items: paged.items.map(
          ({ cursorKey: _k, cursorId: _i, ...entry }) => entry,
        ),
        nextCursor: paged.nextCursor,
      };
    });
  }

  /** Last N performance ratings, newest first (Module 0 PlayerForm.recentPerformanceRatings). */
  getRecentPerformanceRatings(
    playerId: string,
    count = 5,
  ): Promise<readonly number[]> {
    return this.run(async () => {
      assertSafeInt(count, 'count', { min: 1, max: 20 });
      const rows = await this.db
        .select({ rating: matchParticipants.performanceRating })
        .from(matchParticipants)
        .where(
          and(
            eq(matchParticipants.playerId, playerId),
            sql`${matchParticipants.performanceRating} IS NOT NULL`,
          ),
        )
        .orderBy(desc(matchParticipants.createdAt), desc(matchParticipants.id))
        .limit(count);
      return rows.map((r) => toNumber(r.rating ?? 0));
    });
  }
}
