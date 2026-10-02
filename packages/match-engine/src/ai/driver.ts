import {
  AI_CONFIG_VERSION,
  AI_ENGINE_VERSION,
  AI_TUNING,
  AI_ENGINE_VERSION as CURRENT_AI_VERSION,
  createCricketAI,
  profileFor,
} from '@the-cricketer/game-core';
import type {
  AIDecisionTrace,
  AIProfile,
  AIResult,
  BattingAIObservation,
  BowlerSelectionObservation,
  BowlingAIObservation,
  CricketAI,
} from '@the-cricketer/game-core';
import type { DeliveryId, ShotId } from '@the-cricketer/game-core';
import type { HeadlessMatchEngine } from '../engine/match-engine';
import { createMatchEngine } from '../engine/match-engine';
import { assert } from '../validation/validate';
import type {
  BallAction,
  CreateMatchInput,
  DeliveryIntent,
  EngineBallResult,
  EngineConfig,
  MatchAiSnapshot,
  ShotIntent,
} from '../state/types';
import {
  AI_HISTORY_CAP,
  aiStreams,
  batterView,
  bowlerView,
  conditionsOf,
  historyOf,
  playerOf,
  situationOf,
  teamOf,
} from './observation';
import type { Conditions } from './observation';

/**
 * The bridge between the Module 8 engine and the Module 12 AI. The AI package chooses INTENTS from an observation; this file builds
 * the observation from the engine's state and hands the intent back. It decides nothing about outcomes: every ball is resolved by
 * `engine.resolveBall`, which also stores the chosen intents in the replay, so replaying a match never asks the AI to decide again.
 */

export interface AiOptions {
  /** Keep a decision trace (development and the AI lab only). */
  readonly trace?: boolean;
  readonly onDecision?: (trace: AIDecisionTrace) => void;
  /** Restrict selection to these engine-eligible players (e.g. skip the human). */
  readonly eligiblePlayerIds?: readonly string[];
  /** Replace the AI (tests). */
  readonly ai?: CricketAI;
  /** Called when the AI had to fall back to a safe intent. */
  readonly onError?: (error: unknown) => void;
}

let shared: CricketAI | null = null;
const defaultAi = (): CricketAI => (shared ??= createCricketAI());

const aiFor = (options: AiOptions): CricketAI =>
  options.ai ??
  (options.onError ? createCricketAI({ onError: options.onError }) : defaultAi());

/** The snapshot recorded with a new match: who decides for each team, and the AI versions. */
export function createAiSnapshot(
  profiles: Record<string, string>,
): MatchAiSnapshot {
  return {
    engineVersion: AI_ENGINE_VERSION,
    configVersion: AI_CONFIG_VERSION,
    profiles: { ...profiles },
  };
}

/** The AI profile that decides for a team in this match (the default difficulty when the match recorded none). */
export function aiProfileFor(input: CreateMatchInput, teamId: string): AIProfile {
  assert(!input.ai || (input.ai.engineVersion === CURRENT_AI_VERSION && input.ai.configVersion === AI_CONFIG_VERSION), 'Unsupported AI version for new decisions');
  return profileFor(input.ai?.profiles[teamId] ?? AI_TUNING.defaultDifficulty);
}

interface Live {
  readonly state: ReturnType<HeadlessMatchEngine['peek']>;
  readonly innings: ReturnType<HeadlessMatchEngine['peek']>['innings'][number];
  readonly conditions: Conditions;
  readonly sequence: number;
}

function live(engine: HeadlessMatchEngine): Live {
  const state = engine.peek();
  assert(state.status === 'in_progress', 'Match is not accepting balls');
  const innings = state.innings[state.currentInningsIndex]!;
  const { format } = engine.conditions();
  return {
    state,
    innings,
    conditions: conditionsOf(state, format),
    sequence: state.sequence + 1,
  };
}

function bowlingObservation(
  engine: HeadlessMatchEngine,
  input: CreateMatchInput,
  options: AiOptions,
): BowlingAIObservation {
  const { state, innings, conditions, sequence } = live(engine);
  assert(innings.currentBowlerId, 'Select bowler first');
  const bowler = playerOf(input, innings.currentBowlerId)!;
  const striker = playerOf(input, innings.strikerId!)!;
  const battingTeam = teamOf(input, innings.battingTeamId);
  const batters = Object.fromEntries(
    battingTeam.players.map((p) => [p.playerId, batterView(p, innings)]),
  );
  return {
    situation: situationOf(innings, conditions),
    history: historyOf(state, AI_HISTORY_CAP),
    profile: aiProfileFor(input, innings.bowlingTeamId),
    teamAggression: teamOf(input, innings.bowlingTeamId).aggression ?? null,
    streams: aiStreams(input.rngSeed),
    trace: options.trace === true || options.onDecision !== undefined,
    bowler: bowlerView(bowler, innings, conditions.maxOversPerBowler),
    batter: batters[striker.playerId]!,
    batters,
    sequence,
  };
}

/** What the AI bowler will bowl next. Needs a bowler to be selected; reads only completed balls. */
export function chooseDeliveryIntent(
  engine: HeadlessMatchEngine,
  input: CreateMatchInput,
  options: AiOptions = {},
): AIResult<DeliveryIntent> {
  const result = aiFor(options).chooseBowlingIntent(
    bowlingObservation(engine, input, options),
  );
  if (result.trace) options.onDecision?.(result.trace);
  return {
    intent: {
      variationId: result.intent.variationId as DeliveryId,
      line: result.intent.line,
      length: result.intent.length,
      target: { x: result.intent.target.x, y: result.intent.target.y },
    },
    trace: result.trace,
  };
}

