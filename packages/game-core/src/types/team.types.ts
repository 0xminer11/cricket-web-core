import type { AssetId, CareerTierId, PlayerId, StatValue, TeamId } from './common.types';
import type { BattingHand, BowlingStyle, PlayerAttributes, PlayerRole } from './player.types';

export interface Team {
  readonly teamId: TeamId;
  readonly name: string;
  readonly shortName: string;
  readonly region: string;
  readonly careerTier: CareerTierId;
  readonly rating: StatValue;
  readonly battingStrength: StatValue;
  readonly bowlingStrength: StatValue;
  readonly aggression: StatValue;
  readonly logoAssetId: AssetId;
  readonly kitAssetId: AssetId;
}

export interface AIPlayer {
  readonly playerId: PlayerId;
  readonly displayName: string;
  readonly teamId: TeamId;
  readonly role: PlayerRole;
  readonly battingHand: BattingHand;
  readonly bowlingStyle?: BowlingStyle;
  readonly attributes: PlayerAttributes;
  readonly aiArchetype: 'patient' | 'balanced' | 'aggressive' | 'technical' | 'attacking_bowler' | 'containing_bowler';
}
