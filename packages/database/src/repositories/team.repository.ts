import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import type { Executor } from '../connection';
import type { FixtureStatus, MembershipRole } from '../enums';
import {
  InvalidInputError,
  InvalidStateTransitionError,
  OwnershipViolationError,
} from '../errors';
import {
  clampLimit,
  encodeTimeCursor,
  keysetAsc,
  keysetDesc,
  toPage,
} from '../pagination';
import type { Page, PageRequest } from '../pagination';
import type {
  FixtureRecord,
  TeamMembershipRecord,
  TeamRecord,
} from '../records';
import { fixtures, teamMemberships, teams } from '../schema/index';
import { toTeam } from './mappers';
import type { RepositoryContext } from './shared';
import { assertUuid, Repository, requireRow } from './shared';

const toMembership = (
  row: typeof teamMemberships.$inferSelect,
): TeamMembershipRecord => ({
  id: row.id,
  playerId: row.playerId,
  teamId: row.teamId,
  role: row.role,
  shirtNumber: row.shirtNumber,
  status: row.status,
  joinedAt: row.joinedAt,
  leftAt: row.leftAt,
});
const toFixture = (row: typeof fixtures.$inferSelect): FixtureRecord => ({
  id: row.id,
  careerId: row.careerId,
  competitionDefinitionId: row.competitionDefinitionId,
  homeTeamId: row.homeTeamId,
  awayTeamId: row.awayTeamId,
  matchFormatId: row.matchFormatId,
  scheduledAt: row.scheduledAt,
  status: row.status,
  seasonNumber: row.seasonNumber,
  round: row.round,
});

const FIXTURE_TRANSITIONS: Readonly<
  Record<FixtureStatus, readonly FixtureStatus[]>
