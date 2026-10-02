import { validateSituation, validateRatings } from '../core/validation';
import { PITCHES } from '../../config/pitch.config';
import { ENGINE_BALANCE as B } from '../../config/engine.config';
import { classifyLength, classifyLine } from '../../match-geometry';
import type { DeliveryDefinition, PitchDefinition } from '../../types/index';
import { AI_TUNING } from '../config/tuning';
import { clamp01, gaussian, pickIndex, softmax } from '../core/math';
import { analyzeContext, valueScale } from '../match-context/context';
import { buildMemory, cellKey, lengthGroupOf, lineGroupOf } from '../memory/memory';
import { detectBatterPatterns, patternValue } from '../memory/patterns';
import { bowlingTemperament } from '../personality/personality';
import { AIError } from '../types';
import type {
  AICandidateTrace,
  AIDecisionTrace,
  AIDeliveryIntent,
  AIResult,
  BowlingAIObservation,
} from '../types';
import { ReplyModel } from './batter-model';
import { valueTable } from '../scoring/expected-outcome';
import { expectDelivery, idealAttributeRating } from './execution-model';
import { estimatorFor, pitchFit, resolvePlan, templateDeliveries } from './plans';
import type { PlanEnvironment } from './plans';

const T = AI_TUNING.bowling;
const round = (n: number): number => Math.round(n * 1000) / 1000;

export function validateBowlingObservation(obs: BowlingAIObservation): void {
  validateSituation(obs.situation);
  if (!obs.bowler || !obs.bowler.style)
    throw new AIError('AI_INVALID_BOWLER', 'There is no bowler to decide for.');
  if (!obs.batter || !obs.batter.batting)
    throw new AIError('AI_INVALID_BATTER', 'There is no batter to bowl to.');  validateRatings(obs.batter.batting, 'AI_INVALID_BATTER');
  validateRatings(obs.batter.physical, 'AI_INVALID_BATTER');
  validateRatings(obs.bowler.bowling, 'AI_INVALID_BOWLER');

}

/**
 * The bowling decision engine (Module 12 section 51). It works out the mode of the match, runs the plan manager to get the plan for
 * this ball, scores each delivery the plan allows against a model of how the batter would reply (priced over the bowler's own
 * execution error), adds what the observed patterns say, and draws one from a seeded weighted choice. It returns an INTENT: the
 * variation and the point aimed at. How well it is bowled is decided by the engine from the bowler's real Accuracy and Control;
 * difficulty never touches that.
 */
