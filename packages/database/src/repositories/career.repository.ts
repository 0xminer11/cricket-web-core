import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  CareerTierId,
  CurrencyCode,
  PlayerRole,
} from '@the-cricketer/game-core';
import { GAME_BALANCE_VERSION } from '@the-cricketer/game-core';
import type { Executor } from '../connection';
import { CONTRACT_TRANSITIONS, SPONSORSHIP_TRANSITIONS } from '../enums';
import type {
  CareerEventStatus,
  CareerHistoryEventType,
  ContractStatus,
  SponsorshipStatus,
} from '../enums';
import {
  InvalidInputError,
  InvalidStateTransitionError,
  OwnershipViolationError,
  RecordNotFoundError,
  StaleWriteError,
} from '../errors';
import { LIMITS } from '../limits';
import {
  clampLimit,
  encodeTimeCursor,
  keysetDesc,
  toPage,
} from '../pagination';
import type { Page, PageRequest } from '../pagination';
import type {
  CareerEventInstanceRecord,
  CareerHistoryRecord,
  CareerRecord,
  ContractRecord,
  SponsorshipRecord,
} from '../records';
import {
  careerEventInstances,
  careerHistory,
  careers,
  contracts,
  sponsorships,
} from '../schema/index';
import { toCareer } from './mappers';
import type { RepositoryContext } from './shared';
import {
  assertSafeInt,
  assertUuid,
  Repository,
  requireRow,
  toNumber,
} from './shared';

const toHistory = (
  row: typeof careerHistory.$inferSelect,
): CareerHistoryRecord => ({
  id: row.id,
  careerId: row.careerId,
  eventType: row.eventType,
  referenceId: row.referenceId,
  metadata: row.metadata,
  occurredAt: row.occurredAt,
  createdAt: row.createdAt,
});
const toEventInstance = (
  row: typeof careerEventInstances.$inferSelect,
): CareerEventInstanceRecord => ({
  id: row.id,
  careerId: row.careerId,
  eventDefinitionId: row.eventDefinitionId,
  status: row.status,
  selectedChoiceId: row.selectedChoiceId,
  careerMatchesAtTrigger: row.careerMatchesAtTrigger,
  triggeredAt: row.triggeredAt,
  resolvedAt: row.resolvedAt,
  effectsSnapshot: row.effectsSnapshot,
  gameBalanceVersion: row.gameBalanceVersion,
});
const toContract = (row: typeof contracts.$inferSelect): ContractRecord => ({
  id: row.id,
  careerId: row.careerId,
  teamId: row.teamId,
  contractDefinitionId: row.contractDefinitionId,
  status: row.status,
  expectedRole: row.expectedRole,
  salaryCoins: row.salaryCoins,
  matchFeeCoins: row.matchFeeCoins,
  performanceBonusCoins: row.performanceBonusCoins,
  minimumPerformanceRating: toNumber(row.minimumPerformanceRating),
  durationMatches: row.durationMatches,
  matchesPlayed: row.matchesPlayed,
  termsSnapshot: row.termsSnapshot,
  gameBalanceVersion: row.gameBalanceVersion,
  offeredAt: row.offeredAt,
  signedAt: row.signedAt,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  terminatedAt: row.terminatedAt,
});
const toSponsorship = (
  row: typeof sponsorships.$inferSelect,
): SponsorshipRecord => ({
  id: row.id,
  careerId: row.careerId,
  sponsorDefinitionId: row.sponsorDefinitionId,
  status: row.status,
  payoutCurrency: row.payoutCurrency,
  payoutAmount: row.payoutAmount,
  rewardConfigSnapshot: row.rewardConfigSnapshot,
  objectiveProgress: row.objectiveProgress,
  gameBalanceVersion: row.gameBalanceVersion,
  offeredAt: row.offeredAt,
  acceptedAt: row.acceptedAt,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
});

