import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CONTACT_QUALITIES,
  DELIVERY_LENGTHS,
  DELIVERY_LINES,
  DISMISSAL_TYPES,
  EXTRA_TYPES,
  INNINGS_STATUSES,
  MATCH_MODES,
  MATCH_RESULT_TYPES,
  MATCH_STATUSES,
  PARTICIPANT_TYPES,
  PLAYER_ROLES,
} from '../enums';
import { LIMITS } from '../limits';
import { fixtures } from './competition';
import {
  createdAt,
  definitionIdIn,
  inList,
  nonNegative,
  pk,
  positive,
  range,
  ts,
  updatedAt,
} from './helpers';
import { playerProfiles } from './player';
import { teams } from './teams';

/**
 * Authoritative match header. Pins match_engine_version, game_balance_version and
 * data_schema_version for the match's lifetime so old results stay interpretable.
 * match_mode (career/friendly/ranked/tournament) is independent of who plays: human vs AI is
 * a property of match_participants, so PvP needs no schema change.
 */
export const matches = pgTable(
  'matches',
  {
    id: pk(),
    fixtureId: uuid('fixture_id').references(() => fixtures.id, {
      onDelete: 'restrict',
    }),
    matchMode: text('match_mode', { enum: MATCH_MODES })
      .notNull()
      .default('career'),
    matchFormatId: text('match_format_id').notNull(),
    pitchDefinitionId: text('pitch_definition_id').notNull(),
    matchEngineVersion: text('match_engine_version').notNull(),
    gameBalanceVersion: text('game_balance_version').notNull(),
    dataSchemaVersion: integer('data_schema_version').notNull(),
    /** Seed + algorithm version make a match replayable/verifiable (see SeededRandomSource). */
    rngSeed: text('rng_seed'),
    rngAlgorithmVersion: text('rng_algorithm_version'),
    status: text('status', { enum: MATCH_STATUSES })
      .notNull()
      .default('created'),
    homeTeamId: uuid('home_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    awayTeamId: uuid('away_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    winnerTeamId: uuid('winner_team_id').references(() => teams.id, {
      onDelete: 'restrict',
    }),
    resultType: text('result_type', { enum: MATCH_RESULT_TYPES }),
    resultSummary: text('result_summary'),
    startedAt: ts('started_at'),
    completedAt: ts('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('matches_status_started_idx').on(t.status, t.startedAt),
    uniqueIndex('matches_fixture_id_uniq').on(t.fixtureId),
    index('matches_home_team_id_idx').on(t.homeTeamId),
    index('matches_away_team_id_idx').on(t.awayTeamId),
    check('matches_status_check', inList(t.status, MATCH_STATUSES)),
    check('matches_mode_check', inList(t.matchMode, MATCH_MODES)),
    check(
      'matches_result_type_check',
      sql`${t.resultType} IS NULL OR ${inList(t.resultType, MATCH_RESULT_TYPES)}`,
    ),
    check(
      'matches_teams_differ_check',
      sql`${t.homeTeamId} <> ${t.awayTeamId}`,
    ),
    check(
      'matches_winner_is_participant_check',
      sql`${t.winnerTeamId} IS NULL OR ${t.winnerTeamId} IN (${t.homeTeamId}, ${t.awayTeamId})`,
    ),
    check('matches_format_check', definitionIdIn(t.matchFormatId, 'format')),
    check('matches_pitch_check', definitionIdIn(t.pitchDefinitionId, 'pitch')),
    check('matches_data_schema_version_check', positive(t.dataSchemaVersion)),
    check(
      'matches_result_summary_check',
      sql`${t.resultSummary} IS NULL OR char_length(${t.resultSummary}) <= 200`,
    ),
    check(
      'matches_started_at_check',
      sql`${t.status} NOT IN ('in_progress', 'completed') OR ${t.startedAt} IS NOT NULL`,
    ),
    check(
      'matches_completion_check',
      sql`(${t.status} = 'completed') = (${t.completedAt} IS NOT NULL AND ${t.resultType} IS NOT NULL AND ${t.resultType} <> 'abandoned')`,
    ),
    check(
      'matches_winner_result_check',
      sql`(${t.winnerTeamId} IS NOT NULL) = COALESCE(${t.resultType} = 'win', false)`,
    ),
  ],
);

/**
 * Who took part, human or AI. Balls/overs reference participants (not player_profiles) so AI
 * players without a profile are addressable, and PvP is just two human participants.
 * display_name/overall/selected_role are minimal point-in-time snapshots for history.
 */
export const matchParticipants = pgTable(
  'match_participants',
  {
    id: pk(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'restrict' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    playerId: uuid('player_id').references(() => playerProfiles.id, {
      onDelete: 'restrict',
    }),
    participantType: text('participant_type', {
      enum: PARTICIPANT_TYPES,
    }).notNull(),
    battingPosition: smallint('batting_position'),
    selectedRole: text('selected_role', { enum: PLAYER_ROLES }),
    displayNameSnapshot: text('display_name_snapshot').notNull(),
    overallSnapshot: smallint('overall_snapshot'),
    /** 0..10 performance rating, set at completion; feeds the derived recent-form history. */
    performanceRating: numeric('performance_rating', {
      precision: 3,
      scale: 1,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('match_participants_match_id_id_uniq').on(t.matchId, t.id),
    uniqueIndex('match_participants_match_player_uniq')
      .on(t.matchId, t.playerId)
      .where(sql`${t.playerId} IS NOT NULL`),
    uniqueIndex('match_participants_match_team_position_uniq')
      .on(t.matchId, t.teamId, t.battingPosition)
      .where(sql`${t.battingPosition} IS NOT NULL`),
    index('match_participants_player_history_idx')
      .on(t.playerId, t.createdAt.desc(), t.id.desc())
      .where(sql`${t.playerId} IS NOT NULL`),
    index('match_participants_team_id_idx').on(t.teamId),
    check(
      'match_participants_type_check',
      inList(t.participantType, PARTICIPANT_TYPES),
    ),
    check(
      'match_participants_human_has_profile_check',
      sql`(${t.participantType} = 'human') = (${t.playerId} IS NOT NULL)`,
    ),
    check(
      'match_participants_batting_position_check',
      sql`${t.battingPosition} IS NULL OR ${range(t.battingPosition, 1, 11)}`,
    ),
    check(
      'match_participants_overall_check',
      sql`${t.overallSnapshot} IS NULL OR ${range(t.overallSnapshot, 0, 100)}`,
    ),
    check(
      'match_participants_rating_check',
      sql`${t.performanceRating} IS NULL OR ${range(t.performanceRating, 0, LIMITS.performanceRatingMax)}`,
    ),
    check(
      'match_participants_display_name_check',
      sql`char_length(${t.displayNameSnapshot}) BETWEEN 1 AND 60`,
    ),
  ],
);

export const matchInnings = pgTable(
  'match_innings',
  {
    id: pk(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'restrict' }),
    /** 1-based; super-over innings continue the sequence and set is_super_over. */
    inningsNumber: smallint('innings_number').notNull(),
    battingTeamId: uuid('batting_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    bowlingTeamId: uuid('bowling_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    isSuperOver: boolean('is_super_over').notNull().default(false),
    /** Aggregates are maintained in the same transaction as each ball (see match-storage.md). */
    runs: integer('runs').notNull().default(0),
    wickets: smallint('wickets').notNull().default(0),
    legalBalls: integer('legal_balls').notNull().default(0),
    extras: integer('extras').notNull().default(0),
    target: integer('target'),
    status: text('status', { enum: INNINGS_STATUSES })
      .notNull()
      .default('pending'),
    startedAt: ts('started_at'),
    completedAt: ts('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('match_innings_match_number_uniq').on(t.matchId, t.inningsNumber),
    unique('match_innings_id_match_uniq').on(t.id, t.matchId),
    check('match_innings_status_check', inList(t.status, INNINGS_STATUSES)),
    check('match_innings_number_check', positive(t.inningsNumber)),
    check(
      'match_innings_teams_differ_check',
      sql`${t.battingTeamId} <> ${t.bowlingTeamId}`,
    ),
    check('match_innings_runs_check', nonNegative(t.runs)),
    check(
      'match_innings_wickets_check',
      range(t.wickets, 0, LIMITS.maxWicketsPerInnings),
    ),
    check('match_innings_legal_balls_check', nonNegative(t.legalBalls)),
    check(
      'match_innings_extras_check',
      sql`${t.extras} >= 0 AND ${t.extras} <= ${t.runs}`,
    ),
    check(
      'match_innings_target_check',
      sql`${t.target} IS NULL OR ${t.target} > 0`,
    ),
    check(
      'match_innings_started_at_check',
      sql`${t.status} = 'pending' OR ${t.startedAt} IS NOT NULL`,
    ),
    check(
      'match_innings_completed_at_check',
      sql`(${t.status} = 'completed') = (${t.completedAt} IS NOT NULL)`,
    ),
  ],
);

export const matchOvers = pgTable(
  'match_overs',
  {
    id: pk(),
    matchId: uuid('match_id').notNull(),
    inningsId: uuid('innings_id').notNull(),
    /** 1-based over number within the innings. */
    overNumber: smallint('over_number').notNull(),
    bowlerParticipantId: uuid('bowler_participant_id').notNull(),
    runs: integer('runs').notNull().default(0),
    wickets: smallint('wickets').notNull().default(0),
    legalBalls: smallint('legal_balls').notNull().default(0),
    completedAt: ts('completed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('match_overs_innings_number_uniq').on(t.inningsId, t.overNumber),
    unique('match_overs_id_innings_uniq').on(t.id, t.inningsId),
    check('match_overs_number_check', positive(t.overNumber)),
    check('match_overs_runs_check', nonNegative(t.runs)),
    check(
      'match_overs_wickets_check',
      range(t.wickets, 0, LIMITS.maxWicketsPerInnings),
    ),
    check(
      'match_overs_legal_balls_check',
      range(t.legalBalls, 0, LIMITS.maxBallsPerOver),
    ),
    foreignKey({
      name: 'match_overs_innings_match_fk',
      columns: [t.inningsId, t.matchId],
      foreignColumns: [matchInnings.id, matchInnings.matchId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'match_overs_bowler_participant_fk',
      columns: [t.matchId, t.bowlerParticipantId],
      foreignColumns: [matchParticipants.matchId, matchParticipants.id],
    }).onDelete('restrict'),
  ],
);

/**
 * One row per delivery. Narrow, JSON-free and bigint-keyed (never exposed via API) because this
 * is the highest-volume table. Ordering is sequence_number per innings, never timestamps.
 * Composite foreign keys guarantee a ball's innings, over and participants all belong to the
 * same match.
 */
export const matchBalls = pgTable(
  'match_balls',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    matchId: uuid('match_id').notNull(),
    inningsId: uuid('innings_id').notNull(),
    overId: uuid('over_id').notNull(),
    sequenceNumber: integer('sequence_number').notNull(),
    overNumber: smallint('over_number').notNull(),
    /** 1-based index of this delivery within the over, counting wides/no-balls. */
    ballInOver: smallint('ball_in_over').notNull(),
    strikerParticipantId: uuid('striker_participant_id').notNull(),
    nonStrikerParticipantId: uuid('non_striker_participant_id').notNull(),
    bowlerParticipantId: uuid('bowler_participant_id').notNull(),
    deliveryDefinitionId: text('delivery_definition_id').notNull(),
    shotDefinitionId: text('shot_definition_id'),
    line: text('line', { enum: DELIVERY_LINES }).notNull(),
    length: text('length', { enum: DELIVERY_LENGTHS }).notNull(),
    runsOffBat: smallint('runs_off_bat').notNull().default(0),
    extras: smallint('extras').notNull().default(0),
    extraType: text('extra_type', { enum: EXTRA_TYPES }),
    wicket: boolean('wicket').notNull().default(false),
    wicketType: text('wicket_type', { enum: DISMISSAL_TYPES }),
    dismissedParticipantId: uuid('dismissed_participant_id'),
    legalDelivery: boolean('legal_delivery').notNull().default(true),
    contactQuality: text('contact_quality', { enum: CONTACT_QUALITIES }),
    ballSpeed: numeric('ball_speed', { precision: 5, scale: 2 }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('match_balls_match_innings_seq_uniq').on(
      t.matchId,
      t.inningsId,
      t.sequenceNumber,
    ),
    unique('match_balls_over_ball_uniq').on(t.overId, t.ballInOver),
    check('match_balls_sequence_check', positive(t.sequenceNumber)),
    check('match_balls_over_number_check', positive(t.overNumber)),
    check('match_balls_ball_in_over_check', range(t.ballInOver, 1, 30)),
    check('match_balls_runs_off_bat_check', range(t.runsOffBat, 0, 8)),
    check('match_balls_extras_check', range(t.extras, 0, 10)),
    check(
      'match_balls_batters_differ_check',
      sql`${t.strikerParticipantId} <> ${t.nonStrikerParticipantId}`,
    ),
    check(
      'match_balls_extra_type_check',
      sql`(${t.extraType} IS NULL) = (${t.extras} = 0) AND (${t.extraType} IS NULL OR ${inList(t.extraType, EXTRA_TYPES)})`,
    ),
    check(
      'match_balls_legal_delivery_check',
      sql`${t.legalDelivery} = (${t.extraType} IS NULL OR ${t.extraType} NOT IN ('wide', 'no_ball'))`,
    ),
    check(
      'match_balls_wicket_check',
      sql`${t.wicket} = (${t.wicketType} IS NOT NULL) AND ${t.wicket} = (${t.dismissedParticipantId} IS NOT NULL)`,
    ),
    check(
      'match_balls_wicket_type_valid_check',
      sql`${t.wicketType} IS NULL OR ${inList(t.wicketType, DISMISSAL_TYPES)}`,
    ),
    check(
      'match_balls_contact_quality_check',
      sql`${t.contactQuality} IS NULL OR ${inList(t.contactQuality, CONTACT_QUALITIES)}`,
    ),
    check('match_balls_line_check', inList(t.line, DELIVERY_LINES)),
    check('match_balls_length_check', inList(t.length, DELIVERY_LENGTHS)),
    check(
      'match_balls_ball_speed_check',
      sql`${t.ballSpeed} IS NULL OR ${range(t.ballSpeed, 0, 200)}`,
    ),
    check(
      'match_balls_delivery_id_check',
      definitionIdIn(t.deliveryDefinitionId, 'delivery'),
    ),
    check(
      'match_balls_shot_id_check',
      sql`${t.shotDefinitionId} IS NULL OR ${definitionIdIn(t.shotDefinitionId, 'shot')}`,
    ),
    foreignKey({
      name: 'match_balls_innings_match_fk',
      columns: [t.inningsId, t.matchId],
      foreignColumns: [matchInnings.id, matchInnings.matchId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'match_balls_over_innings_fk',
      columns: [t.overId, t.inningsId],
      foreignColumns: [matchOvers.id, matchOvers.inningsId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'match_balls_striker_fk',
      columns: [t.matchId, t.strikerParticipantId],
      foreignColumns: [matchParticipants.matchId, matchParticipants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'match_balls_non_striker_fk',
      columns: [t.matchId, t.nonStrikerParticipantId],
      foreignColumns: [matchParticipants.matchId, matchParticipants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'match_balls_bowler_fk',
      columns: [t.matchId, t.bowlerParticipantId],
      foreignColumns: [matchParticipants.matchId, matchParticipants.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'match_balls_dismissed_fk',
      columns: [t.matchId, t.dismissedParticipantId],
      foreignColumns: [matchParticipants.matchId, matchParticipants.id],
    }).onDelete('restrict'),
  ],
);
