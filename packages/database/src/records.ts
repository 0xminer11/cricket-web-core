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
  PlayerAttributes,
  PlayerRole,
} from '@the-cricketer/game-core';
import type {
  AcquisitionSource,
  CareerEventStatus,
  CareerHistoryEventType,
  CareerStatus,
  ContractStatus,
  FixtureStatus,
  InningsStatus,
  InventoryStatus,
  MatchMode,
  MatchResultType,
  MatchStatus,
  MembershipRole,
  MembershipStatus,
  ParticipantType,
  RewardGrantStatus,
  RewardSourceType,
  SkillStatKey,
  SponsorshipStatus,
  StatScopeType,
  TrainingStatus,
  UserOrigin,
  UserStatus,
  WalletTransactionType,
} from './enums';

/**
 * Persistence DTOs returned by repositories. They are plain objects independent of Drizzle's
 * inferred row types, so the ORM never leaks past this package. Money/XP/counters are JS
 * numbers (safe-integer range is enforced on write); timestamps are Dates in UTC.
 */
export interface UserRecord {
  readonly id: string;
  readonly status: UserStatus;
  readonly origin: UserOrigin;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastSeenAt: Date | null;
  readonly deletedAt: Date | null;
}

export interface PlayerProfileRecord {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly countryCode: string;
  readonly jerseyNumber: number;
  readonly battingHand: BattingHand;
  readonly primaryRole: PlayerRole;
  readonly secondaryRoles: readonly PlayerRole[];
  readonly bowlingStyle: BowlingStyle | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PlayerAppearanceRecord {
  readonly playerId: string;
  readonly bodyPresetId: string;
  readonly facePresetId: string;
  readonly skinToneId: string;
  readonly hairStyleId: string;
  readonly hairColorId: string;
  readonly beardStyleId: string | null;
  readonly heightScale: number;
}

export interface PlayerStateRecord {
  readonly playerId: string;
  readonly level: number;
  readonly currentXp: number;
  readonly lifetimeXp: number;
  readonly form: number;
  readonly formUpdatedAt: Date | null;
  readonly fatigue: number;
  readonly rowVersion: number;
  readonly updatedAt: Date;
}

export interface SkillProgressRecord {
  readonly statKey: SkillStatKey;
  readonly skillXp: number;
}

export interface PlayerStatsRecord {
  readonly playerId: string;
  readonly scopeType: StatScopeType;
  readonly scopeId: string;
  readonly matches: number;
  readonly matchesWon: number;
  readonly inningsBatted: number;
  readonly runs: number;
  readonly ballsFaced: number;
  readonly fours: number;
  readonly sixes: number;
  readonly fifties: number;
  readonly hundreds: number;
  readonly highestScore: number;
  readonly notOuts: number;
  readonly ballsBowled: number;
  readonly runsConceded: number;
  readonly wickets: number;
  readonly maidens: number;
  readonly bestBowlingWickets: number;
  readonly bestBowlingRuns: number;
}

export interface CareerRecord {
  readonly id: string;
  readonly playerId: string;
  readonly currentTier: CareerTierId;
  readonly currentTeamId: string | null;
  readonly seasonNumber: number;
  readonly careerStatus: CareerStatus;
  readonly reputation: number;
  readonly selectorInterest: number;
  readonly fans: number;
  readonly rowVersion: number;
  readonly startedAt: Date;
  readonly retiredAt: Date | null;
}

export interface CareerHistoryRecord {
  readonly id: string;
  readonly careerId: string;
  readonly eventType: CareerHistoryEventType;
  readonly referenceId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly occurredAt: Date;
  readonly createdAt: Date;
}

export interface CareerEventInstanceRecord {
  readonly id: string;
  readonly careerId: string;
  readonly eventDefinitionId: string;
  readonly status: CareerEventStatus;
  readonly selectedChoiceId: string | null;
  readonly careerMatchesAtTrigger: number;
  readonly triggeredAt: Date;
  readonly resolvedAt: Date | null;
  readonly effectsSnapshot: unknown;
  readonly gameBalanceVersion: string;
}

export interface ContractRecord {
  readonly id: string;
  readonly careerId: string;
  readonly teamId: string;
  readonly contractDefinitionId: string | null;
  readonly status: ContractStatus;
  readonly expectedRole: PlayerRole;
  readonly salaryCoins: number;
  readonly matchFeeCoins: number;
  readonly performanceBonusCoins: number;
  readonly minimumPerformanceRating: number;
  readonly durationMatches: number;
  readonly matchesPlayed: number;
  readonly termsSnapshot: Record<string, unknown>;
  readonly gameBalanceVersion: string;
  readonly offeredAt: Date;
  readonly signedAt: Date | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly terminatedAt: Date | null;
}

export interface SponsorshipRecord {
  readonly id: string;
  readonly careerId: string;
  readonly sponsorDefinitionId: string;
  readonly status: SponsorshipStatus;
  readonly payoutCurrency: CurrencyCode;
  readonly payoutAmount: number;
  readonly rewardConfigSnapshot: Record<string, unknown>;
  readonly objectiveProgress: Record<string, number>;
  readonly gameBalanceVersion: string;
  readonly offeredAt: Date;
  readonly acceptedAt: Date | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
}

export interface TeamRecord {
  readonly id: string;
  readonly definitionId: string;
  readonly nameOverride: string | null;
  readonly active: boolean;
}

export interface TeamMembershipRecord {
  readonly id: string;
  readonly playerId: string;
  readonly teamId: string;
  readonly role: MembershipRole;
  readonly shirtNumber: number | null;
  readonly status: MembershipStatus;
  readonly joinedAt: Date;
  readonly leftAt: Date | null;
}

export interface FixtureRecord {
  readonly id: string;
  readonly careerId: string | null;
  readonly competitionDefinitionId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly matchFormatId: string;
  readonly scheduledAt: Date;
  readonly status: FixtureStatus;
  readonly seasonNumber: number;
  readonly round: number;
}

export interface MatchRecord {
  readonly id: string;
  readonly fixtureId: string | null;
  readonly matchMode: MatchMode;
  readonly matchFormatId: string;
  readonly pitchDefinitionId: string;
  readonly matchEngineVersion: string;
  readonly gameBalanceVersion: string;
  readonly dataSchemaVersion: number;
  readonly rngSeed: string | null;
  readonly rngAlgorithmVersion: string | null;
  readonly status: MatchStatus;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly winnerTeamId: string | null;
  readonly resultType: MatchResultType | null;
  readonly resultSummary: string | null;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
}

export interface MatchParticipantRecord {
  readonly id: string;
  readonly matchId: string;
  readonly teamId: string;
  readonly playerId: string | null;
  readonly participantType: ParticipantType;
  readonly battingPosition: number | null;
  readonly selectedRole: PlayerRole | null;
  readonly displayNameSnapshot: string;
  readonly overallSnapshot: number | null;
  readonly performanceRating: number | null;
}

export interface InningsRecord {
  readonly id: string;
  readonly matchId: string;
  readonly inningsNumber: number;
  readonly battingTeamId: string;
  readonly bowlingTeamId: string;
  readonly isSuperOver: boolean;
  readonly runs: number;
  readonly wickets: number;
  readonly legalBalls: number;
  readonly extras: number;
  readonly target: number | null;
  readonly status: InningsStatus;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
}

export interface OverRecord {
  readonly id: string;
  readonly inningsId: string;
  readonly overNumber: number;
  readonly bowlerParticipantId: string;
  readonly runs: number;
  readonly wickets: number;
  readonly legalBalls: number;
  readonly completedAt: Date | null;
}

export interface BallRecord {
  readonly id: number;
  readonly matchId: string;
  readonly inningsId: string;
  readonly overId: string;
  readonly sequenceNumber: number;
  readonly overNumber: number;
  readonly ballInOver: number;
  readonly strikerParticipantId: string;
  readonly nonStrikerParticipantId: string;
  readonly bowlerParticipantId: string;
  readonly deliveryDefinitionId: string;
  readonly shotDefinitionId: string | null;
  readonly line: DeliveryLine;
  readonly length: DeliveryLength;
  readonly runsOffBat: number;
  readonly extras: number;
  readonly extraType: ExtraType | null;
  readonly wicket: boolean;
  readonly wicketType: DismissalType | null;
  readonly dismissedParticipantId: string | null;
  readonly legalDelivery: boolean;
  readonly contactQuality: ContactQuality | null;
  readonly ballSpeed: number | null;
}

export interface MatchSummary {
  readonly match: MatchRecord;
  readonly participants: readonly MatchParticipantRecord[];
  readonly innings: readonly InningsRecord[];
}

export interface MatchHistoryEntry {
  readonly matchId: string;
  readonly participantId: string;
  readonly playerTeamId: string;
  readonly opponentTeamId: string;
  readonly matchFormatId: string;
  readonly matchMode: MatchMode;
  readonly status: MatchStatus;
  readonly resultType: MatchResultType | null;
  readonly won: boolean | null;
  readonly performanceRating: number | null;
  readonly scores: readonly {
    readonly teamId: string;
    readonly runs: number;
    readonly wickets: number;
    readonly legalBalls: number;
  }[];
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

export interface InventoryItemRecord {
  readonly id: string;
  readonly playerId: string;
  readonly itemDefinitionId: string;
  readonly upgradeLevel: number;
  readonly quantity: number;
  readonly status: InventoryStatus;
  readonly acquisitionSource: AcquisitionSource;
  readonly acquiredAt: Date;
  readonly metadata: Record<string, unknown> | null;
}

export interface EquippedItemRecord {
  readonly playerId: string;
  readonly equipmentSlot: EquipmentSlot;
  readonly inventoryItemId: string;
  readonly itemDefinitionId: string;
  readonly equippedAt: Date;
}

export interface WalletBalanceRecord {
  readonly currencyType: CurrencyCode;
  readonly balance: number;
}

export interface WalletTransactionRecord {
  readonly id: string;
  readonly playerId: string;
  readonly currencyType: CurrencyCode;
  readonly amount: number;
  readonly balanceBefore: number;
  readonly balanceAfter: number;
  readonly transactionType: WalletTransactionType;
  readonly referenceType: string;
  readonly referenceId: string;
  readonly idempotencyKey: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface RewardGrantRecord {
  readonly id: string;
  readonly playerId: string;
  readonly sourceType: RewardSourceType;
  readonly sourceId: string;
  readonly rewardDefinitionId: string | null;
  readonly status: RewardGrantStatus;
  readonly idempotencyKey: string;
  readonly payloadSnapshot: Record<string, unknown>;
  readonly gameBalanceVersion: string;
  readonly grantedAt: Date;
}

export interface TrainingSessionRecord {
  readonly id: string;
  readonly playerId: string;
  readonly trainingDefinitionId: string;
  readonly status: TrainingStatus;
  readonly costCurrency: CurrencyCode;
  readonly costAmount: number;
  readonly xpAwarded: number;
  readonly fatigueAdded: number;
  readonly outcome: unknown;
  readonly walletTransactionId: string | null;
  readonly gameBalanceVersion: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

export interface AchievementRecord {
  readonly playerId: string;
  readonly achievementDefinitionId: string;
  readonly progress: number;
  readonly completed: boolean;
  readonly completedAt: Date | null;
  readonly rewardClaimed: boolean;
  readonly rewardClaimedAt: Date | null;
}

export interface AuditLogRecord {
  readonly id: string;
  readonly actorType: 'system' | 'admin' | 'service';
  readonly actorId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly requestId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface GameVersionRecord {
  readonly id: string;
  readonly gameBalanceVersion: string;
  readonly matchEngineVersion: string;
  readonly dataSchemaVersion: number;
  readonly activatedAt: Date;
  readonly notes: string | null;
}

/** Single-read view for the future career dashboard (constant number of queries). */
export interface PlayerDashboard {
  readonly profile: PlayerProfileRecord;
  readonly state: PlayerStateRecord;
  readonly career: CareerRecord | null;
  readonly currentTeam: TeamRecord | null;
  readonly balances: readonly WalletBalanceRecord[];
  readonly equipped: readonly EquippedItemRecord[];
}

export type { PlayerAttributes };
