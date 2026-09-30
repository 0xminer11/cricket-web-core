import type { AssetId, CareerTierId, IsoDateTime, PlayerId, StatValue, TeamId } from './common.types';

export type BattingHand = 'right' | 'left';
export type BowlingStyle =
  | 'right_arm_fast'
  | 'left_arm_fast'
  | 'right_arm_medium'
  | 'left_arm_medium'
  | 'off_spin'
  | 'leg_spin'
  | 'left_arm_orthodox'
  | 'left_arm_wrist_spin';

export type PlayerRole =
  | 'opening_batter'
  | 'top_order_batter'
  | 'middle_order_batter'
  | 'finisher'
  | 'wicketkeeper_batter'
  | 'batting_all_rounder'
  | 'bowling_all_rounder'
  | 'fast_bowler'
  | 'swing_bowler'
  | 'spin_bowler';

export interface BattingAttributes {
  readonly timing: StatValue;
  readonly power: StatValue;
  readonly placement: StatValue;
  readonly defence: StatValue;
  readonly footwork: StatValue;
  readonly shotSelection: StatValue;
  readonly technique: StatValue;
  readonly consistency: StatValue;
}

export interface BowlingAttributes {
  readonly pace: StatValue;
  readonly accuracy: StatValue;
  readonly swing: StatValue;
  readonly seam: StatValue;
  readonly spin: StatValue;
  readonly control: StatValue;
  readonly variation: StatValue;
  readonly consistency: StatValue;
}

export interface PhysicalAttributes {
  readonly strength: StatValue;
  readonly stamina: StatValue;
  readonly fitness: StatValue;
  readonly reflex: StatValue;
  readonly agility: StatValue;
  readonly recovery: StatValue;
}

export interface PersonalityAttributes {
  readonly confidence: StatValue;
  readonly discipline: StatValue;
  readonly leadership: StatValue;
  readonly professionalism: StatValue;
  readonly riskAppetite: StatValue;
  readonly teamMindset: StatValue;
}

export interface PlayerAttributes {
  readonly batting: BattingAttributes;
  readonly bowling: BowlingAttributes;
  readonly physical: PhysicalAttributes;
  readonly personality: PersonalityAttributes;
}

export interface PlayerForm {
  readonly value: number; // 0..100
  readonly recentPerformanceRatings: readonly number[]; // 0..10, newest first
  readonly updatedAt: IsoDateTime;
}

export interface SkillProgressState {
  readonly statKey: string;
  readonly skillXp: number;
  readonly xpToNextPoint: number;
}

export interface CareerProgress {
  readonly tier: CareerTierId;
  readonly playerLevel: number; // 1..50
  readonly playerXp: number;
  readonly reputation: number; // 0..1000
  readonly selectorInterest: number; // 0..100
  readonly fans: number;
  readonly careerMatches: number;
  readonly careerWins: number;
  readonly currentTeamId?: TeamId;
}

export interface PlayerProfile {
  readonly playerId: PlayerId;
  readonly displayName: string;
  readonly createdAt: IsoDateTime;
  readonly battingHand: BattingHand;
  readonly bowlingStyle?: BowlingStyle;
  readonly primaryRole: PlayerRole;
  readonly secondaryRoles: readonly PlayerRole[];
  readonly avatarAssetId?: AssetId;
  readonly attributes: PlayerAttributes;
  readonly skillProgress: readonly SkillProgressState[];
  readonly form: PlayerForm;
  readonly fatigue: number; // 0..100
  readonly career: CareerProgress;
}
