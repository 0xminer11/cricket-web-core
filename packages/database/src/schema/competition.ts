import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  FIXTURE_STATUSES,
  MEMBERSHIP_ROLES,
  MEMBERSHIP_STATUSES,
} from '../enums';
import { LIMITS } from '../limits';
import { careers } from './career';
import {
  createdAt,
  definitionIdIn,
  iff,
  inList,
  pk,
  positive,
  range,
  ts,
  updatedAt,
} from './helpers';
import { playerProfiles } from './player';
import { teams } from './teams';

/** History-preserving team membership: leaving ends the row, it never overwrites it. */
export const teamMemberships = pgTable(
  'team_memberships',
  {
    id: pk(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => playerProfiles.id, { onDelete: 'restrict' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    role: text('role', { enum: MEMBERSHIP_ROLES }).notNull().default('player'),
    shirtNumber: smallint('shirt_number'),
    status: text('status', { enum: MEMBERSHIP_STATUSES })
      .notNull()
      .default('active'),
    joinedAt: ts('joined_at').notNull().defaultNow(),
    leftAt: ts('left_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('team_memberships_player_status_idx').on(t.playerId, t.status),
    index('team_memberships_team_status_idx').on(t.teamId, t.status),
    uniqueIndex('team_memberships_one_active_per_team_uniq')
      .on(t.playerId, t.teamId)
      .where(sql`${t.status} = 'active'`),
    check('team_memberships_role_check', inList(t.role, MEMBERSHIP_ROLES)),
    check(
      'team_memberships_status_check',
      inList(t.status, MEMBERSHIP_STATUSES),
    ),
    check(
      'team_memberships_shirt_number_check',
      sql`${t.shirtNumber} IS NULL OR ${range(t.shirtNumber, LIMITS.jerseyMin, LIMITS.jerseyMax)}`,
    ),
    check(
      'team_memberships_left_at_check',
      iff(sql`${t.status} = 'ended'`, sql`${t.leftAt} IS NOT NULL`),
    ),
  ],
);

/** Scheduled matchup. competition ids are opaque `competition.*` strings until a definition module exists. */
export const fixtures = pgTable(
  'fixtures',
  {
    id: pk(),
    careerId: uuid('career_id').references(() => careers.id, {
      onDelete: 'restrict',
    }),
    competitionDefinitionId: text('competition_definition_id').notNull(),
    homeTeamId: uuid('home_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    awayTeamId: uuid('away_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    matchFormatId: text('match_format_id').notNull(),
    scheduledAt: ts('scheduled_at').notNull(),
    status: text('status', { enum: FIXTURE_STATUSES })
      .notNull()
      .default('scheduled'),
    seasonNumber: integer('season_number').notNull().default(1),
    round: integer('round').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('fixtures_scheduled_status_idx').on(t.scheduledAt, t.status),
    index('fixtures_career_scheduled_idx').on(t.careerId, t.scheduledAt),
    index('fixtures_home_team_id_idx').on(t.homeTeamId),
    index('fixtures_away_team_id_idx').on(t.awayTeamId),
    check('fixtures_status_check', inList(t.status, FIXTURE_STATUSES)),
    check(
      'fixtures_teams_differ_check',
      sql`${t.homeTeamId} <> ${t.awayTeamId}`,
    ),
    check('fixtures_format_check', definitionIdIn(t.matchFormatId, 'format')),
    check(
      'fixtures_competition_check',
      definitionIdIn(t.competitionDefinitionId, 'competition'),
    ),
    check('fixtures_season_number_check', positive(t.seasonNumber)),
    check('fixtures_round_check', positive(t.round)),
  ],
);
