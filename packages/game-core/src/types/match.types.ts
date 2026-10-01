import type {
  DeliveryId,
  MatchFormatId,
  MatchId,
  PitchId,
  PlayerId,
  ShotId,
  TeamId,
  VersionStamp,
} from './common.types';

export type DeliveryLength = 'yorker' | 'full' | 'good' | 'short' | 'bouncer';
export type DeliveryLine =
  'wide_off' | 'outside_off' | 'off_stump' | 'middle' | 'leg' | 'wide_leg';
export type ShotCategory = 'defensive' | 'drive' | 'cross_bat' | 'lofted';
export type PreferredFoot = 'front' | 'back' | 'either';
export type ContactQuality =
  'perfect' | 'good' | 'okay' | 'poor' | 'edge' | 'miss';
export type DismissalType =
  'bowled' | 'caught' | 'lbw' | 'run_out' | 'stumped' | 'hit_wicket';
export type ExtraType = 'wide' | 'no_ball' | 'bye' | 'leg_bye';

export interface ShotDefinition {
  readonly id: ShotId;
  readonly displayName: string;
  readonly category: ShotCategory;
  readonly idealLines: readonly DeliveryLine[];
  readonly idealLengths: readonly DeliveryLength[];
  readonly preferredFoot: PreferredFoot;
  readonly risk: number; // 0..1
  readonly powerMultiplier: number;
  readonly timingDifficulty: number; // 0..1
  readonly directionDegrees: readonly [number, number];
  readonly animationAssetKey: string;
}

export interface DeliveryDefinition {
  readonly id: DeliveryId;
  readonly displayName: string;
  readonly eligibleStyles: readonly string[];
  readonly defaultLength: DeliveryLength;
  readonly difficulty: number; // 0..1
  readonly controlPenalty: number; // 0..1
  readonly movementProfile:
    | 'none'
    | 'swing_out'
    | 'swing_in'
    | 'seam'
    | 'off_break'
    | 'leg_break'
    | 'googly'
    | 'top_spin'
    | 'cutter'
    | 'slower';
  readonly movementStrength: number; // 0..1
  readonly staminaCost: number;
  readonly idealAttribute:
    'pace' | 'accuracy' | 'swing' | 'seam' | 'spin' | 'control' | 'variation';
}

export interface PitchDefinition {
  readonly id: PitchId;
  readonly displayName: string;
  readonly paceMultiplier: number;
  readonly bounceMultiplier: number;
  readonly swingMultiplier: number;
  readonly seamMultiplier: number;
  readonly spinMultiplier: number;
  readonly battingDifficultyMultiplier: number;
}

export interface MatchFormat {
  readonly id: MatchFormatId;
  readonly displayName: string;
  readonly inningsPerTeam: number;
  readonly oversPerInnings: number | null;
  readonly maxWickets: number;
  readonly ballsPerOver: number;
  readonly powerplayOvers: number;
  readonly maxOversPerBowler: number | null;
  readonly tieRule: 'tie' | 'super_over';
  readonly superOverEnabled: boolean;
  readonly rewardMultiplier: number;
  readonly aiAggressionModifier: number;
}

export interface BallResult {
  readonly ballIndex: number;
  readonly legalDelivery: boolean;
  readonly deliveryId: DeliveryId;
  readonly line: DeliveryLine;
  readonly length: DeliveryLength;
  readonly shotId?: ShotId;
  readonly contactQuality?: ContactQuality;
  readonly runsOffBat: number;
  readonly extras: number;
  readonly extraType?: ExtraType;
  readonly wicket: boolean;
  readonly dismissalType?: DismissalType;
  readonly dismissedPlayerId?: PlayerId;
  readonly strikerAfter: PlayerId;
  readonly nonStrikerAfter: PlayerId;
  readonly scoreAfter: number;
  readonly wicketsAfter: number;
}

export interface OverState {
  readonly overNumber: number;
  readonly bowlerId: PlayerId;
  readonly legalBalls: number;
  readonly runs: number;
  readonly wickets: number;
  readonly balls: readonly BallResult[];
}

export interface InningsState {
  readonly battingTeamId: TeamId;
  readonly bowlingTeamId: TeamId;
  readonly runs: number;
  readonly wickets: number;
  readonly legalBalls: number;
  readonly target?: number;
  readonly strikerId: PlayerId;
  readonly nonStrikerId: PlayerId;
  readonly currentBowlerId: PlayerId;
  readonly overs: readonly OverState[];
  readonly completed: boolean;
}

export interface MatchState {
  readonly matchId: MatchId;
  readonly versions: VersionStamp;
  readonly formatId: MatchFormatId;
  readonly pitchId: PitchId;
  readonly teamIds: readonly [TeamId, TeamId];
  readonly innings: readonly InningsState[];
  readonly currentInningsIndex: number;
  readonly status: 'created' | 'in_progress' | 'completed' | 'abandoned';
  readonly winnerTeamId?: TeamId;
}