/**
 * Career-scoped operations. Services resolve careerId from the authenticated player (via
 * getActiveCareer(playerId)); contract/sponsorship/event methods additionally require the careerId
 * so a foreign contract id supplied by a client can never match.
 */
export class CareerRepository extends Repository {
  constructor(
    private readonly db: Executor,
    private readonly ctx: RepositoryContext,
  ) {
    super();
  }

  // ---- careers -----------------------------------------------------------------------------

  /** Start a career and record `career_started` history atomically. One active career per player. */
  create(input: {
    readonly playerId: string;
    readonly tier: CareerTierId;
    readonly teamId?: string;
    readonly seasonNumber?: number;
  }): Promise<CareerRecord> {
    return this.run(async () => {
      assertUuid(input.playerId, 'playerId');
      return this.db.transaction(async (tx) => {
        const rows = await tx
          .insert(careers)
          .values({
            playerId: input.playerId,
            currentTier: input.tier,
            ...(input.teamId ? { currentTeamId: input.teamId } : {}),
            ...(input.seasonNumber ? { seasonNumber: input.seasonNumber } : {}),
          })
          .returning();
        const career = requireRow(rows, 'Career');
        await tx.insert(careerHistory).values({
          careerId: career.id,
          eventType: 'career_started',
          referenceId: input.tier,
          metadata: {},
        });
        return toCareer(career);
      });
    });
  }

