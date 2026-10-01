import type {
  BattingHand,
  BowlingStyle,
  CareerTierId,
  ContactQuality,
  CurrencyCode,
  DeliveryLength,
  DeliveryLine,
  DismissalType,
  EquipmentSlot,
  ExtraType,
  PlayerRole,
} from '@the-cricketer/game-core';

/**
 * Enum policy: statuses are `text` columns guarded by CHECK constraints generated from
 * these lists, not PostgreSQL ENUM types. Adding a value is then a plain
 * DROP/ADD CONSTRAINT migration (no ALTER TYPE ordering/transaction limits), and Drizzle
 * types stay string unions. Static game IDs (item.*, team.*, ...) are never enums.
 *
 * `Covers` fails compilation if a Module 0 union gains a member the list does not have.
 */
type Covers<Union extends string, List extends readonly string[]> =
  Exclude<Union, List[number]> extends never ? true : false;
type AllTrue<T extends readonly true[]> = T;

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const USER_ORIGINS = ['organic', 'development', 'test'] as const;
export type UserOrigin = (typeof USER_ORIGINS)[number];
/** Stable account types. Login methods (email, Google, Apple) live in auth_identities instead. */
export const ACCOUNT_TYPES = ['guest', 'registered'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
/** `guest` is deliberately absent: a guest has no login credential, only a session. */
export const AUTH_PROVIDERS = ['email_password', 'google', 'apple'] as const;
export type AuthProviderId = (typeof AUTH_PROVIDERS)[number];
export const AUTH_TOKEN_PURPOSES = [
  'email_verification',
  'password_reset',
] as const;
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];
export const SESSION_REVOKE_REASONS = [
  'logout',
  'logout_all',
  'rotated',
  'upgraded',
  'password_changed',
  'password_reset',
  'suspended',
  'admin',
] as const;
export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number];

export const BATTING_HANDS = [
  'right',
  'left',
] as const satisfies readonly BattingHand[];
export const BOWLING_STYLES = [
  'right_arm_fast',
  'left_arm_fast',
  'right_arm_medium',
  'left_arm_medium',
  'off_spin',
  'leg_spin',
  'left_arm_orthodox',
  'left_arm_wrist_spin',
] as const satisfies readonly BowlingStyle[];
export const PLAYER_ROLES = [
  'opening_batter',
  'top_order_batter',
  'middle_order_batter',
  'finisher',
  'wicketkeeper_batter',
  'batting_all_rounder',
  'bowling_all_rounder',
  'fast_bowler',
  'swing_bowler',
  'spin_bowler',
] as const satisfies readonly PlayerRole[];
export const CAREER_TIERS = [
  'academy',
  'club',
  'district',
  'domestic',
  'franchise',
  'international',
] as const satisfies readonly CareerTierId[];
export const CURRENCIES = [
  'coins',
  'gems',
] as const satisfies readonly CurrencyCode[];
export const EQUIPMENT_SLOTS = [
  'bat',
  'helmet',
  'gloves',
  'pads',
  'shoes',
  'jersey',
  'pants',
  'wristband',
  'arm_guard',
  'glasses',
  'chain',
  'bat_grip',
  'bat_sticker',
] as const satisfies readonly EquipmentSlot[];
export const DELIVERY_LINES = [
  'wide_off',
  'outside_off',
  'off_stump',
  'middle',
  'leg',
  'wide_leg',
] as const satisfies readonly DeliveryLine[];
export const DELIVERY_LENGTHS = [
  'yorker',
  'full',
  'good',
  'short',
  'bouncer',
] as const satisfies readonly DeliveryLength[];
export const CONTACT_QUALITIES = [
  'perfect',
  'good',
  'okay',
  'poor',
  'edge',
  'miss',
] as const satisfies readonly ContactQuality[];
export const DISMISSAL_TYPES = [
  'bowled',
  'caught',
  'lbw',
  'run_out',
  'stumped',
  'hit_wicket',
] as const satisfies readonly DismissalType[];
export const EXTRA_TYPES = [
  'wide',
  'no_ball',
  'bye',
  'leg_bye',
] as const satisfies readonly ExtraType[];