/**
 * What the AI batter will play to the given delivery. The batter reads the delivery as bowled (the engine's own preview of it, a
 * read-only look that draws no random number the outcome will use) through the AI's perception model, which blurs it by the
 * batter's skill and the difficulty. The batter never sees the contact or outcome rolls.
 */
export function chooseShotIntent(
  engine: HeadlessMatchEngine,
  input: CreateMatchInput,
  delivery: DeliveryIntent,
  options: AiOptions = {},
): AIResult<ShotIntent> {
  const { state, innings, conditions, sequence } = live(engine);
  assert(innings.currentBowlerId, 'Select bowler first');
  const bowled = engine.previewDelivery(sequence, delivery);
  const bowler = playerOf(input, innings.currentBowlerId)!;
  const striker = playerOf(input, innings.strikerId!)!;
  const observation: BattingAIObservation = {
    situation: situationOf(innings, conditions),
    history: historyOf(state, AI_HISTORY_CAP),
    profile: aiProfileFor(input, innings.battingTeamId),
    teamAggression: teamOf(input, innings.battingTeamId).aggression ?? null,
    streams: aiStreams(input.rngSeed),
    trace: options.trace === true || options.onDecision !== undefined,
    batter: batterView(striker, innings),
    bowler: {
      playerId: bowler.playerId,
      style: bowler.bowlingStyle!,
      role: bowler.role,
    },
    delivery: {
      x: bowled.actualTarget.x,
      y: bowled.actualTarget.y,
      speed: bowled.speed,
      swing: bowled.swing,
      seam: bowled.seam,
      spin: bowled.spin,
    },
    sequence,
  };
  const result = aiFor(options).chooseBattingIntent(observation);
  if (result.trace) options.onDecision?.(result.trace);
  return {
    intent: {
      shotId: result.intent.shotId as ShotId,
      timingInput: result.intent.timingInput,
      directionInput: result.intent.directionInput,
    },
    trace: result.trace,
  };
}

/** The AI's choice of who bowls the next over, from the bowlers the engine says are eligible. */
export function chooseBowlerFor(
  engine: HeadlessMatchEngine,
  input: CreateMatchInput,
  options: AiOptions = {},
): AIResult<{ playerId: string }> {
  const eligible = engine.eligibleBowlers().filter((id) => !options.eligiblePlayerIds || options.eligiblePlayerIds.includes(id));
  assert(eligible.length > 0, 'No eligible bowler');
  const { state, innings, conditions, sequence } = live(engine);
  if (eligible.length === 1)
    return { intent: { playerId: eligible[0]! }, trace: null };
  const striker = playerOf(input, innings.strikerId!);
  const nextBatter = null;
  const observation: BowlerSelectionObservation = {
    situation: situationOf(innings, conditions),
    history: historyOf(state, AI_HISTORY_CAP),
    profile: aiProfileFor(input, innings.bowlingTeamId),
    teamAggression: teamOf(input, innings.bowlingTeamId).aggression ?? null,
    streams: aiStreams(input.rngSeed),
    trace: options.trace === true || options.onDecision !== undefined,
    candidates: eligible.map((id) =>
      bowlerView(playerOf(input, id)!, innings, conditions.maxOversPerBowler),
    ),
    batter: striker ? batterView(striker, innings) : null,
    nextBatter,
    sequence,
  };
  const result = aiFor(options).chooseBowler(observation);
  if (result.trace) options.onDecision?.(result.trace);
  return result;
}

/**
 * One ball played entirely by the AI: select a bowler if the over needs one, the bowler's intent, the batter's reply to the ball as
 * bowled, and the engine's resolution. The intents go into the replay through the engine like any human action.
 */
export function stepSimulationAI(
  engine: HeadlessMatchEngine,
  input: CreateMatchInput,
  options: AiOptions = {},
): EngineBallResult {
  let cursor = engine.cursor();
  if (cursor.status === 'innings_break') {
    engine.startNextInnings();
    cursor = engine.cursor();
  }
  assert(cursor.status === 'in_progress', 'Simulation cannot step completed match');
  if (!cursor.bowlerId) {
    engine.selectBowler(chooseBowlerFor(engine, input, options).intent.playerId);
    cursor = engine.cursor();
  }
  const sequence = cursor.sequence + 1;
  const bowling = chooseDeliveryIntent(engine, input, options);
  const batting = chooseShotIntent(engine, input, bowling.intent, options);
  const action: BallAction = {
    actionId: `ai-ball-${sequence}`,
    expectedSequence: sequence,
    deliveryIntent: bowling.intent,
    battingIntent: batting.intent,
  };
  return engine.resolveBall(action);
}

/** A whole match played by the AI on both sides. `input.ai` says how hard each side plays. */
export function simulateMatchAI(
  input: CreateMatchInput,
  config: EngineConfig = {},
  options: AiOptions = {},
) {
  const engine = createMatchEngine(config);
  engine.startMatch(input);
  for (let i = 0; i < 10000; i++) {
    if (engine.cursor().status === 'completed')
      return { state: engine.snapshot(), replay: engine.replay() };
    stepSimulationAI(engine, input, options);
  }
  throw new Error('Simulation safety limit exceeded');
}

export type { AIDecisionTrace };
