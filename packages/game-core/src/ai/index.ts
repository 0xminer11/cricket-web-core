export * from './types';
export { AI_TUNING } from './config/tuning';
export type { AITuning } from './config/tuning';
export { PLAN_TEMPLATES } from './config/plans';
export type { PlanCell, PlanTemplate } from './config/plans';
export { validateAIConfig } from './config/validate';
export {
  AI_DIFFICULTY_IDS,
  AI_DIFFICULTY_PROFILES,
  AI_PROFILES,
  difficultyForTier,
  isDifficultyId,
  profileFor,
} from './difficulty/profiles';
export { createCricketAI } from './core/cricket-ai';
export type { CricketAIOptions } from './core/cricket-ai';
export { clamp as aiClamp, softmax, pickIndex, gaussian } from './core/math';
export {
  analyzeContext,
  parRunsPerBall,
  phaseOf,
  projectedRemainingRuns,
  remainingParRuns,
  stateValue,
  valueScale,
  wicketResource,
} from './match-context/context';
export type { MatchContext } from './match-context/context';
export { battingTemperament, bowlingTemperament, isTailender } from './personality/personality';
export { buildMemory, cellKey, lengthGroupOf, lineGroupOf } from './memory/memory';
export type { AIMatchMemory, MemoryOptions, Tally } from './memory/memory';
export { detectBatterPatterns, patternValue, ruleMatch } from './memory/patterns';
export type { PatternId, PatternSignal } from './memory/patterns';
export {
  estimateShotOutcome,
  estimateWithKit,
  expectedContact,
  shotKit,
  outcomeValue,
  timingHalfWidth,
  valueTable,
} from './scoring/expected-outcome';
export type {
  BallConditions,
  BatterSkills,
  OutcomeEstimate,
  ValueTable,
} from './scoring/expected-outcome';
export { decideBatting, batterSkills } from './batting/batting-decision-engine';
export { perceiveDelivery } from './batting/perception';
export type { PerceivedDelivery } from './batting/perception';
export { decideBowling } from './bowling/bowling-decision-engine';
export { chooseBowlerAI, bowlerRating } from './bowling/bowler-selection';
export { resolvePlan, currentOverBalls, ballFailed, ballWorked } from './bowling/plans';
export type { PlanRuntime, ResolvedPlan } from './bowling/plans';
export { expectDelivery, deliveriesForStyle, isSpinStyle } from './bowling/execution-model';
export { BatterEstimator, ReplyModel, scoutBatter } from './bowling/batter-model';
export { battingModeOf, battingStrategy } from './strategies/batting-modes';
export { bowlingStrategy } from './strategies/bowling-modes';
export { chooseTossDecision } from './tactics/toss';
export type { TossAIInput, TossAIResult, TossSideSummary } from './tactics/toss';
export { parScore } from './tactics/par-score';
