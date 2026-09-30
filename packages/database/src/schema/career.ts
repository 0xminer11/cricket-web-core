import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CAREER_EVENT_STATUSES,
  CAREER_HISTORY_EVENT_TYPES,
  CAREER_STATUSES,
  CAREER_TIERS,
  CONTRACT_STATUSES,
  CURRENCIES,
  PLAYER_ROLES,
  SPONSORSHIP_STATUSES,
} from '../enums';
import { LIMITS } from '../limits';
import {
  createdAt,
  definitionIdIn,
  iff,
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
 * A career is the player's long-term journey and owns the career-bound counters (tier,
 * reputation, selector interest, fans). Matches/wins are derived from player_stats.
 */
export const careers = pgTable(
  'careers',
  {
    id: pk(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => playerProfiles.id, { onDelete: 'restrict' }),
    currentTier: text('current_tier', { enum: CAREER_TIERS })
      .notNull()
      .default('academy'),
    currentTeamId: uuid('current_team_id').references(() => teams.id, {
      onDelete: 'restrict',
    }),
    seasonNumber: integer('season_number').notNull().default(1),
    careerStatus: text('career_status', { enum: CAREER_STATUSES })
      .notNull()
      .default('active'),
    reputation: integer('reputation').notNull().default(0),
    selectorInterest: integer('selector_interest').notNull().default(0),
    fans: bigint('fans', { mode: 'number' }).notNull().default(0),
    rowVersion: integer('row_version').notNull().default(0),
    startedAt: ts('started_at').notNull().defaultNow(),
    retiredAt: ts('retired_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('careers_player_id_idx').on(t.playerId),
    // Exactly one active career per player; retired careers accumulate freely.
    uniqueIndex('careers_one_active_per_player_uniq')
      .on(t.playerId)
      .where(sql`${t.careerStatus} = 'active'`),
    index('careers_current_team_id_idx').on(t.currentTeamId),
    check('careers_current_tier_check', inList(t.currentTier, CAREER_TIERS)),
    check(
      'careers_career_status_check',
      inList(t.careerStatus, CAREER_STATUSES),
    ),
    check('careers_season_number_check', positive(t.seasonNumber)),
    check(
      'careers_reputation_check',
      range(t.reputation, 0, LIMITS.reputationMax),
    ),
    check(
      'careers_selector_interest_check',
      range(t.selectorInterest, 0, LIMITS.selectorInterestMax),
    ),
    check('careers_fans_check', nonNegative(t.fans)),
    check(
      'careers_retired_at_check',
      iff(sql`${t.careerStatus} = 'retired'`, sql`${t.retiredAt} IS NOT NULL`),
    ),
  ],
);

/** Append-only (enforced by trigger in migration 0001). JSONB is supplemental metadata only. */
export const careerHistory = pgTable(
  'career_history',
  {
    id: pk(),
    careerId: uuid('career_id')
      .notNull()
      .references(() => careers.id, { onDelete: 'restrict' }),
    eventType: text('event_type', {
      enum: CAREER_HISTORY_EVENT_TYPES,
    }).notNull(),
    /** Relational reference (team/contract/sponsorship id or tier id) for the event. */
    referenceId: text('reference_id'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    occurredAt: ts('occurred_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index('career_history_career_occurred_idx').on(
      t.careerId,
      t.occurredAt.desc(),
      t.id.desc(),
    ),
    check(
      'career_history_event_type_check',
      inList(t.eventType, CAREER_HISTORY_EVENT_TYPES),
    ),
  ],
);

/** Occurrence of a static `career_event.*` definition. Definition content is never copied. */
export const careerEventInstances = pgTable(
  'career_event_instances',
  {
    id: pk(),
    careerId: uuid('career_id')
      .notNull()
      .references(() => careers.id, { onDelete: 'restrict' }),
    eventDefinitionId: text('event_definition_id').notNull(),
    status: text('status', { enum: CAREER_EVENT_STATUSES })
      .notNull()
      .default('pending'),
    selectedChoiceId: text('selected_choice_id'),
    /** careers match count when triggered; lets cooldownMatches be evaluated without replaying history. */
    careerMatchesAtTrigger: integer('career_matches_at_trigger')
      .notNull()
      .default(0),
    triggeredAt: ts('triggered_at').notNull().defaultNow(),
    resolvedAt: ts('resolved_at'),
    /** Effects as applied (historical snapshot; definition may be rebalanced later). */
    effectsSnapshot: jsonb('effects_snapshot').$type<unknown>(),
    gameBalanceVersion: text('game_balance_version').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('career_event_instances_career_status_idx').on(t.careerId, t.status),
    index('career_event_instances_career_def_idx').on(
      t.careerId,
      t.eventDefinitionId,
      t.triggeredAt.desc(),
    ),
    uniqueIndex('career_event_instances_one_pending_uniq')
      .on(t.careerId, t.eventDefinitionId)
      .where(sql`${t.status} = 'pending'`),
    check(
      'career_event_instances_status_check',
      inList(t.status, CAREER_EVENT_STATUSES),
    ),
    check(
      'career_event_instances_definition_check',
      definitionIdIn(t.eventDefinitionId, 'career_event'),
    ),
    check(
      'career_event_instances_resolution_check',
      sql`(${t.status} = 'resolved') = (${t.resolvedAt} IS NOT NULL AND ${t.selectedChoiceId} IS NOT NULL)`,
    ),
    check(
      'career_event_instances_matches_check',
      nonNegative(t.careerMatchesAtTrigger),
    ),
  ],
);

/** Money is integer in-game currency; no floating point anywhere in this table. */
export const contracts = pgTable(
  'contracts',
  {
    id: pk(),
    careerId: uuid('career_id')
      .notNull()
      .references(() => careers.id, { onDelete: 'restrict' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    /** Module 0 `contract.*` id the offer was generated from (nullable for bespoke offers). */
    contractDefinitionId: text('contract_definition_id'),
    status: text('status', { enum: CONTRACT_STATUSES })
      .notNull()
      .default('offered'),
    expectedRole: text('expected_role', { enum: PLAYER_ROLES }).notNull(),
    salaryCoins: bigint('salary_coins', { mode: 'number' }).notNull(),
    matchFeeCoins: bigint('match_fee_coins', { mode: 'number' }).notNull(),
    performanceBonusCoins: bigint('performance_bonus_coins', {
      mode: 'number',
    }).notNull(),
    minimumPerformanceRating: numeric('minimum_performance_rating', {
      precision: 3,
      scale: 1,
    })
      .notNull()
      .default('0.0'),
    durationMatches: integer('duration_matches').notNull(),
    matchesPlayed: integer('matches_played').notNull().default(0),
    /** Extra flexible bonus terms and the definition values at signing time. */
    termsSnapshot: jsonb('terms_snapshot')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    gameBalanceVersion: text('game_balance_version').notNull(),
    offeredAt: ts('offered_at').notNull().defaultNow(),
    signedAt: ts('signed_at'),
    startsAt: ts('starts_at'),
    endsAt: ts('ends_at'),
    terminatedAt: ts('terminated_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('contracts_career_status_idx').on(t.careerId, t.status),
    index('contracts_team_id_idx').on(t.teamId),
    // At most one live contract per career.
    uniqueIndex('contracts_one_active_per_career_uniq')
      .on(t.careerId)
      .where(sql`${t.status} = 'active'`),
    check('contracts_status_check', inList(t.status, CONTRACT_STATUSES)),
    check(
      'contracts_expected_role_check',
      inList(t.expectedRole, PLAYER_ROLES),
    ),
    check('contracts_salary_coins_check', nonNegative(t.salaryCoins)),
    check('contracts_match_fee_coins_check', nonNegative(t.matchFeeCoins)),
    check(
      'contracts_performance_bonus_coins_check',
      nonNegative(t.performanceBonusCoins),
    ),
    check(
      'contracts_min_rating_check',
      range(t.minimumPerformanceRating, 0, LIMITS.performanceRatingMax),
    ),
    check('contracts_duration_matches_check', positive(t.durationMatches)),
    check(
      'contracts_matches_played_check',
      sql`${t.matchesPlayed} >= 0 AND ${t.matchesPlayed} <= ${t.durationMatches}`,
    ),
    check(
      'contracts_definition_check',
      sql`${t.contractDefinitionId} IS NULL OR ${definitionIdIn(t.contractDefinitionId, 'contract')}`,
    ),
    check(
      'contracts_signed_at_check',
      sql`${t.status} NOT IN ('accepted', 'active', 'completed') OR ${t.signedAt} IS NOT NULL`,
    ),
    check(
      'contracts_terminated_at_check',
      iff(sql`${t.status} = 'terminated'`, sql`${t.terminatedAt} IS NOT NULL`),
    ),
    check(
      'contracts_period_check',
      sql`${t.startsAt} IS NULL OR ${t.endsAt} IS NULL OR ${t.endsAt} >= ${t.startsAt}`,
    ),
  ],
);

export const sponsorships = pgTable(
  'sponsorships',
  {
    id: pk(),
    careerId: uuid('career_id')
      .notNull()
      .references(() => careers.id, { onDelete: 'restrict' }),
    sponsorDefinitionId: text('sponsor_definition_id').notNull(),
    status: text('status', { enum: SPONSORSHIP_STATUSES })
      .notNull()
      .default('offered'),
    payoutCurrency: text('payout_currency', { enum: CURRENCIES }).notNull(),
    payoutAmount: bigint('payout_amount', { mode: 'number' }).notNull(),
    /** Objectives and payout as agreed (definition may change later). */
    rewardConfigSnapshot: jsonb('reward_config_snapshot')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    objectiveProgress: jsonb('objective_progress')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    gameBalanceVersion: text('game_balance_version').notNull(),
    offeredAt: ts('offered_at').notNull().defaultNow(),
    acceptedAt: ts('accepted_at'),
    startsAt: ts('starts_at'),
    endsAt: ts('ends_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('sponsorships_career_status_idx').on(t.careerId, t.status),
    uniqueIndex('sponsorships_one_live_per_sponsor_uniq')
      .on(t.careerId, t.sponsorDefinitionId)
      .where(sql`${t.status} IN ('offered', 'active')`),
    check('sponsorships_status_check', inList(t.status, SPONSORSHIP_STATUSES)),
    check('sponsorships_currency_check', inList(t.payoutCurrency, CURRENCIES)),
    check('sponsorships_payout_amount_check', nonNegative(t.payoutAmount)),
    check(
      'sponsorships_definition_check',
      definitionIdIn(t.sponsorDefinitionId, 'sponsor'),
    ),
    check(
      'sponsorships_accepted_at_check',
      sql`${t.status} NOT IN ('active', 'completed') OR ${t.acceptedAt} IS NOT NULL`,
    ),
    check(
      'sponsorships_period_check',
      sql`${t.startsAt} IS NULL OR ${t.endsAt} IS NULL OR ${t.endsAt} >= ${t.startsAt}`,
    ),
  ],
);
