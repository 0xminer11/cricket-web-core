import { validateSituation, validateRatings } from '../core/validation';
import { PITCHES } from '../../config/pitch.config';
import { SHOTS } from '../../seed/shots.seed';
import { fieldRegion } from '../../match-rules';
import { ENGINE_BALANCE as B } from '../../config/engine.config';
import type { PitchDefinition, ShotDefinition } from '../../types/index';
import { AI_TUNING } from '../config/tuning';
import { clamp, gaussian, pickIndex, softmax } from '../core/math';
import { analyzeContext, valueScale } from '../match-context/context';
import { buildMemory } from '../memory/memory';
import {
  battingTemperament,
  isTailender,
} from '../personality/personality';
import {
  memoryAffinity,
  modeAffinity,
  personalityAffinity,
  strengthAffinity,
} from '../scoring/batting-evaluators';
import {
  estimateShotOutcome,
  outcomeValue,
  timingHalfWidth,
  valueTable,
} from '../scoring/expected-outcome';
import type { BatterSkills } from '../scoring/expected-outcome';
import { battingStrategy } from '../strategies/batting-modes';
import { AIError } from '../types';
import type {
  AICandidateTrace,
  AIDecisionTrace,
  AIResult,
  AIShotIntent,
  BattingAIObservation,
} from '../types';
import { perceiveDelivery } from './perception';

const T = AI_TUNING.batting;

export function batterSkills(
  b: BattingAIObservation['batter'],
): BatterSkills {
  return {
    batting: b.batting,
    reflex: b.physical.reflex,
    strength: b.physical.strength,
    form: b.form,
    fatigue: b.fatigue,
    confidence: b.personality.confidence,
  };
}

export function validateBattingObservation(obs: BattingAIObservation): void {
  validateSituation(obs.situation);
  if (!obs.batter || !obs.batter.batting)
    throw new AIError('AI_INVALID_BATTER', 'There is no batter to decide for.');
  validateRatings(obs.batter.batting, 'AI_INVALID_BATTER');
  validateRatings(obs.batter.physical, 'AI_INVALID_BATTER');
  const d = obs.delivery;
  if (![d.x, d.y, d.speed, d.swing, d.seam, d.spin].every(Number.isFinite))
    throw new AIError('AI_INVALID_MATCH_STATE', 'The delivery is not valid.');
}

/**
 * The batting decision engine (Module 12 section 31). From what a batter can know it works out the state of the match, how much
 * risk to take and which shot to play, then draws the shot, the timing and the direction from seeded streams. It returns an
 * INTENT only: what happens next is the Module 8 engine's decision.
 */
