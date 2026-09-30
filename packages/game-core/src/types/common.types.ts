export type IsoDateTime = string;
export type StatValue = number; // validated integer 1..100
export type Percentage01 = number; // validated 0..1
export type NonNegativeInt = number;

export type AssetId = `asset.${string}`;
export type TeamId = `team.${string}`;
export type ItemId = `item.${string}`;
export type ShotId = `shot.${string}`;
export type DeliveryId = `delivery.${string}`;
export type PitchId = `pitch.${string}`;
export type TrainingId = `training.${string}`;
export type CareerEventId = `career_event.${string}`;
export type AchievementId = `achievement.${string}`;
export type MatchFormatId = `format.${string}`;
export type SponsorId = `sponsor.${string}`;
export type PlayerId = string;
export type MatchId = string;

export interface VersionStamp {
  readonly gameBalanceVersion: string;
  readonly matchEngineVersion: string;
  readonly schemaVersion: number;
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type CurrencyCode = 'coins' | 'gems';
export type CareerTierId = 'academy' | 'club' | 'district' | 'domestic' | 'franchise' | 'international';
