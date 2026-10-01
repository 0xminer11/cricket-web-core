import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Executor } from '../connection';
import type { FixtureStatus, MatchResultType, MatchStatus } from '../enums';
import { InvalidInputError } from '../errors';
import {
  clampLimit,
  encodeTimeCursor,
  keysetAsc,
  keysetDesc,
  toPage,
} from '../pagination';
import type { Page, PageRequest } from '../pagination';
import type {
  CareerEventInstanceRecord,
  FixtureRecord,
  TeamRecord,
} from '../records';
import {
  careerEventInstances,
  careers,
  fixtures,
  matches,
  playerOnboarding,
  teams,
} from '../schema/index';
import { toTeam } from './mappers';
import type { RepositoryContext } from './shared';
import { assertUuid, Repository } from './shared';

/** A fixture with both teams and (once played) the linked match outcome, from ONE query. */
export interface FixtureView {
  readonly fixture: FixtureRecord;
  readonly homeTeam: TeamRecord;
  readonly awayTeam: TeamRecord;
  readonly match: {
    readonly status: MatchStatus;
    readonly resultType: MatchResultType | null;
    readonly winnerTeamId: string | null;
  } | null;
}

export type FixtureScope = 'upcoming' | 'completed';
/** Fixtures that are still to be played (postponed ones are listed but never become "next"). */
export const UPCOMING_STATUSES: readonly FixtureStatus[] = [
  'scheduled',
  'in_progress',
  'postponed',
];
export const FINISHED_STATUSES: readonly FixtureStatus[] = [
  'completed',
  'cancelled',
];

/**
 * Read model for the Career Home (Module 6). Each method is one set-based query (joins instead of
 * per-row lookups), so a page of fixtures costs one round trip no matter how many rows it has.
 * Every fixture/event lookup is scoped by the caller's career id; there is no way to ask for
 * someone else's rows through this class.
 */
export class CareerHomeRepository extends Repository {
  constructor(
    private readonly db: Executor,
    _ctx: RepositoryContext,
  ) {
    super();
  }

  /** Row lock on the career so concurrent first requests cannot both bootstrap fixtures. */
  lockCareer(careerId: string): Promise<void> {
    return this.run(async () => {
      assertUuid(careerId, 'careerId');
      const rows = await this.db
        .select({ id: careers.id })
        .from(careers)
        .where(eq(careers.id, careerId))
        .for('update');
      if (!rows[0]) throw new InvalidInputError('Unknown career');
    });
  }

  countFixtures(careerId: string): Promise<number> {
    return this.run(async () => {
      assertUuid(careerId, 'careerId');
      const rows = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(fixtures)
        .where(eq(fixtures.careerId, careerId));
      return rows[0]?.n ?? 0;
    });
  }

  /**
   * Upcoming: soonest first. Completed: most recent first. Keyset paginated on (scheduled_at, id),
   * served by fixtures_career_scheduled_idx.
   */
  listFixtures(
    careerId: string,
    scope: FixtureScope,
    page: PageRequest = {},
  ): Promise<Page<FixtureView>> {
    return this.run(async () => {
      assertUuid(careerId, 'careerId');
      const limit = clampLimit(page.limit, 50);
      const home = alias(teams, 'home_team');
      const away = alias(teams, 'away_team');
      const upcoming = scope === 'upcoming';
      const rows = await this.db
        .select({
          fixture: fixtures,
          home,
          away,
          matchStatus: matches.status,
          resultType: matches.resultType,
          winnerTeamId: matches.winnerTeamId,
        })
        .from(fixtures)
        .innerJoin(home, eq(home.id, fixtures.homeTeamId))
        .innerJoin(away, eq(away.id, fixtures.awayTeamId))
        .leftJoin(matches, eq(matches.fixtureId, fixtures.id))
        .where(
          and(
            eq(fixtures.careerId, careerId),
            inArray(
              fixtures.status,
              upcoming ? [...UPCOMING_STATUSES] : [...FINISHED_STATUSES],
            ),
            upcoming
              ? keysetAsc(fixtures.scheduledAt, fixtures.id, page.cursor)
              : keysetDesc(fixtures.scheduledAt, fixtures.id, page.cursor),
          ),
        )
        .orderBy(
          upcoming ? asc(fixtures.scheduledAt) : desc(fixtures.scheduledAt),
          upcoming ? asc(fixtures.id) : desc(fixtures.id),
        )
        .limit(limit + 1);
      const views: FixtureView[] = rows.map((r) => ({
        fixture: {
          id: r.fixture.id,
          careerId: r.fixture.careerId,
          competitionDefinitionId: r.fixture.competitionDefinitionId,
          homeTeamId: r.fixture.homeTeamId,
          awayTeamId: r.fixture.awayTeamId,
          matchFormatId: r.fixture.matchFormatId,
          scheduledAt: r.fixture.scheduledAt,
          status: r.fixture.status,
          seasonNumber: r.fixture.seasonNumber,
          round: r.fixture.round,
        },
        homeTeam: toTeam(r.home),
        awayTeam: toTeam(r.away),
        match: r.matchStatus
          ? {
              status: r.matchStatus,
              resultType: r.resultType,
              winnerTeamId: r.winnerTeamId,
            }
          : null,
      }));
      return toPage(views, limit, (v) =>
        encodeTimeCursor(v.fixture.scheduledAt, v.fixture.id),
      );
    });
  }

  /** One career event occurrence, only if it belongs to this career. */
  getEventInstance(
    careerId: string,
    eventId: string,
  ): Promise<CareerEventInstanceRecord | null> {
    return this.run(async () => {
      assertUuid(careerId, 'careerId');
      assertUuid(eventId, 'eventId');
      const rows = await this.db
        .select()
        .from(careerEventInstances)
        .where(
          and(
            eq(careerEventInstances.id, eventId),
            eq(careerEventInstances.careerId, careerId),
          ),
        );
      const row = rows[0];
      return row
        ? {
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
          }
        : null;
    });
  }

  // ---- onboarding (UX state, not progression) ------------------------------------------------

  completedOnboardingSteps(playerId: string): Promise<readonly string[]> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      const rows = await this.db
        .select({ step: playerOnboarding.step })
        .from(playerOnboarding)
        .where(eq(playerOnboarding.playerId, playerId));
      return rows.map((r) => r.step);
    });
  }

  /** Idempotent: completing a step twice is not an error and keeps the first completion time. */
  completeOnboardingStep(playerId: string, step: string): Promise<void> {
    return this.run(async () => {
      assertUuid(playerId, 'playerId');
      await this.db
        .insert(playerOnboarding)
        .values({ playerId, step })
        .onConflictDoNothing();
    });
  }
}
