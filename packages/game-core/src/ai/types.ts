import type {
  BattingAttributes,
  BattingHand,
  BowlingAttributes,
  BowlingStyle,
  ContactQuality,
  DeliveryLength,
  DeliveryLine,
  PersonalityAttributes,
  PhysicalAttributes,
  PlayerRole,
  ShotCategory,
} from '../types/index';
import type { RandomSource } from '../utils/runtime';

/**
 * Module 12 domain types. The AI is a pure function of an OBSERVATION (what a cricketer could know when deciding) and
 * returns an INTENT (what to attempt). It never resolves anything: the Module 8 engine decides what happens.
 */

export type AIDifficultyId = 'rookie' | 'amateur' | 'pro' | 'elite';
export type MatchPhase = 'early' | 'middle' | 'death';
export type BattingMode =
  'SURVIVE' | 'ROTATE' | 'BALANCED' | 'ATTACK' | 'DESPERATE';
export type BowlingMode =
  'ATTACK_WICKET' | 'CONTROL' | 'BUILD_PRESSURE' | 'DEFEND_BOUNDARY' | 'DEATH';
export type PlanObjective =
  | 'DOT_PRESSURE'
  | 'WICKET_ATTACK'
  | 'BOUNDARY_PREVENTION'
  | 'YORKER_DEATH'
  | 'SHORT_BALL_ATTACK'
  | 'SPIN_PRESSURE';

/** Named, seeded random streams. The AI never constructs a generator: the host supplies them, so every draw is replayable. */
export interface RngStreams {
  stream(name: string): RandomSource;
}

// ---- who is deciding -----------------------------------------------------------------------------

/** A batter as the AI sees them: public attributes (already adjusted for form, fatigue and kit) and personality. */
export interface AIBatterView {
  readonly playerId: string;
  readonly role: PlayerRole;
  readonly hand: BattingHand;
  readonly batting: BattingAttributes;
  readonly physical: Pick<
    PhysicalAttributes,
    'reflex' | 'strength' | 'fitness' | 'stamina'
  >;
  readonly personality: PersonalityAttributes;
  readonly form: number;
  readonly fatigue: number;
  /** Their innings so far. */
  readonly runs: number;
  readonly balls: number;
}

export interface AIBowlerView {
  readonly playerId: string;
  readonly role: PlayerRole;
  readonly style: BowlingStyle;
  readonly hand: BattingHand;
  readonly bowling: BowlingAttributes;
  readonly physical: Pick<PhysicalAttributes, 'stamina' | 'fitness'>;
  readonly personality: PersonalityAttributes;
  readonly fatigue: number;
  /** Their spell so far. */
  readonly legalBalls: number;
  readonly runsConceded: number;
  readonly wickets: number;
  /** The most overs a bowler may bowl in this format (null = unlimited), and how many they have bowled. */
  readonly maxOvers: number | null;
  readonly oversBowled: number;
}

// ---- the match -----------------------------------------------------------------------------------

export interface MatchSituation {
  readonly formatId: string;
  readonly pitchId: string;
  readonly inningsNumber: number;
  readonly isSuperOver: boolean;
  readonly ballsPerOver: number;
  /** Legal balls available in this innings. */
  readonly maxBalls: number;
  readonly maxWickets: number;
  readonly legalBalls: number;
  readonly runs: number;
  readonly wickets: number;
  /** Runs to win (target), or null when batting first. */
  readonly target: number | null;
  /** Module 0: how attacking the format is (`MatchFormat.aiAggressionModifier`). */
  readonly formatAggression: number;
}

/** One completed ball as the AI remembers it: what was bowled, what was played, what happened. */
export interface BallRecord {
  readonly sequence: number;
  readonly inningsNumber: number;
  readonly overNumber: number;
  readonly ballInOver: number;
  readonly strikerId: string;
  readonly bowlerId: string;
  /** The innings just before this ball. */
  readonly before: {
    readonly runs: number;
    readonly wickets: number;
    readonly legalBalls: number;
  };
  readonly delivery: {
    readonly variationId: string;
    readonly intendedLine: DeliveryLine;
    readonly intendedLength: DeliveryLength;
    readonly actualLine: DeliveryLine;
    readonly actualLength: DeliveryLength;
    readonly speed: number;
    /** swing + seam + spin */
    readonly movement: number;
  };
  readonly shot: {
    readonly shotId: string;
    readonly category: ShotCategory;
    readonly contact: ContactQuality;
    readonly sector: string;
    readonly timing: number;
  };
  readonly runsOffBat: number;
  readonly extras: number;
  readonly legal: boolean;
  readonly wicket: boolean;
}

/** The ball the bowler has just released, as a batter can read it (not the bowler's intent, not the execution roll). */
export interface ObservedDelivery {
  /** Where it will pitch: x = line (0 wide off .. 1 wide leg), y = length (0 yorker .. 1 bouncer). */
  readonly x: number;
  readonly y: number;
  /** m/s */
  readonly speed: number;
  readonly swing: number;
  readonly seam: number;
  readonly spin: number;
}

// ---- difficulty and profile ----------------------------------------------------------------------

/**
 * How WELL the AI decides. Every field is a decision quality (noise, memory, awareness): none is a player attribute, and
 * none is ever added to, multiplied into or compared with a Timing, Power, Accuracy, Control, Pace, Swing, Seam, Spin
 * or Placement value.
 */