export function decideBatting(
  obs: BattingAIObservation,
): AIResult<AIShotIntent> {
  validateBattingObservation(obs);
  const s = obs.situation;
  const diff = obs.profile.difficulty;
  const pitch: PitchDefinition =
    PITCHES.find((p) => p.id === s.pitchId) ?? PITCHES[1]!;
  const ctx = analyzeContext(s, obs.history, obs.batter.playerId);
  const temperament = battingTemperament(obs.batter, ctx.pressure);
  const decide = obs.streams.stream(`ai:bat:${obs.sequence}`);
  const perceived = perceiveDelivery(
    obs.delivery,
    obs.batter,
    diff,
    obs.streams.stream(`ai:perceive:${obs.sequence}`),
  );
  const strategy = battingStrategy(obs, ctx, temperament, decide);
  const memory = buildMemory(obs.history, {
    strikerId: obs.batter.playerId,
    bowlerId: null,
    window: diff.memoryWindow,
    accuracy: diff.memoryAccuracy,
  });
  const skills = batterSkills(obs.batter);
  const ball = {
    line: perceived.line,
    length: perceived.length,
    challenge: perceived.challenge,
    movement: perceived.movement,
    pitch,
  };
  const tailender = isTailender(obs.batter.role);
  const shots: readonly ShotDefinition[] = tailender
    ? SHOTS.filter((x) => !T.tailenderExcludes.includes(x.id))
    : SHOTS;
  if (shots.length === 0)
    throw new AIError('NO_VALID_SHOT_CANDIDATES', 'No shot can be played.');

  const values = valueTable(s);
  const scale = valueScale(s);
  const confidenceScale = 0.5 * diff.memoryAccuracy * Math.min(1, memory.evidence / 4);
  const dotWeight = strategy.mode === 'ROTATE' || strategy.mode === 'SURVIVE' ? 1 : 0.4;
  const riskCentre = (strategy.risk - 0.5) * 2;

  const parts: Record<string, number>[] = [];
  const utilities: number[] = [];
  for (const shot of shots) {
    const est = estimateShotOutcome(shot, skills, ball);
    const value = outcomeValue(values, est) * scale;
    const mode = modeAffinity(shot, strategy.mode);
    const strength = strengthAffinity(shot, obs.batter);
    const personality = personalityAffinity(shot, temperament);
    const memoryTerm = memoryAffinity(shot, memory, confidenceScale);
    const mismatch =
      (1 - est.suitability) * temperament.mismatchMultiplier;
    const variance = riskCentre * (est.pBoundary - 0.6 * est.pWicket);
    const dot = -est.pDot * dotWeight;
    const noise = gaussian(decide) * diff.decisionNoise * 0.5;
    const w = T.weights;
    const u =
      w.value * value +
      w.mode * mode +
      w.strength * strength +
      w.personality * personality +
      w.memory * memoryTerm -
      w.mismatch * mismatch +
      0.5 * variance +
      w.dot * dot +
      noise;
    utilities.push(u);
    parts.push({
      value,
      mode,
      strength,
      personality,
      memory: memoryTerm,
      mismatch: -mismatch,
      variance: 0.5 * variance,
      dot: w.dot * dot,
      expectedRuns: est.expectedRuns,
      wicket: est.pWicket,
      boundary: est.pBoundary,
      suitability: est.suitability,
    });
  }

  const temperature =
    diff.temperature *
    (T.temperature / 0.2) *
    temperament.temperatureMultiplier *
    (tailender ? T.tailender.temperatureBoost : 1);
  const probs = softmax(utilities, temperature);
  let chosen = pickIndex(decide, probs);
  // a plain tactical lapse: a plausible but weaker option (the 2nd to the median-best)
  const mistakeRate = Math.min(
    0.5,
    diff.mistakeRate *
      temperament.mistakeMultiplier *
      (tailender ? T.tailender.mistakeBoost : 1),
  );
  const lapse = decide.next() < mistakeRate;
  if (lapse && shots.length > 2) {
    const order = utilities
      .map((u, i) => ({ u, i }))
      .sort((a, b) => b.u - a.u)
      .map((e) => e.i);
    const span = Math.max(2, Math.ceil(order.length * 0.5));
    chosen = order[1 + Math.floor(decide.next() * (span - 1))]!;
  }
  const shot = shots[chosen]!;

  // timing: the same spread the engine itself would draw for this batter and shot, never narrower. A batter who has misread
  // the ball is a little worse; nobody is better than their own attributes allow. (Consistency is already part of the
  // engine's contact skill, so it is not counted twice here.)
  const half =
    timingHalfWidth(obs.batter.batting.timing, shot) *
    (1 + (1 - diff.perceptionAccuracy) * 0.25 + (perceived.misread ? 0.1 : 0));
  const timingInput =
    Math.round(clamp((obs.streams.stream(`ai:timing:${obs.sequence}`).next() * 2 - 1) * half, -1, 1) * 1e6) / 1e6;
  const directionInput = chooseDirection(shot, strategy.risk, decide, diff.decisionNoise);

  let trace: AIDecisionTrace | null = null;
  if (obs.trace) {
    const order = utilities.map((_u, i) => i).sort((a, b) => utilities[b]! - utilities[a]!);
    const candidates: AICandidateTrace[] = order.map((i) => ({
      id: shots[i]!.id,
      utility: round(utilities[i]!),
      probability: round(probs[i]!),
      parts: Object.fromEntries(Object.entries(parts[i]!).map(([k, v]) => [k, round(v)])),
    }));
    const best = parts[chosen]!;
    const reasons = [...strategy.reasons];
    reasons.push(`mode ${strategy.mode}`);
    if (best['suitability'] === 1) reasons.push('shot suits the ball');
    else if (best['suitability'] === 0) reasons.push('shot does not suit the ball (accepted)');
    if (lapse) reasons.push('tactical lapse');
    if (perceived.misread) reasons.push('misread the ball');
    trace = {
      kind: 'batting',
      mode: strategy.mode,
      risk: round(strategy.risk),
      pressure: round(ctx.pressure),
      phase: ctx.phase,
      selected: shot.id,
      reasons,
      candidates,
      perceived: { line: perceived.line, length: perceived.length, misread: perceived.misread },
    };
  }
  return {
    intent: { shotId: shot.id, timingInput, directionInput },
    trace,
  };
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Where to hit it, within the shot's own arc, relative to the batter's hand. Boundary-seekers lean toward the sectors with the
 * thinnest cover (the published coverage table); everyone else plays it straight with a little seeded variety. The engine adds
 * the batter's own Placement spread on top, so the AI adds none of its own beyond decision noise.
 */
function chooseDirection(
  shot: ShotDefinition,
  risk: number,
  rng: { next(): number },
  noise: number,
): number {
  const [min, max] = shot.directionDegrees;
  let best = 0;
  if (shot.category !== 'defensive' && risk >= 0.55) {
    let bestCover = -Infinity;
    for (const x of [-1, -0.5, 0, 0.5, 1]) {
      const degrees = min + ((max - min) * (x + 1)) / 2;
      const cover = B.outcome.fieldCoverage[fieldRegion(degrees)];
      if (cover > bestCover + 1e-9) {
        bestCover = cover;
        best = x;
      }
    }
  }
  const jitter = gaussian(rng) * AI_TUNING.batting.directionJitter * (0.5 + noise);
  return Math.round(clamp(best * 0.6 + jitter, -1, 1) * 1e6) / 1e6;
}