/** Compile-time proof that each list covers its Module 0 union (fails to compile otherwise). */
export type EnumCoverageChecks = AllTrue<
  [
    Covers<BattingHand, typeof BATTING_HANDS>,
    Covers<BowlingStyle, typeof BOWLING_STYLES>,
    Covers<PlayerRole, typeof PLAYER_ROLES>,
    Covers<CareerTierId, typeof CAREER_TIERS>,
    Covers<CurrencyCode, typeof CURRENCIES>,
    Covers<EquipmentSlot, typeof EQUIPMENT_SLOTS>,
    Covers<DeliveryLine, typeof DELIVERY_LINES>,
    Covers<DeliveryLength, typeof DELIVERY_LENGTHS>,
    Covers<ContactQuality, typeof CONTACT_QUALITIES>,
    Covers<DismissalType, typeof DISMISSAL_TYPES>,
    Covers<ExtraType, typeof EXTRA_TYPES>,
  ]
>;

/** Module 0 attribute keys, in "group.key" form as used by training grants / ROLE_WEIGHTS. */
export const BATTING_ATTRIBUTES = [
  'timing',
  'power',
  'placement',
  'defence',
  'footwork',
  'shotSelection',
  'technique',
  'consistency',
] as const;
export const BOWLING_ATTRIBUTES = [
  'pace',
  'accuracy',
  'swing',
  'seam',
  'spin',
  'control',
  'variation',
  'consistency',
] as const;
export const PHYSICAL_ATTRIBUTES = [
  'strength',
  'stamina',
  'fitness',
  'reflex',
  'agility',
  'recovery',
] as const;
export const PERSONALITY_ATTRIBUTES = [
  'confidence',
  'discipline',
  'leadership',
  'professionalism',
  'riskAppetite',
  'teamMindset',
] as const;
/** Trainable skills (Module 0 training grants only target these three groups). */
export const SKILL_STAT_KEYS = [
  'batting.timing',
  'batting.power',
  'batting.placement',
  'batting.defence',
  'batting.footwork',
  'batting.shotSelection',
  'batting.technique',
  'batting.consistency',
  'bowling.pace',
  'bowling.accuracy',
  'bowling.swing',
  'bowling.seam',
  'bowling.spin',
  'bowling.control',
  'bowling.variation',
  'bowling.consistency',
  'physical.strength',
  'physical.stamina',
  'physical.fitness',
  'physical.reflex',
  'physical.agility',
  'physical.recovery',
] as const;
export type SkillStatKey = (typeof SKILL_STAT_KEYS)[number];

export const CAREER_STATUSES = ['active', 'retired', 'abandoned'] as const;
export type CareerStatus = (typeof CAREER_STATUSES)[number];
export const CAREER_HISTORY_EVENT_TYPES = [
  'career_started',
  'team_joined',
  'team_left',
  'tier_promoted',
  'tier_demoted',
  'contract_signed',
  'contract_ended',
  'sponsorship_signed',
  'captaincy_awarded',
  'international_selected',
  'season_started',
  'retired',
] as const;
export type CareerHistoryEventType =
  (typeof CAREER_HISTORY_EVENT_TYPES)[number];
export const CAREER_EVENT_STATUSES = [
  'pending',
  'resolved',
  'expired',
  'dismissed',
] as const;
export type CareerEventStatus = (typeof CAREER_EVENT_STATUSES)[number];
export const CONTRACT_STATUSES = [
  'offered',
  'accepted',
  'active',
  'completed',
  'terminated',
  'expired',
  'rejected',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const SPONSORSHIP_STATUSES = [
  'offered',
  'active',
  'completed',
  'terminated',
  'expired',
  'rejected',
] as const;
export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number];