export interface AIDifficultyProfile {
  readonly id: AIDifficultyId;
  readonly label: string;
  /** Random disturbance added to every option's utility (0..1 of the utility scale). */
  readonly decisionNoise: number;
  /** Softmax temperature: lower = the best option is picked more often. */
  readonly temperature: number;
  /** How many balls ahead the AI looks when it sets a plan or a mode (0 = this ball only). */
  readonly planningDepth: number;
  /** How strongly observed patterns move decisions, 0..1. */
  readonly adaptationStrength: number;
  /** How well hidden attribute weaknesses of the opponent are read, 0..1. */
  readonly matchupAwareness: number;
  /** How well risk is matched to the situation, 0..1 (Module 0 `riskDiscipline`). */
  readonly riskAwareness: number;
  /** How reliably recent events are recalled and weighted, 0..1. */
  readonly memoryAccuracy: number;
  /** How many recent balls are remembered (Module 0 `tacticalMemory`). */
  readonly memoryWindow: number;
  /** How accurately a batter reads the line, length and movement of a delivery, 0..1. */
  readonly perceptionAccuracy: number;
  /** Chance of a plain tactical lapse (an option from the weaker half is chosen). */
  readonly mistakeRate: number;
}

export interface AIProfile {
  readonly id: AIDifficultyId;
  readonly difficulty: AIDifficultyProfile;
  /** Small, signed tilt (-0.1..0.1) toward attacking (+) or patient (-) choices. */
  readonly aggressionBias: number;
  readonly patienceBias: number;
  /** How willing a bowler is to use difficult variations, 0..1. */
  readonly variationPreference: number;
  /** Scales how quickly the AI changes its mind after evidence, 0..1. */
  readonly adaptationRate: number;
}

// ---- observations --------------------------------------------------------------------------------

interface ObservationBase {
  readonly situation: MatchSituation;
  /** Completed balls, oldest first. Bounded by the caller (the AI ignores anything beyond its own memory window). */
  readonly history: readonly BallRecord[];
  readonly profile: AIProfile;
  /** Module 0 team aggression (0..100), a modest influence; null when unknown. */
  readonly teamAggression: number | null;
  readonly streams: RngStreams;
  /** Record a decision trace (development only). */
  readonly trace: boolean;
}

export interface BattingAIObservation extends ObservationBase {
  readonly batter: AIBatterView;
  readonly bowler: {
    readonly playerId: string;
    readonly style: BowlingStyle;
    readonly role: PlayerRole;
  };
  /** The delivery as bowled. The batter perceives it with the noise their skill and the difficulty allow. */
  readonly delivery: ObservedDelivery;
  /** The run-up is over: the batter reacts to the ball, so the plan of the bowler is not known. */
  readonly sequence: number;
}

export interface BowlingAIObservation extends ObservationBase {
  readonly bowler: AIBowlerView;
  /** The batter on strike, and every batter who has batted in this innings (a plan may span a change of striker). */
  readonly batter: AIBatterView;
  readonly batters: Readonly<Record<string, AIBatterView>>;
  readonly sequence: number;
}

export interface BowlerSelectionObservation extends ObservationBase {
  readonly candidates: readonly AIBowlerView[];
  /** The batter due to face the over (the one on strike). */
  readonly batter: AIBatterView | null;
  readonly nextBatter: AIBatterView | null;
  readonly sequence: number;
}

// ---- intents -------------------------------------------------------------------------------------

export interface AIDeliveryIntent {
  readonly variationId: string;
  readonly line: DeliveryLine;
  readonly length: DeliveryLength;
  readonly target: { readonly x: number; readonly y: number };
}

export interface AIShotIntent {
  readonly shotId: string;
  /** -1 very early .. 0 ideal .. +1 very late. */
  readonly timingInput: number;
  /** -1..1 within the shot's arc, relative to the batter's hand. */
  readonly directionInput: number;
}

// ---- explanation ---------------------------------------------------------------------------------

export interface AICandidateTrace {
  readonly id: string;
  readonly utility: number;
  readonly probability: number;
  readonly parts: Readonly<Record<string, number>>;
}

/** Why the AI did what it did. Built only when `observation.trace` is set; never persisted in production. */
export interface AIDecisionTrace {
  readonly kind: 'batting' | 'bowling' | 'bowler_selection';
  readonly mode: string;
  readonly plan?: { id: string; objective: PlanObjective; ballsUsed: number };
  readonly risk: number;
  readonly pressure: number;
  readonly phase: MatchPhase;
  readonly selected: string;
  readonly reasons: readonly string[];
  readonly candidates: readonly AICandidateTrace[];
  readonly fallback?: string;
  readonly perceived?: {
    readonly line: DeliveryLine;
    readonly length: DeliveryLength;
    readonly misread: boolean;
  };
}

export interface AIResult<T> {
  readonly intent: T;
  readonly trace: AIDecisionTrace | null;
}

export type AIErrorCode =
  | 'NO_VALID_SHOT_CANDIDATES'
  | 'NO_VALID_DELIVERY_CANDIDATES'
  | 'AI_INVALID_MATCH_STATE'
  | 'AI_INVALID_BOWLER'
  | 'AI_INVALID_BATTER';

export class AIError extends Error {
  constructor(
    readonly code: AIErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AIError';
  }
}

/** The AI as the rest of the game sees it. */
export interface CricketAI {
  chooseBattingIntent(
    observation: BattingAIObservation,
  ): AIResult<AIShotIntent>;
  chooseBowlingIntent(
    observation: BowlingAIObservation,
  ): AIResult<AIDeliveryIntent>;
  chooseBowler(
    observation: BowlerSelectionObservation,
  ): AIResult<{ readonly playerId: string }>;
}