export function decideBowling(
  obs: BowlingAIObservation,
): AIResult<AIDeliveryIntent> {
  validateBowlingObservation(obs);
  const s = obs.situation;
  const diff = obs.profile.difficulty;
  const pitch: PitchDefinition =
    PITCHES.find((p) => p.id === s.pitchId) ?? PITCHES[1]!;
  const ctx = analyzeContext(s, obs.history, obs.batter.playerId);
  const temperament = bowlingTemperament(obs.bowler, ctx.pressure);
  const env: PlanEnvironment = { obs, pitch, estimators: new Map() };
  const resolved = resolvePlan(env);
  const plan = resolved.runtime.template;
  const decide = obs.streams.stream(`ai:bowl:${obs.sequence}`);
  const memory = buildMemory(obs.history, {
    strikerId: obs.batter.playerId,
    bowlerId: obs.bowler.playerId,
    window: diff.memoryWindow,
    accuracy: diff.memoryAccuracy,
  });
  const patterns = detectBatterPatterns(memory);
  const model = new ReplyModel(valueTable(s), estimatorFor(env, obs.batter));
  const scale = valueScale(s);
  const defs = templateDeliveries(plan, obs);
  if (defs.length === 0)
    throw new AIError('NO_VALID_DELIVERY_CANDIDATES', 'No delivery is available.');

  interface Candidate {
    id: string;
    def: DeliveryDefinition;
    x: number;
    y: number;
  }
  const candidates: Candidate[] = [];
  for (const def of defs)
    for (const cell of plan.cells) {
      const jx = (decide.next() * 2 - 1) * 0.02;
      const jy = (decide.next() * 2 - 1) * 0.02;
      candidates.push({
        id: `${def.id}@${cell.line}/${cell.length}`,
        def,
        x: clamp01(cell.x + jx),
        y: clamp01(cell.y + jy),
      });
    }

  const W = T.weights;
  const unitNoise = diff.decisionNoise * 0.5;
  const stencil = T.stencil;
  const wide = model.wideValue();
  const utilities: number[] = [];
  const parts: Record<string, number>[] = [];
  const workedLast = obs.history
    .slice(-2)
    .filter((b) => b.bowlerId === obs.bowler.playerId)
    .every((b) => !(b.runsOffBat >= 4 || b.runsOffBat + b.extras >= 2));

  for (const c of candidates) {
    const exp = expectDelivery(
      c.def,
      obs.bowler.style,
      obs.bowler.bowling,
      obs.bowler.fatigue,
      pitch,
    );
    const challenge = clamp01(
      exp.quality +
        exp.movement * B.contact.challengeMovement +
        (exp.speed / 45) * B.contact.challengePace,
    );
    let batterGain = 0;
    let pWicket = 0;
    let pWide = 0;
    for (const p of stencil) {
      const x = clamp01(c.x + p.dx * exp.radius);
      const y = clamp01(c.y + p.dy * exp.radius);
      const line = classifyLine(x);
      const length = classifyLength(y);
      if (line === 'wide_off' || line === 'wide_leg') {
        batterGain += p.w * wide;
        pWide += p.w;
        continue;
      }
      const reply = model.reply(line, length, challenge, exp.movement);
      batterGain += p.w * reply.value;
      pWicket += p.w * reply.pWicket;
    }
    batterGain += exp.noBall * wide;
    const value = -batterGain * scale;
    const execution = -(pWide * T.wideCost + exp.noBall * T.noBallCost) * 0.25;
    const delivery = {
      variationId: c.def.id,
      line: classifyLine(c.x),
      length: classifyLength(c.y),
    };
    const pattern = patternValue(patterns, delivery, obs.profile);
    // the same delivery to the same area again and again is only worth it while it is working
    const repeated =
      memory.repeatRun >= 2 &&
      memory.lastVariation === c.def.id &&
      memory.lastCell === cellKey(lineGroupOf(delivery.line), lengthGroupOf(delivery.length))
        ? (memory.repeatRun - 1) * (workedLast ? 0.25 : 1)
        : 0;
    const pitchTerm = pitchFit(c.def, pitch);
    const skillTerm = idealAttributeRating(c.def, obs.bowler.bowling) - 0.5;
    const personality =
      temperament.wicketSeeking * pWicket * 2 -
      (1 - temperament.variationNerve) * c.def.difficulty * (0.5 + obs.profile.variationPreference);
    const noise = gaussian(decide) * unitNoise;
    const u =
      W.value * value +
      W.execution * execution +
      W.pattern * pattern -
      W.repetition * repeated +
      W.pitch * pitchTerm +
      W.skill * skillTerm +
      W.personality * personality +
      noise;
    utilities.push(u);
    parts.push({
      value,
      execution,
      pattern,
      repetition: -repeated,
      pitch: pitchTerm,
      skill: skillTerm,
      personality,
      wicket: pWicket,
      wide: pWide,
      quality: exp.quality,
    });
  }

  const temperature =
    diff.temperature * (T.temperature / 0.14) * temperament.temperatureMultiplier;
  const probs = softmax(utilities, temperature);
  let chosen = pickIndex(decide, probs);
  const lapse =
    decide.next() <
    Math.min(0.5, diff.mistakeRate * temperament.mistakeMultiplier);
  if (lapse && candidates.length > 2) {
    const order = utilities
      .map((u, i) => ({ u, i }))
      .sort((a, b) => b.u - a.u)
      .map((e) => e.i);
    const span = Math.max(2, Math.ceil(order.length * 0.5));
    chosen = order[1 + Math.floor(decide.next() * (span - 1))]!;
  }
  const pick = candidates[chosen]!;
  const intent: AIDeliveryIntent = {
    variationId: pick.def.id,
    line: classifyLine(pick.x),
    length: classifyLength(pick.y),
    target: { x: round(pick.x), y: round(pick.y) },
  };

  let trace: AIDecisionTrace | null = null;
  if (obs.trace) {
    const order = utilities.map((_u, i) => i).sort((a, b) => utilities[b]! - utilities[a]!);
    const cand: AICandidateTrace[] = order.map((i) => ({
      id: candidates[i]!.id,
      utility: round(utilities[i]!),
      probability: round(probs[i]!),
      parts: Object.fromEntries(Object.entries(parts[i]!).map(([k, v]) => [k, round(v)])),
    }));
    const reasons = [...resolved.reasons, `plan: ${plan.label}`];
    if (patterns.length)
      reasons.push(
        `patterns: ${patterns.map((p) => `${p.id} (${round(p.strength * p.confidence)})`).join(', ')}`,
      );
    if (resolved.changed) reasons.push('new plan this ball');
    if (lapse) reasons.push('tactical lapse');
    trace = {
      kind: 'bowling',
      mode: resolved.mode,
      plan: {
        id: plan.id,
        objective: plan.objective,
        ballsUsed: resolved.runtime.ballsUsed,
      },
      risk: round(temperament.wicketSeeking),
      pressure: round(ctx.pressure),
      phase: ctx.phase,
      selected: candidates[chosen]!.id,
      reasons,
      candidates: cand,
    };
  }
  return { intent, trace };
}
