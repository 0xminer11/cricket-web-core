import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  BATTING_HANDS,
  BOWLING_STYLES,
  PLAYER_ROLES,
  SKILL_STAT_KEYS,
  STAT_SCOPE_TYPES,
} from '../enums';
import { LIMITS } from '../limits';
import {
  createdAt,
  definitionId,
  inList,
  nonNegative,
  pk,
  range,
  ts,
  updatedAt,
} from './helpers';
import { users } from './identity';

const statRange = (table: string, columns: readonly AnyPgColumn[]) =>
  columns.map((c) =>
    check(`${table}_${c.name}_range`, range(c, LIMITS.statMin, LIMITS.statMax)),
  );
const stat = (name: string) => smallint(name).notNull();

/**
 * One cricketer per user for the MVP (unique user_id). Dropping that unique index is the only
 * schema change needed for multiple profiles. The career link lives on careers.player_id
 * (avoids a profile<->career cycle).
 */
export const playerProfiles = pgTable(
  'player_profiles',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    displayName: text('display_name').notNull(),
    countryCode: text('country_code').notNull(),
    jerseyNumber: smallint('jersey_number').notNull(),
    battingHand: text('batting_hand', { enum: BATTING_HANDS }).notNull(),
    primaryRole: text('primary_role', { enum: PLAYER_ROLES }).notNull(),
    secondaryRoles: text('secondary_roles', { enum: PLAYER_ROLES })
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    bowlingStyle: text('bowling_style', { enum: BOWLING_STYLES }),
    /** Client idempotency key of the creation request (retry/replay detection). Null for seeded rows. */
    creationKey: text('creation_key'),
    /** SHA-256 of the canonical creation request, to tell a true replay from a reused key. */
    creationRequestHash: text('creation_request_hash'),
    /** game_balance_version in force when the cricketer was created (analytics/audit). */
    creationBalanceVersion: text('creation_balance_version'),
    /** Personality archetype picked at creation (history only; live traits are in player_personality). */
    starterPersonalityId: text('starter_personality_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('player_profiles_user_id_uniq').on(t.userId),
    check(
      'player_profiles_display_name_check',
      sql`${t.displayName} = btrim(${t.displayName}) AND char_length(${t.displayName}) BETWEEN ${sql.raw(String(LIMITS.displayNameMin))} AND ${sql.raw(String(LIMITS.displayNameMax))}`,
    ),
    check(
      'player_profiles_country_code_check',
      sql`${t.countryCode} ~ '^[A-Z]{2}$'`,
    ),
    check(
      'player_profiles_jersey_number_check',
      range(t.jerseyNumber, LIMITS.jerseyMin, LIMITS.jerseyMax),
    ),
    check(
      'player_profiles_batting_hand_check',
      inList(t.battingHand, BATTING_HANDS),
    ),
    check(
      'player_profiles_primary_role_check',
      inList(t.primaryRole, PLAYER_ROLES),
    ),
    check(
      'player_profiles_secondary_roles_check',
      sql`${t.secondaryRoles} <@ ARRAY[${sql.raw(PLAYER_ROLES.map((r) => `'${r}'`).join(', '))}]::text[]`,
    ),
    check(
      'player_profiles_creation_key_check',
      sql`(${t.creationKey} IS NULL) = (${t.creationRequestHash} IS NULL) AND (${t.creationKey} IS NULL OR ${t.creationKey} ~ '^[A-Za-z0-9_-]{16,128}$') AND (${t.creationRequestHash} IS NULL OR ${t.creationRequestHash} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      'player_profiles_starter_personality_check',
      sql`${t.starterPersonalityId} IS NULL OR ${definitionId(t.starterPersonalityId)}`,
    ),
    check(
      'player_profiles_bowling_style_check',
      sql`${t.bowlingStyle} IS NULL OR ${inList(t.bowlingStyle, BOWLING_STYLES)}`,
    ),
  ],
);

/** Cosmetic selections as references into (future) customisation definitions. No binary data. */
export const playerAppearance = pgTable(
  'player_appearance',
  {
    playerId: uuid('player_id')
      .primaryKey()
      .references(() => playerProfiles.id, { onDelete: 'cascade' }),
    bodyPresetId: text('body_preset_id').notNull(),
    facePresetId: text('face_preset_id').notNull(),
    skinToneId: text('skin_tone_id').notNull(),
    hairStyleId: text('hair_style_id').notNull(),
    hairColorId: text('hair_color_id').notNull(),
    beardStyleId: text('beard_style_id'),
    heightScale: numeric('height_scale', { precision: 4, scale: 3 })
      .notNull()
      .default('1.000'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'player_appearance_height_scale_check',
      sql`${t.heightScale} BETWEEN 0.850 AND 1.150`,
    ),
    ...[
      t.bodyPresetId,
      t.facePresetId,
      t.skinToneId,
      t.hairStyleId,
      t.hairColorId,
    ].map((c) => check(`player_appearance_${c.name}_check`, definitionId(c))),
    check(
      'player_appearance_beard_style_id_check',
      sql`${t.beardStyleId} IS NULL OR ${definitionId(t.beardStyleId)}`,
    ),
  ],
);

/** Current base attributes. Typed columns (not EAV): fixed Module 0 set, cheap reads, CHECK-guarded. */
export const playerAttributes = pgTable(
  'player_attributes',
  {
    playerId: uuid('player_id')
      .primaryKey()
      .references(() => playerProfiles.id, { onDelete: 'cascade' }),
    battingTiming: stat('batting_timing'),
    battingPower: stat('batting_power'),
    battingPlacement: stat('batting_placement'),
    battingDefence: stat('batting_defence'),
    battingFootwork: stat('batting_footwork'),
    battingShotSelection: stat('batting_shot_selection'),
    battingTechnique: stat('batting_technique'),
    battingConsistency: stat('batting_consistency'),
    bowlingPace: stat('bowling_pace'),
    bowlingAccuracy: stat('bowling_accuracy'),
    bowlingSwing: stat('bowling_swing'),
    bowlingSeam: stat('bowling_seam'),
    bowlingSpin: stat('bowling_spin'),
    bowlingControl: stat('bowling_control'),
    bowlingVariation: stat('bowling_variation'),
    bowlingConsistency: stat('bowling_consistency'),
    physicalStrength: stat('physical_strength'),
    physicalStamina: stat('physical_stamina'),
    physicalFitness: stat('physical_fitness'),
    physicalReflex: stat('physical_reflex'),
    physicalAgility: stat('physical_agility'),
    physicalRecovery: stat('physical_recovery'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) =>
    statRange('player_attributes', [
      t.battingTiming,
      t.battingPower,
      t.battingPlacement,
      t.battingDefence,
      t.battingFootwork,
      t.battingShotSelection,
      t.battingTechnique,
      t.battingConsistency,
      t.bowlingPace,
      t.bowlingAccuracy,
      t.bowlingSwing,
      t.bowlingSeam,
      t.bowlingSpin,
      t.bowlingControl,
      t.bowlingVariation,
      t.bowlingConsistency,
      t.physicalStrength,
      t.physicalStamina,
      t.physicalFitness,
      t.physicalReflex,
      t.physicalAgility,
      t.physicalRecovery,
    ]),
);

export const playerPersonality = pgTable(
  'player_personality',
  {
    playerId: uuid('player_id')
      .primaryKey()
      .references(() => playerProfiles.id, { onDelete: 'cascade' }),
    confidence: stat('confidence'),
    discipline: stat('discipline'),
    leadership: stat('leadership'),
    professionalism: stat('professionalism'),
    riskAppetite: stat('risk_appetite'),
    teamMindset: stat('team_mindset'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) =>
    statRange('player_personality', [
      t.confidence,
      t.discipline,
      t.leadership,
      t.professionalism,
      t.riskAppetite,
      t.teamMindset,
    ]),
);

/**
 * Current progression state: level/XP, form, fatigue. Fans, reputation and selector interest are
 * career-bound and live on careers. Recent performance ratings are derived from
 * match_participants.performance_rating instead of being duplicated here.
 * row_version supports compare-and-set for read-modify-write flows (level-ups).
 */
export const playerState = pgTable(
  'player_state',
  {
    playerId: uuid('player_id')
      .primaryKey()
      .references(() => playerProfiles.id, { onDelete: 'cascade' }),
    level: smallint('level').notNull().default(LIMITS.levelMin),
    /** XP toward the next level (resets on level-up, following the Module 0 level curve). */
    currentXp: bigint('current_xp', { mode: 'number' }).notNull().default(0),
    /** Monotonic total ever earned; never decreases. */
    lifetimeXp: bigint('lifetime_xp', { mode: 'number' }).notNull().default(0),
    form: smallint('form').notNull().default(50),
    formUpdatedAt: ts('form_updated_at'),
    fatigue: smallint('fatigue').notNull().default(0),
    rowVersion: integer('row_version').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'player_state_level_check',
      range(t.level, LIMITS.levelMin, LIMITS.levelCap),
    ),
    check('player_state_current_xp_check', nonNegative(t.currentXp)),
    check('player_state_lifetime_xp_check', nonNegative(t.lifetimeXp)),
    check(
      'player_state_lifetime_ge_current_check',
      sql`${t.lifetimeXp} >= ${t.currentXp}`,
    ),
    check(
      'player_state_form_check',
      range(t.form, LIMITS.formMin, LIMITS.formMax),
    ),
    check(
      'player_state_fatigue_check',
      range(t.fatigue, LIMITS.fatigueMin, LIMITS.fatigueMax),
    ),
  ],
);

/**
 * Sparse per-skill XP toward the next point. Row exists only once a skill has earned XP.
 * xpToNextPoint is derived from the current stat (skillXpToNextPoint) and is not stored.
 */
export const playerSkillProgress = pgTable(
  'player_skill_progress',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => playerProfiles.id, { onDelete: 'cascade' }),
    statKey: text('stat_key', { enum: SKILL_STAT_KEYS }).notNull(),
    skillXp: integer('skill_xp').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({
      name: 'player_skill_progress_pk',
      columns: [t.playerId, t.statKey],
    }),
    check(
      'player_skill_progress_stat_key_check',
      inList(t.statKey, SKILL_STAT_KEYS),
    ),
    check('player_skill_progress_skill_xp_check', nonNegative(t.skillXp)),
  ],
);

/**
 * Aggregate counters per (player, scope). Averages/strike rate/economy are derived
 * (see stats-derivations.ts). scope_type/scope_id: career/'all', season/'<n>',
 * format/'format.5_over', competition/'<competition id>'. scope_id is never NULL so the
 * composite primary key works.
 */
export const playerStats = pgTable(
  'player_stats',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => playerProfiles.id, { onDelete: 'restrict' }),
    scopeType: text('scope_type', { enum: STAT_SCOPE_TYPES }).notNull(),
    scopeId: text('scope_id').notNull().default('all'),
    matches: integer('matches').notNull().default(0),
    matchesWon: integer('matches_won').notNull().default(0),
    inningsBatted: integer('innings_batted').notNull().default(0),
    runs: integer('runs').notNull().default(0),
    ballsFaced: integer('balls_faced').notNull().default(0),
    fours: integer('fours').notNull().default(0),
    sixes: integer('sixes').notNull().default(0),
    fifties: integer('fifties').notNull().default(0),
    hundreds: integer('hundreds').notNull().default(0),
    highestScore: integer('highest_score').notNull().default(0),
    notOuts: integer('not_outs').notNull().default(0),
    ballsBowled: integer('balls_bowled').notNull().default(0),
    runsConceded: integer('runs_conceded').notNull().default(0),
    wickets: integer('wickets').notNull().default(0),
    maidens: integer('maidens').notNull().default(0),
    bestBowlingWickets: integer('best_bowling_wickets').notNull().default(0),
    bestBowlingRuns: integer('best_bowling_runs').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({
      name: 'player_stats_pk',
      columns: [t.playerId, t.scopeType, t.scopeId],
    }),
    check(
      'player_stats_scope_type_check',
      inList(t.scopeType, STAT_SCOPE_TYPES),
    ),
    check(
      'player_stats_scope_id_check',
      sql`char_length(${t.scopeId}) BETWEEN 1 AND 80`,
    ),
    ...[
      t.matches,
      t.matchesWon,
      t.inningsBatted,
      t.runs,
      t.ballsFaced,
      t.fours,
      t.sixes,
      t.fifties,
      t.hundreds,
      t.highestScore,
      t.notOuts,
      t.ballsBowled,
      t.runsConceded,
      t.wickets,
      t.maidens,
      t.bestBowlingWickets,
      t.bestBowlingRuns,
    ].map((c) => check(`player_stats_${c.name}_check`, nonNegative(c))),
    check(
      'player_stats_won_le_matches_check',
      sql`${t.matchesWon} <= ${t.matches}`,
    ),
    check(
      'player_stats_not_outs_le_innings_check',
      sql`${t.notOuts} <= ${t.inningsBatted}`,
    ),
    check(
      'player_stats_highest_le_runs_check',
      sql`${t.highestScore} <= ${t.runs}`,
    ),
  ],
);