  getActiveCareer(playerId: string): Promise<CareerRecord | null> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const rows = await this.db
        .select()
        .from(careers)
        .where(
          and(
            eq(careers.playerId, playerId),
            eq(careers.careerStatus, 'active'),
          ),
        );
      return rows[0] ? toCareer(rows[0]) : null;
    });
  }

  /** Ownership-aware fetch. */
  getCareer(playerId: string, careerId: string): Promise<CareerRecord> {
    return this.run(async () => {
      assertUuid(careerId, 'careerId');
      const rows = await this.db
        .select()
        .from(careers)
        .where(and(eq(careers.id, careerId), eq(careers.playerId, playerId)));
      if (!rows[0]) throw new OwnershipViolationError('Career');
      return toCareer(rows[0]);
    });
  }

  /**
   * Add signed deltas to fans/reputation/selector interest in one atomic UPDATE, clamped to the
   * schema ranges in SQL (no read-modify-write).
   */
  applyProgressDelta(
    careerId: string,
    delta: {
      readonly fans?: number;
      readonly reputation?: number;
      readonly selectorInterest?: number;
    },
  ): Promise<CareerRecord> {
    return this.run(async () => {
      const fans = delta.fans ?? 0;
      const reputation = delta.reputation ?? 0;
      const selector = delta.selectorInterest ?? 0;
      for (const [k, v] of Object.entries({ fans, reputation, selector }))
        assertSafeInt(v, k, { min: -1_000_000_000, max: 1_000_000_000 });
      const rows = await this.db
        .update(careers)
        .set({
          fans: sql`GREATEST(0, ${careers.fans} + ${fans})`,
          reputation: sql`LEAST(${LIMITS.reputationMax}, GREATEST(0, ${careers.reputation} + ${reputation}))`,
          selectorInterest: sql`LEAST(${LIMITS.selectorInterestMax}, GREATEST(0, ${careers.selectorInterest} + ${selector}))`,
          rowVersion: sql`${careers.rowVersion} + 1`,
        })
        .where(eq(careers.id, careerId))
        .returning();
      return toCareer(requireRow(rows, 'Career'));
    });
  }

  /** Persist a tier change decided by game logic; compare-and-set on the previous tier. */
  changeTier(input: {
    readonly careerId: string;
    readonly from: CareerTierId;
    readonly to: CareerTierId;
    readonly direction: 'promoted' | 'demoted';
  }): Promise<CareerRecord> {
    return this.run(async () =>
      this.db.transaction(async (tx) => {
        const rows = await tx
          .update(careers)
          .set({
            currentTier: input.to,
            rowVersion: sql`${careers.rowVersion} + 1`,
          })
          .where(
            and(
              eq(careers.id, input.careerId),
              eq(careers.currentTier, input.from),
              eq(careers.careerStatus, 'active'),
            ),
          )
          .returning();
        if (!rows[0]) throw new StaleWriteError('Career');
        await tx.insert(careerHistory).values({
          careerId: input.careerId,
          eventType:
            input.direction === 'promoted' ? 'tier_promoted' : 'tier_demoted',
          referenceId: input.to,
          metadata: { from: input.from, to: input.to },
        });
        return toCareer(rows[0]);
      }),
    );
  }

  setCurrentTeam(
    careerId: string,
    teamId: string | null,
  ): Promise<CareerRecord> {
    return this.run(async () => {
      const rows = await this.db
        .update(careers)
        .set({
          currentTeamId: teamId,
          rowVersion: sql`${careers.rowVersion} + 1`,
        })
        .where(eq(careers.id, careerId))
        .returning();
      return toCareer(requireRow(rows, 'Career'));
    });
  }

  advanceSeason(
    careerId: string,
    expectedSeason: number,
  ): Promise<CareerRecord> {
    return this.run(async () =>
      this.db.transaction(async (tx) => {
        const rows = await tx
          .update(careers)
          .set({
            seasonNumber: expectedSeason + 1,
            rowVersion: sql`${careers.rowVersion} + 1`,
          })
          .where(
            and(
              eq(careers.id, careerId),
              eq(careers.seasonNumber, expectedSeason),
              eq(careers.careerStatus, 'active'),
            ),
          )
          .returning();
        if (!rows[0]) throw new StaleWriteError('Career');
        await tx.insert(careerHistory).values({
          careerId,
          eventType: 'season_started',
          referenceId: String(expectedSeason + 1),
          metadata: {},
        });
        return toCareer(rows[0]);
      }),
    );
  }

  retire(careerId: string): Promise<CareerRecord> {
    return this.run(async () =>
      this.db.transaction(async (tx) => {
        const rows = await tx
          .update(careers)
          .set({
            careerStatus: 'retired',
            retiredAt: this.ctx.clock.now(),
            rowVersion: sql`${careers.rowVersion} + 1`,
          })
          .where(
            and(eq(careers.id, careerId), eq(careers.careerStatus, 'active')),
          )
          .returning();
        if (!rows[0])
          throw new InvalidStateTransitionError(
            'Career',
            'not active',
            'retired',
          );
        await tx
          .insert(careerHistory)
          .values({ careerId, eventType: 'retired', metadata: {} });
        return toCareer(rows[0]);
      }),
    );
  }

  // ---- history (append-only) ---------------------------------------------------------------

  appendHistory(input: {
    readonly careerId: string;
    readonly eventType: CareerHistoryEventType;
    readonly referenceId?: string;
    readonly metadata?: Record<string, unknown>;
    readonly occurredAt?: Date;
  }): Promise<CareerHistoryRecord> {
    return this.run(async () => {
      const rows = await this.db
        .insert(careerHistory)
        .values({
          careerId: input.careerId,
          eventType: input.eventType,
          ...(input.referenceId ? { referenceId: input.referenceId } : {}),
          metadata: input.metadata ?? {},
          ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        })
        .returning();
      return toHistory(requireRow(rows, 'Career history'));
    });
  }

  /** Newest first (occurred_at, id). */
  listHistory(
    careerId: string,
    page: PageRequest = {},
  ): Promise<Page<CareerHistoryRecord>> {
    return this.run(async () => {
      const limit = clampLimit(page.limit);
      const rows = await this.db
        .select()
        .from(careerHistory)
        .where(
          and(
            eq(careerHistory.careerId, careerId),
            keysetDesc(careerHistory.occurredAt, careerHistory.id, page.cursor),
          ),
        )
        .orderBy(desc(careerHistory.occurredAt), desc(careerHistory.id))
        .limit(limit + 1);
      return toPage(rows.map(toHistory), limit, (r) =>
        encodeTimeCursor(r.occurredAt, r.id),
      );
    });
  }

  // ---- career event occurrences ------------------------------------------------------------

  createEventInstance(input: {
    readonly careerId: string;
    readonly eventDefinitionId: string;
    readonly careerMatchesAtTrigger: number;
  }): Promise<CareerEventInstanceRecord> {
    return this.run(async () => {
      this.ctx.catalog.careerEvent(input.eventDefinitionId);
      const rows = await this.db
        .insert(careerEventInstances)
        .values({
          careerId: input.careerId,
          eventDefinitionId: input.eventDefinitionId,
          careerMatchesAtTrigger: input.careerMatchesAtTrigger,
          gameBalanceVersion: GAME_BALANCE_VERSION,
        })
        .returning();
      return toEventInstance(requireRow(rows, 'Career event'));
    });
  }

  /** Resolve a pending event once: validates the choice against the static definition. */
  resolveEventInstance(input: {
    readonly careerId: string;
    readonly instanceId: string;
    readonly choiceId: string;
    readonly effectsSnapshot: unknown;
  }): Promise<CareerEventInstanceRecord> {
    return this.run(async () => {
      assertUuid(input.instanceId, 'instanceId');
      return this.db.transaction(async (tx) => {
        const current = (
          await tx
            .select()
            .from(careerEventInstances)
            .where(
              and(
                eq(careerEventInstances.id, input.instanceId),
                eq(careerEventInstances.careerId, input.careerId),
              ),
            )
            .for('update')
        )[0];
        if (!current) throw new OwnershipViolationError('Career event');
        if (current.status !== 'pending')
          throw new InvalidStateTransitionError(
            'Career event',
            current.status,
            'resolved',
          );
        const definition = this.ctx.catalog.careerEvent(
          current.eventDefinitionId,
        );
        if (!definition.choices.some((c) => c.choiceId === input.choiceId))
          throw new InvalidInputError('Unknown choice for this event');
        const rows = await tx
          .update(careerEventInstances)
          .set({
            status: 'resolved',
            selectedChoiceId: input.choiceId,
            resolvedAt: this.ctx.clock.now(),
            effectsSnapshot: input.effectsSnapshot,
          })
          .where(eq(careerEventInstances.id, input.instanceId))
          .returning();
        return toEventInstance(requireRow(rows, 'Career event'));
      });
    });
  }

  closeEventInstance(
    careerId: string,
    instanceId: string,
    status: Extract<CareerEventStatus, 'expired' | 'dismissed'>,
  ): Promise<void> {
    return this.run(async () => {
      const rows = await this.db
        .update(careerEventInstances)
        .set({ status })
        .where(
          and(
            eq(careerEventInstances.id, instanceId),
            eq(careerEventInstances.careerId, careerId),
            eq(careerEventInstances.status, 'pending'),
          ),
        )
        .returning({ id: careerEventInstances.id });
      if (!rows[0])
        throw new InvalidStateTransitionError(
          'Career event',
          'not pending',
          status,
        );
    });
  }

  listEventInstances(
    careerId: string,
    options: PageRequest & { status?: CareerEventStatus } = {},
  ): Promise<Page<CareerEventInstanceRecord>> {
    return this.run(async () => {
      const limit = clampLimit(options.limit);
      const rows = await this.db
        .select()
        .from(careerEventInstances)
        .where(
          and(
            eq(careerEventInstances.careerId, careerId),
            options.status
              ? eq(careerEventInstances.status, options.status)
              : undefined,
            keysetDesc(
              careerEventInstances.triggeredAt,
              careerEventInstances.id,
              options.cursor,
            ),
          ),
        )
        .orderBy(
          desc(careerEventInstances.triggeredAt),
          desc(careerEventInstances.id),
        )
        .limit(limit + 1);
      return toPage(rows.map(toEventInstance), limit, (r) =>
        encodeTimeCursor(r.triggeredAt, r.id),
      );
    });
  }

  /** Most recent occurrence of a definition (for cooldown-in-matches evaluation by game logic). */
  getLatestEventInstance(
    careerId: string,
    eventDefinitionId: string,
  ): Promise<CareerEventInstanceRecord | null> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(careerEventInstances)
        .where(
          and(
            eq(careerEventInstances.careerId, careerId),
            eq(careerEventInstances.eventDefinitionId, eventDefinitionId),
          ),
        )
        .orderBy(
          desc(careerEventInstances.triggeredAt),
          desc(careerEventInstances.id),
        )
        .limit(1);
      return rows[0] ? toEventInstance(rows[0]) : null;
    });
  }

  // ---- contracts ---------------------------------------------------------------------------

  offerContract(input: {
    readonly careerId: string;
    readonly teamId: string;
    readonly contractDefinitionId?: string;
    readonly expectedRole: PlayerRole;
    readonly salaryCoins: number;
    readonly matchFeeCoins: number;
    readonly performanceBonusCoins: number;
    readonly minimumPerformanceRating: number;
    readonly durationMatches: number;
    readonly termsSnapshot?: Record<string, unknown>;
    readonly endsAt?: Date;
  }): Promise<ContractRecord> {
    return this.run(async () => {
      if (input.contractDefinitionId)
        this.ctx.catalog.contract(input.contractDefinitionId);
      const rows = await this.db
        .insert(contracts)
        .values({
          careerId: input.careerId,
          teamId: input.teamId,
          ...(input.contractDefinitionId
            ? { contractDefinitionId: input.contractDefinitionId }
            : {}),
          expectedRole: input.expectedRole,
          salaryCoins: input.salaryCoins,
          matchFeeCoins: input.matchFeeCoins,
          performanceBonusCoins: input.performanceBonusCoins,
          minimumPerformanceRating: input.minimumPerformanceRating.toFixed(1),
          durationMatches: input.durationMatches,
          termsSnapshot: input.termsSnapshot ?? {},
          gameBalanceVersion: GAME_BALANCE_VERSION,
          ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        })
        .returning();
      return toContract(requireRow(rows, 'Contract'));
    });
  }

  /** Move a contract along CONTRACT_TRANSITIONS (compare-and-set on the current status). */
  transitionContract(
    careerId: string,
    contractId: string,
    to: ContractStatus,
  ): Promise<ContractRecord> {
    return this.run(async () => {
      assertUuid(contractId, 'contractId');
      return this.db.transaction(async (tx) => {
        const current = (
          await tx
            .select()
            .from(contracts)
            .where(
              and(
                eq(contracts.id, contractId),
                eq(contracts.careerId, careerId),
              ),
            )
            .for('update')
        )[0];
        if (!current) throw new OwnershipViolationError('Contract');
        if (!CONTRACT_TRANSITIONS[current.status].includes(to))
          throw new InvalidStateTransitionError('Contract', current.status, to);
        const now = this.ctx.clock.now();
        const rows = await tx
          .update(contracts)
          .set({
            status: to,
            ...(to === 'accepted' ? { signedAt: now } : {}),
            ...(to === 'active' ? { startsAt: now } : {}),
            ...(to === 'terminated' ? { terminatedAt: now } : {}),
          })
          .where(eq(contracts.id, contractId))
          .returning();
        return toContract(requireRow(rows, 'Contract'));
      });
    });
  }

  /** Count a played match against the active contract (atomic; bounded by duration_matches). */
  recordContractMatch(careerId: string): Promise<ContractRecord | null> {
    return this.run(async () => {
      const rows = await this.db
        .update(contracts)
        .set({ matchesPlayed: sql`${contracts.matchesPlayed} + 1` })
        .where(
          and(
            eq(contracts.careerId, careerId),
            eq(contracts.status, 'active'),
            sql`${contracts.matchesPlayed} < ${contracts.durationMatches}`,
          ),
        )
        .returning();
      return rows[0] ? toContract(rows[0]) : null;
    });
  }

  getActiveContract(careerId: string): Promise<ContractRecord | null> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(contracts)
        .where(
          and(eq(contracts.careerId, careerId), eq(contracts.status, 'active')),
        );
      return rows[0] ? toContract(rows[0]) : null;
    });
  }

  listContracts(
    careerId: string,
    statuses?: readonly ContractStatus[],
  ): Promise<readonly ContractRecord[]> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(contracts)
        .where(
          and(
            eq(contracts.careerId, careerId),
            statuses?.length
              ? inArray(contracts.status, [...statuses])
              : undefined,
          ),
        )
        .orderBy(desc(contracts.offeredAt), desc(contracts.id))
        .limit(MAX_INLINE_LIST);
      return rows.map(toContract);
    });
  }

  // ---- sponsorships ------------------------------------------------------------------------

  offerSponsorship(input: {
    readonly careerId: string;
    readonly sponsorDefinitionId: string;
    readonly payout: {
      readonly currency: CurrencyCode;
      readonly amount: number;
    };
    readonly rewardConfigSnapshot?: Record<string, unknown>;
    readonly endsAt?: Date;
  }): Promise<SponsorshipRecord> {
    return this.run(async () => {
      this.ctx.catalog.sponsor(input.sponsorDefinitionId);
      const rows = await this.db
        .insert(sponsorships)
        .values({
          careerId: input.careerId,
          sponsorDefinitionId: input.sponsorDefinitionId,
          payoutCurrency: input.payout.currency,
          payoutAmount: input.payout.amount,
          rewardConfigSnapshot: input.rewardConfigSnapshot ?? {},
          gameBalanceVersion: GAME_BALANCE_VERSION,
          ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        })
        .returning();
      return toSponsorship(requireRow(rows, 'Sponsorship'));
    });
  }

  transitionSponsorship(
    careerId: string,
    sponsorshipId: string,
    to: SponsorshipStatus,
  ): Promise<SponsorshipRecord> {
    return this.run(async () => {
      assertUuid(sponsorshipId, 'sponsorshipId');
      return this.db.transaction(async (tx) => {
        const current = (
          await tx
            .select()
            .from(sponsorships)
            .where(
              and(
                eq(sponsorships.id, sponsorshipId),
                eq(sponsorships.careerId, careerId),
              ),
            )
            .for('update')
        )[0];
        if (!current) throw new OwnershipViolationError('Sponsorship');
        if (!SPONSORSHIP_TRANSITIONS[current.status].includes(to))
          throw new InvalidStateTransitionError(
            'Sponsorship',
            current.status,
            to,
          );
        const now = this.ctx.clock.now();
        const rows = await tx
          .update(sponsorships)
          .set({
            status: to,
            ...(to === 'active' ? { acceptedAt: now, startsAt: now } : {}),
          })
          .where(eq(sponsorships.id, sponsorshipId))
          .returning();
        return toSponsorship(requireRow(rows, 'Sponsorship'));
      });
    });
  }

  listSponsorships(
    careerId: string,
    statuses?: readonly SponsorshipStatus[],
  ): Promise<readonly SponsorshipRecord[]> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(sponsorships)
        .where(
          and(
            eq(sponsorships.careerId, careerId),
            statuses?.length
              ? inArray(sponsorships.status, [...statuses])
              : undefined,
          ),
        )
        .orderBy(desc(sponsorships.offeredAt), desc(sponsorships.id))
        .limit(MAX_INLINE_LIST);
      return rows.map(toSponsorship);
    });
  }

  /** Guard used by RewardRepository: fail loudly if the player has no active career. */
  requireActiveCareerId(playerId: string): Promise<string> {
    return this.run(async () => {
      const career = await this.getActiveCareer(playerId);
      if (!career) throw new RecordNotFoundError('Active career');
      return career.id;
    });
  }
}

/** Small, naturally bounded collections (a career has a handful of contracts/sponsors). */
const MAX_INLINE_LIST = 100;
