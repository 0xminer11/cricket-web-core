import type {
  PlayerAttributes,
  PlayerRole,
  BattingHand,
  BowlingStyle,
  MatchFormat,
  PitchDefinition,
  DeliveryId,
  ShotId,
  DeliveryLength,
  DeliveryLine,
  ContactQuality,
  DismissalType,
  ExtraType,
} from '@the-cricketer/game-core';
export interface MatchPlayerSnapshot extends PlayerAttributes {
  playerId: string;
  displayName: string;
  role: PlayerRole;
  battingHand: BattingHand;
  bowlingStyle: BowlingStyle | null;
  form: number;
  fatigue: number;
  equipmentModifiers: Record<string, number>;
}
export interface MatchTeamSnapshot {
  teamId: string;
  displayName: string;
  players: MatchPlayerSnapshot[];
  battingOrder: string[];
  bowlingOrder: string[];
  /** Module 0 team style (0..100): how attacking the side is. A modest input to the AI's risk appetite; never to an outcome. */
  aggression?: number;
}

/**
 * Module 12: which AI decides for each side, recorded with the match. `profiles` maps a team id to a difficulty id
 * (rookie, amateur, pro, elite). The versions name the decision algorithm and its tuning when the match was created.
 */
export interface MatchAiSnapshot {
  engineVersion: string;
  configVersion: string;
  profiles: Record<string, string>;
}
export interface TossDecision {
  winnerTeamId: string;
  decision: 'bat' | 'bowl';
}
export interface CreateMatchInput {
  matchId: string;
  formatId: string;
  pitchId: string;
  teamA: MatchTeamSnapshot;
  teamB: MatchTeamSnapshot;
  toss?: TossDecision;
  rngSeed: string;
  balanceVersion: string;
  matchEngineVersion: string;
  /** Absent on matches created before Module 12 (the default difficulty then applies). */
  ai?: MatchAiSnapshot;
}
export interface EngineConfig {
  formats?: readonly MatchFormat[];
  pitches?: readonly PitchDefinition[];
  validateAfterBall?: boolean;
}
/** x runs off-to-leg relative to batter's hand; y runs yorker-to-bouncer, both 0..1. */
export interface NormalizedPitchTarget {
  x: number;
  y: number;
}
export interface DeliveryIntent {
  variationId: DeliveryId;
  line: DeliveryLine;
  length: DeliveryLength;
  target?: NormalizedPitchTarget;
  /**
   * Optional human bowling-execution timing, 0..1 (1 = perfect, 0.5 = neutral/absent). Skill-based but
   * bounded: it scales the error radius and nudges quality, it never replaces Accuracy or Control.
   */
  executionInput?: number;
}
/** timingInput: -1 very early, 0 ideal, +1 very late. directionInput: -1..1 within shot arc. */
export interface ShotIntent {
  shotId: ShotId;
  timingInput?: number;
  directionInput?: number;
  aggression?: number;
}
export interface BallAction {
  actionId: string;
  expectedSequence: number;
  deliveryIntent: DeliveryIntent;
  battingIntent: ShotIntent;
}
export interface ResolvedDelivery {
  deliveryDefinitionId: DeliveryId;
  intendedLine: DeliveryLine;
  intendedLength: DeliveryLength;
  target: NormalizedPitchTarget;
  actualTarget: NormalizedPitchTarget;
  actualLine: DeliveryLine;
  actualLength: DeliveryLength;
  speed: number;
  swing: number;
  seam: number;
  spin: number;
  bounce: number;
  executionQuality: number;
  noBall: boolean;
}
export type FieldRegion =
  | 'straight'
  | 'cover'
  | 'point'
  | 'third_man'
  | 'mid_wicket'
  | 'square_leg'
  | 'fine_leg';
export interface ResolvedShot {
  aggression: number;
  shotId: ShotId;
  suitability: number;
  timing: number;
  contactScore: number;
  contactQuality: ContactQuality;
  direction: number;
  worldDirection: number;
  sector: FieldRegion;
  exitSpeed: number;
  launchAngle: number;
}
export interface Outcome {
  runsOffBat: number;
  extras: number;
  extraType: ExtraType | null;
  wicketType: DismissalType | null;
  legalDelivery: boolean;
  completedRuns: number;
  distanceClass: 'infield' | 'outfield' | 'boundary' | 'six';
}
export interface MatchEvent {
  sequence: number;
  type:
    | 'MATCH_STARTED'
    | 'TOSS_COMPLETED'
    | 'INNINGS_STARTED'
    | 'OVER_STARTED'
    | 'BALL_COMPLETED'
    | 'BOUNDARY'
    | 'SIX'
    | 'WICKET'
    | 'FIFTY'
    | 'HUNDRED'
    | 'OVER_COMPLETED'
    | 'INNINGS_COMPLETED'
    | 'TARGET_REACHED'
    | 'MATCH_COMPLETED'
    | 'MATCH_ABANDONED';
  inningsNumber: number;
  deliverySequence: number;
  playerId?: string;
  runs?: number;
}
export interface EngineBallResult extends Outcome {
  sequenceNumber: number;
  inningsSequence: number;
  inningsNumber: number;
  overNumber: number;
  ballInOver: number;
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  delivery: ResolvedDelivery;
  shot: ResolvedShot;
  scoreAfter: number;
  wicketsAfter: number;
  strikerAfter: string | null;
  nonStrikerAfter: string | null;
  events: MatchEvent[];
}
export interface BattingFigure {
  playerId: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissal: DismissalType | null;
}
export interface BowlingFigure {
  playerId: string;
  legalBalls: number;
  runs: number;
  wickets: number;
  extras: number;
  maidens: number;
  dots: number;
}
export interface EngineOver {
  overNumber: number;
  bowlerId: string;
  runs: number;
  conceded: number;
  wickets: number;
  legalBalls: number;
  completed: boolean;
  balls: EngineBallResult[];
}
export interface EngineInnings {
  inningsNumber: number;
  battingTeamId: string;
  bowlingTeamId: string;
  isSuperOver: boolean;
  maxBalls: number;
  maxWickets: number;
  runs: number;
  wickets: number;
  extras: number;
  legalBalls: number;
  target: number | null;
  strikerId: string | null;
  nonStrikerId: string | null;
  currentBowlerId: string | null;
  nextBatterIndex: number;
  completed: boolean;
  overs: EngineOver[];
  batting: BattingFigure[];
  bowling: BowlingFigure[];
}
export interface MatchResult {
  type: 'win' | 'tie';
  winnerTeamId: string | null;
  margin: number;
  marginType: 'runs' | 'wickets' | null;
  superOver: boolean;
}
export interface EngineMatchState {
  matchId: string;
  status:
    | 'created'
    | 'ready'
    | 'in_progress'
    | 'innings_break'
    | 'completed'
    | 'abandoned';
  formatId: string;
  pitchId: string;
  versions: {
    matchEngineVersion: string;
    gameBalanceVersion: string;
    schemaVersion: number;
  };
  toss: TossDecision | null;
  innings: EngineInnings[];
  currentInningsIndex: number;
  sequence: number;
  events: MatchEvent[];
  result: MatchResult | null;
}
export type EngineCommand =
  | { type: 'ready' }
  | { type: 'start'; toss: TossDecision }
  | { type: 'innings' }
  | { type: 'bowler'; playerId: string }
  | { type: 'ball'; action: BallAction }
  | { type: 'abandon' };
export interface MatchReplay {
  schemaVersion: 1;
  rngAlgorithmVersion: string;
  input: CreateMatchInput;
  commands: EngineCommand[];
}