> = {
  scheduled: ['in_progress', 'cancelled', 'postponed'],
  postponed: ['scheduled', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class TeamRepository extends Repository {
  constructor(
    private readonly db: Executor,
    private readonly ctx: RepositoryContext,
  ) {
    super();
  }

  /**
   * Idempotent seed of canonical team rows from Module 0 definitions. Existing rows keep their id
   * and any name_override; strength/config are never copied.
   */
  ensureCanonicalTeams(
    definitionIds: readonly string[],
  ): Promise<readonly TeamRecord[]> {
    return this.run(async () => {
      for (const id of definitionIds) this.ctx.catalog.team(id);
      if (definitionIds.length === 0) return [];
      await this.db
        .insert(teams)
        .values(definitionIds.map((definitionId) => ({ definitionId })))
        .onConflictDoNothing({ target: teams.definitionId });
      const rows = await this.db
        .select()
        .from(teams)
        .where(inArray(teams.definitionId, [...definitionIds]))
        .orderBy(teams.definitionId);
      return rows.map(toTeam);
    });
  }

  getById(teamId: string): Promise<TeamRecord | null> {
    return this.run(async () => {
      assertUuid(teamId, 'teamId');
      const rows = await this.db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId));
      return rows[0] ? toTeam(rows[0]) : null;
    });
  }

  findByDefinitionId(definitionId: string): Promise<TeamRecord | null> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(teams)
        .where(eq(teams.definitionId, definitionId));
      return rows[0] ? toTeam(rows[0]) : null;
    });
  }

  /** Batch lookup (single query) for hydrating lists of matches/fixtures. */
  getByIds(teamIds: readonly string[]): Promise<readonly TeamRecord[]> {
    return this.run(async () => {
      if (teamIds.length === 0) return [];
      const rows = await this.db
        .select()
        .from(teams)
        .where(inArray(teams.id, [...new Set(teamIds)]));
      return rows.map(toTeam);
    });
  }

  listActive(): Promise<readonly TeamRecord[]> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(teams)
        .where(eq(teams.active, true))
        .orderBy(teams.definitionId)
        .limit(200);
      return rows.map(toTeam);
    });
  }

  // ---- memberships (history-preserving) ----------------------------------------------------

  joinTeam(input: {
    readonly playerId: string;
    readonly teamId: string;
    readonly role?: MembershipRole;
    readonly shirtNumber?: number;
  }): Promise<TeamMembershipRecord> {
    return this.run(async () => {
      const rows = await this.db
        .insert(teamMemberships)
        .values({
          playerId: input.playerId,
          teamId: input.teamId,
          ...(input.role ? { role: input.role } : {}),
          ...(input.shirtNumber !== undefined
            ? { shirtNumber: input.shirtNumber }
            : {}),
        })
        .returning();
      return toMembership(requireRow(rows, 'Team membership'));
    });
  }

  /** Ends the row (keeps history). */
  leaveTeam(playerId: string, teamId: string): Promise<TeamMembershipRecord> {
    return this.run(async () => {
      const rows = await this.db
        .update(teamMemberships)
        .set({ status: 'ended', leftAt: this.ctx.clock.now() })
        .where(
          and(
            eq(teamMemberships.playerId, playerId),
            eq(teamMemberships.teamId, teamId),
            eq(teamMemberships.status, 'active'),
          ),
        )
        .returning();
      if (!rows[0]) throw new OwnershipViolationError('Team membership');
      return toMembership(rows[0]);
    });
  }

  getActiveMemberships(
    playerId: string,
  ): Promise<readonly TeamMembershipRecord[]> {
    return this.run(async () => {
      const rows = await this.db
        .select()
        .from(teamMemberships)
        .where(
          and(
            eq(teamMemberships.playerId, playerId),
            eq(teamMemberships.status, 'active'),
          ),
        )
        .orderBy(teamMemberships.joinedAt);
      return rows.map(toMembership);
    });
  }

  listMembershipHistory(
    playerId: string,
    page: PageRequest = {},
  ): Promise<Page<TeamMembershipRecord>> {
    return this.run(async () => {
      const limit = clampLimit(page.limit);
      const rows = await this.db
        .select()
        .from(teamMemberships)
        .where(
          and(
            eq(teamMemberships.playerId, playerId),
            keysetDesc(
              teamMemberships.joinedAt,
              teamMemberships.id,
              page.cursor,
            ),
          ),
        )
        .orderBy(desc(teamMemberships.joinedAt), desc(teamMemberships.id))
        .limit(limit + 1);
      return toPage(rows.map(toMembership), limit, (r) =>
        encodeTimeCursor(r.joinedAt, r.id),
      );
    });
  }

  // ---- fixtures ----------------------------------------------------------------------------

  createFixture(input: {
    readonly careerId?: string;
    readonly competitionDefinitionId: string;
    readonly homeTeamId: string;
    readonly awayTeamId: string;
    readonly matchFormatId: string;
    readonly scheduledAt: Date;
    readonly seasonNumber?: number;
    readonly round?: number;
  }): Promise<FixtureRecord> {
    return this.run(async () => {
      this.ctx.catalog.matchFormat(input.matchFormatId);
      if (input.homeTeamId === input.awayTeamId)
        throw new InvalidInputError('A fixture needs two different teams');
      const rows = await this.db
        .insert(fixtures)
        .values({
          ...(input.careerId ? { careerId: input.careerId } : {}),
          competitionDefinitionId: input.competitionDefinitionId,
          homeTeamId: input.homeTeamId,
          awayTeamId: input.awayTeamId,
          matchFormatId: input.matchFormatId,
          scheduledAt: input.scheduledAt,
          ...(input.seasonNumber ? { seasonNumber: input.seasonNumber } : {}),
          ...(input.round ? { round: input.round } : {}),
        })
        .returning();
      return toFixture(requireRow(rows, 'Fixture'));
    });
  }

  getFixture(fixtureId: string): Promise<FixtureRecord | null> {
    return this.run(async () => {
      assertUuid(fixtureId, 'fixtureId');
      const rows = await this.db
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, fixtureId));
      return rows[0] ? toFixture(rows[0]) : null;
    });
  }

  /** Upcoming-first (scheduled_at ASC, id ASC), optionally scoped to a career. */
  listFixtures(
    options: PageRequest & {
      careerId?: string;
      status?: FixtureStatus;
      from?: Date;
      before?: Date;
    } = {},
  ): Promise<Page<FixtureRecord>> {
    return this.run(async () => {
      const limit = clampLimit(options.limit);
      const rows = await this.db
        .select()
        .from(fixtures)
        .where(
          and(
            options.careerId
              ? eq(fixtures.careerId, options.careerId)
              : undefined,
            options.status ? eq(fixtures.status, options.status) : undefined,
            options.from ? gte(fixtures.scheduledAt, options.from) : undefined,
            options.before
              ? lt(fixtures.scheduledAt, options.before)
              : undefined,
            keysetAsc(fixtures.scheduledAt, fixtures.id, options.cursor),
          ),
        )
        .orderBy(asc(fixtures.scheduledAt), asc(fixtures.id))
        .limit(limit + 1);
      return toPage(rows.map(toFixture), limit, (r) =>
        encodeTimeCursor(r.scheduledAt, r.id),
      );
    });
  }

  transitionFixture(
    fixtureId: string,
    to: FixtureStatus,
  ): Promise<FixtureRecord> {
    return this.run(async () =>
      this.db.transaction(async (tx) => {
        const current = (
          await tx
            .select()
            .from(fixtures)
            .where(eq(fixtures.id, fixtureId))
            .for('update')
        )[0];
        if (!current) throw new InvalidInputError('Unknown fixture');
        if (!FIXTURE_TRANSITIONS[current.status].includes(to))
          throw new InvalidStateTransitionError('Fixture', current.status, to);
        const rows = await tx
          .update(fixtures)
          .set({ status: to })
          .where(eq(fixtures.id, fixtureId))
          .returning();
        return toFixture(requireRow(rows, 'Fixture'));
      }),
    );
  }
}