export const MEMBERSHIP_ROLES = ['player', 'captain', 'vice_captain'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export const MEMBERSHIP_STATUSES = ['active', 'ended'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export const FIXTURE_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'postponed',
] as const;
export type FixtureStatus = (typeof FIXTURE_STATUSES)[number];

/** Who/what the match is played as. Human-vs-AI is expressed by participant_type, not mode. */
export const MATCH_MODES = [
  'career',
  'friendly',
  'ranked',
  'tournament',
] as const;
export type MatchMode = (typeof MATCH_MODES)[number];
export const MATCH_STATUSES = [
  'created',
  'ready',
  'in_progress',
  'completed',
  'abandoned',
  'cancelled',
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export const MATCH_RESULT_TYPES = [
  'win',
  'tie',
  'no_result',
  'abandoned',
] as const;
export type MatchResultType = (typeof MATCH_RESULT_TYPES)[number];
export const PARTICIPANT_TYPES = ['human', 'ai'] as const;
export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];
export const INNINGS_STATUSES = [
  'pending',
  'in_progress',
  'completed',
] as const;
export type InningsStatus = (typeof INNINGS_STATUSES)[number];

/** Allowed forward transitions; repositories apply them as compare-and-set updates. */
export const MATCH_TRANSITIONS: Readonly<
  Record<MatchStatus, readonly MatchStatus[]>
> = {
  created: ['ready', 'in_progress', 'cancelled'],
  ready: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'abandoned'],
  completed: [],
  abandoned: [],
  cancelled: [],
};
export const CONTRACT_TRANSITIONS: Readonly<
  Record<ContractStatus, readonly ContractStatus[]>
> = {
  offered: ['accepted', 'rejected', 'expired'],
  accepted: ['active', 'terminated'],
  active: ['completed', 'terminated', 'expired'],
  completed: [],
  terminated: [],
  expired: [],
  rejected: [],
};
export const SPONSORSHIP_TRANSITIONS: Readonly<
  Record<SponsorshipStatus, readonly SponsorshipStatus[]>
> = {
  offered: ['active', 'rejected', 'expired'],
  active: ['completed', 'terminated', 'expired'],
  completed: [],
  terminated: [],
  expired: [],
  rejected: [],
};

export const TRAINING_STATUSES = ['started', 'completed', 'cancelled'] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export const INVENTORY_STATUSES = [
  'active',
  'sold',
  'consumed',
  'removed',
] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];
/** Module 0 sources plus the monetisation/ops sources named for Module 2. */
export const ACQUISITION_SOURCES = [
  'starter',
  'shop',
  'reward',
  'achievement',
  'contract',
  'sponsor',
  'premium_purchase',
  'admin_grant',
  'promotion',
] as const;
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

export const WALLET_TRANSACTION_TYPES = [
  'starter_grant',
  'match_reward',
  'training_cost',
  'item_purchase',
  'item_sale',
  'item_upgrade',
  'achievement_reward',
  'career_event_reward',
  'contract_payment',
  'sponsor_payout',
  'admin_adjustment',
] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const REWARD_SOURCE_TYPES = [
  'match',
  'achievement',
  'career_event',
  'contract',
  'sponsorship',
  'training',
  'starter',
  'admin',
] as const;
export type RewardSourceType = (typeof REWARD_SOURCE_TYPES)[number];
export const REWARD_GRANT_STATUSES = ['granted', 'reversed'] as const;
export type RewardGrantStatus = (typeof REWARD_GRANT_STATUSES)[number];

export const STAT_SCOPE_TYPES = [
  'career',
  'season',
  'competition',
  'format',
] as const;
export type StatScopeType = (typeof STAT_SCOPE_TYPES)[number];
/** scope_id used for the all-time row (part of the primary key, so never NULL). */
export const CAREER_SCOPE_ID = 'all';

export const AUDIT_ACTOR_TYPES = [
  'system',
  'admin',
  'service',
  'user',
] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/** Stable-format checks for static definition IDs (see docs/game-design/16). */
export const DEFINITION_ID_PATTERN = '^[a-z0-9_]+(\\.[a-z0-9_]+)+$';
