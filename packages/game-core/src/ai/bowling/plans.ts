import { PLAN_TEMPLATES } from '../config/plans';
import type { PlanTemplate } from '../config/plans';
import { AI_TUNING } from '../config/tuning';
import { clamp01, gaussian, pickIndex, softmax } from '../core/math';
import { ENGINE_BALANCE as B } from '../../config/engine.config';
import type { DeliveryDefinition, PitchDefinition } from '../../types/index';
import { analyzeContext, valueScale } from '../match-context/context';
import { buildMemory } from '../memory/memory';
import { detectBatterPatterns, patternValue } from '../memory/patterns';
import type { PatternSignal } from '../memory/patterns';
import { bowlingTemperament } from '../personality/personality';
import { bowlingStrategy } from '../strategies/bowling-modes';
import type {
  AIBatterView,
  BallRecord,
  BowlingAIObservation,
  BowlingMode,
  MatchSituation,
} from '../types';
import { BatterEstimator, ReplyModel, scoutBatter } from './batter-model';
import { valueTable } from '../scoring/expected-outcome';
import {
  deliveriesForStyle,
  expectDelivery,
  idealAttributeRating,
  isSpinStyle,
} from './execution-model';

const T = AI_TUNING.bowling;

/** A plan as it is running: the template, how many balls it has had and how it is going. */
export interface PlanRuntime {
  readonly template: PlanTemplate;
  readonly ballsUsed: number;
  readonly duration: number;
  /** consecutive failing balls */
  readonly failures: number;
  readonly lastFailed: boolean;
  readonly startedAt: number;
}

export interface PlanEnvironment {
  readonly obs: BowlingAIObservation;
  readonly pitch: PitchDefinition;
  /** One estimator per batter, shared by every step of the decision (see BatterEstimator). */
  readonly estimators: Map<string, BatterEstimator>;
}

/** The (scouted) estimator for a batter, created once per decision. */
export function estimatorFor(env: PlanEnvironment, batter: AIBatterView): BatterEstimator {
  let e = env.estimators.get(batter.playerId);
  if (!e) {
    e = new BatterEstimator(
      scoutBatter(
        batter,
        env.obs.profile.difficulty,
        env.obs.streams.stream(`ai:scout:${batter.playerId}`),
      ),
      env.pitch,
    );
    env.estimators.set(batter.playerId, e);
  }
  return e;
}

/** Eligible deliveries of a template for this bowler. */
export function templateDeliveries(
  template: PlanTemplate,
  obs: Pick<BowlingAIObservation, 'bowler'>,
): DeliveryDefinition[] {
  const style = obs.bowler.style;
  const spin = isSpinStyle(style);
  if (template.kind === 'pace' && spin) return [];
  if (template.kind === 'spin' && !spin) return [];
  return deliveriesForStyle(style).filter((d) =>
    template.ids
      ? template.ids.includes(d.id)
      : template.profiles
        ? template.profiles.includes(d.movementProfile)
        : true,
  );
}

/** How well a delivery's movement type suits the pitch (green favours seam and swing, dry favours spin, hard favours pace and bounce). */
export function pitchFit(def: DeliveryDefinition, pitch: PitchDefinition): number {
  const p = def.movementProfile;
  let multiplier: number;
  if (p.startsWith('swing')) multiplier = pitch.swingMultiplier;
  else if (p === 'seam' || p === 'cutter') multiplier = pitch.seamMultiplier;
  else if (['off_break', 'leg_break', 'googly', 'top_spin'].includes(p))
    multiplier = pitch.spinMultiplier;
  else if (def.id.endsWith('bouncer')) multiplier = pitch.bounceMultiplier;
  else if (def.id.endsWith('yorker') || p === 'slower') multiplier = 1;
  else multiplier = pitch.paceMultiplier;
  return (multiplier - 1) * 5;
}

/** The situation just before a ball that has already been bowled. */
export const situationBefore = (
  now: MatchSituation,
  rec: BallRecord,
): MatchSituation => ({
  ...now,
  runs: rec.before.runs,
  wickets: rec.before.wickets,
  legalBalls: rec.before.legalBalls,
});

/** The bowler's own balls of the current over, oldest first. */
export function currentOverBalls(obs: BowlingAIObservation): BallRecord[] {
  const s = obs.situation;
  const overStart = Math.floor(s.legalBalls / s.ballsPerOver) * s.ballsPerOver;
  const out: BallRecord[] = [];
  for (let i = obs.history.length - 1; i >= 0; i--) {
    const b = obs.history[i]!;
    if (
      b.inningsNumber !== s.inningsNumber ||
      b.bowlerId !== obs.bowler.playerId ||
      b.before.legalBalls < overStart
    )
      break;
    out.push(b);
  }
  return out.reverse();
}

/** A ball that worked for the bowling side: a dot, a wicket, or a poor contact that went for nothing much. */
export function ballWorked(b: BallRecord): boolean {
  const runs = b.runsOffBat + b.extras;
  if (b.wicket) return true;
  if (!b.legal) return false;
  if (runs === 0) return true;
  return ['poor', 'edge', 'miss'].includes(b.shot.contact) && runs <= 1;
}
/** A ball that went badly: a boundary, two or more runs, or a wide. */
export function ballFailed(b: BallRecord): boolean {
  const runs = b.runsOffBat + b.extras;
  return !b.wicket && (b.runsOffBat >= 4 || runs >= 2 || !b.legal);
}

interface ChooseInput {
  readonly env: PlanEnvironment;
  readonly situation: MatchSituation;
  readonly batter: AIBatterView;
  readonly patterns: readonly PatternSignal[];
  readonly mode: BowlingMode;
  readonly sequence: number;
  readonly avoid: string | null;
}

/** Score every plan template that fits and draw one (weighted, seeded). */
export function choosePlan(input: ChooseInput): {
  runtime: PlanRuntime;
  scores: { id: string; score: number; probability: number }[];
} {
  const { env, situation, batter, patterns, mode, sequence, avoid } = input;
  const obs = env.obs;
  const diff = obs.profile.difficulty;
  const ctx = analyzeContext(situation, obs.history, batter.playerId);
  const W = T.plan.weights;
  const model = new ReplyModel(valueTable(situation), estimatorFor(env, batter));
  const scale = valueScale(situation);
  const rng = obs.streams.stream(`ai:plan:${sequence}`);
  const eligible = PLAN_TEMPLATES.filter(
    (t) =>
      (!t.phases || t.phases.includes(ctx.phase)) &&
      templateDeliveries(t, obs).length > 0,
  );
  const templates = eligible.length
    ? eligible
    : PLAN_TEMPLATES.filter((t) => templateDeliveries(t, obs).length > 0);
  const scores: number[] = [];
  const unitNoise = diff.decisionNoise * 0.5;
  for (const template of templates) {
    const defs = templateDeliveries(template, obs);
    const expectations = defs.map((d) =>
      expectDelivery(d, obs.bowler.style, obs.bowler.bowling, obs.bowler.fatigue, env.pitch),
    );
    const challenge =
      expectations.reduce(
        (s, e) =>
          s +
          clamp01(
            e.quality +
              e.movement * B.contact.challengeMovement +
              (e.speed / 45) * B.contact.challengePace,
          ),
        0,
      ) / expectations.length;
    const movement =
      expectations.reduce((s, e) => s + e.movement, 0) / expectations.length;
    let batterTerm = 0;
    let weightTotal = 0;
    for (const c of template.cells) {
      batterTerm += c.weight * model.reply(c.line, c.length, challenge, movement).value;
      weightTotal += c.weight;
    }
    batterTerm = -(batterTerm / weightTotal) * scale;
    const skill =
      defs.reduce((s, d) => s + idealAttributeRating(d, obs.bowler.bowling), 0) /
        defs.length -
      0.5;
    const pitch = defs.reduce((s, d) => s + pitchFit(d, env.pitch), 0) / defs.length;
    let pattern = 0;
    for (const c of template.cells)
      for (const d of defs)
        pattern +=
          (c.weight / weightTotal / defs.length) *
          patternValue(patterns, { variationId: d.id, line: c.line, length: c.length }, obs.profile);
    const objective = T.objectiveFit[mode]?.[template.objective] ?? 0;
    scores.push(
      W.objective * objective +
        W.batter * batterTerm +
        W.skill * skill +
        W.pitch * pitch +
        W.pattern * pattern -
        W.novelty * (template.id === avoid ? 1 : 0) +
        gaussian(rng) * unitNoise * W.noise,
    );
  }
  const temperature =
    T.plan.temperature * (diff.temperature / 0.14) * 1; // scales with the difficulty's own temperature
  const probs = softmax(scores, temperature);
  const index = pickIndex(rng, probs);
  const template = templates[index]!;
  const [lo, hi] = T.plan.duration;
  const duration = lo + Math.floor(rng.next() * (hi - lo + 1));
  return {
    runtime: {
      template,
      ballsUsed: 0,
      duration,
      failures: 0,
      lastFailed: false,
      startedAt: sequence,
    },
    scores: templates.map((t, i) => ({
      id: t.id,
      score: scores[i]!,
      probability: probs[i]!,
    })),
  };
}

export interface ResolvedPlan {
  readonly runtime: PlanRuntime;
  /** The plan was newly chosen for this ball (as opposed to continued). */
  readonly changed: boolean;
  readonly mode: BowlingMode;
  readonly reasons: readonly string[];
  readonly scores: readonly { id: string; score: number; probability: number }[];
}

/**
 * The bowling plan manager (Module 12 section 237). The plan for THIS ball is a pure function of the balls already bowled this
 * over: it replays the over, ball by ball, applying exactly the decisions the AI would have made at each of them (each with only
 * the history before that ball), and then decides for the ball in hand. So the plan survives a server restart, a replay or a
 * second tab with no hidden state, and it is never influenced by anything that happened after the ball it is choosing for.
 *
 * A plan runs for 3-4 balls and is then reconsidered. A failing ball (a boundary, two or more runs, a wide) makes a switch
 * more likely, two failures in a row force one; balls that work (dots, wickets, poor contact) let it continue.
 */
export function resolvePlan(env: PlanEnvironment): ResolvedPlan {
  const obs = env.obs;
  const diff = obs.profile.difficulty;
  const over = currentOverBalls(obs);
  let runtime: PlanRuntime | null = null;
  let avoid: string | null = null;
  let changed = false;
  let lastMode: BowlingMode = 'CONTROL';
  let reasons: string[] = [];
  let scores: ResolvedPlan['scores'] = [];

  const step = (
    sequence: number,
    situation: MatchSituation,
    batter: AIBatterView,
    prefix: readonly BallRecord[],
  ): void => {
    const ctx = analyzeContext(situation, prefix, batter.playerId);
    const temperament = bowlingTemperament(obs.bowler, ctx.pressure);
    const strategy = bowlingStrategy(situation, ctx, batter, temperament);
    lastMode = strategy.mode;
    reasons = [...strategy.reasons];
    const memory = buildMemory(prefix, {
      strikerId: batter.playerId,
      bowlerId: null,
      window: diff.memoryWindow,
      accuracy: diff.memoryAccuracy,
    });
    const patterns = detectBatterPatterns(memory);
    let choose = false;
    if (!runtime) choose = true;
    else if (runtime.ballsUsed >= runtime.duration) choose = true;
    else if (runtime.failures >= 2) {
      choose = true;
      avoid = runtime.template.id;
      reasons.push('two failing balls in a row: switching plan');
    } else if (runtime.lastFailed && runtime.ballsUsed >= T.plan.minBalls) {
      const p = clamp01(
        T.plan.switchBase +
          T.plan.switchPerFailure *
            (0.4 + 0.6 * diff.adaptationStrength * obs.profile.adaptationRate),
      );
      if (obs.streams.stream(`ai:planswitch:${sequence}`).next() < p) {
        choose = true;
        avoid = runtime.template.id;
        reasons.push('the plan went for runs: switching');
      }
    } else if (
      (T.objectiveFit[strategy.mode]?.[runtime.template.objective] ?? 0) <= -0.35
    ) {
      choose = true;
      reasons.push(`the plan no longer suits ${strategy.mode}`);
    }
    if (choose) {
      const picked = choosePlan({
        env,
        situation,
        batter,
        patterns,
        mode: strategy.mode,
        sequence,
        avoid,
      });
      runtime = picked.runtime;
      scores = picked.scores;
      changed = true;
      avoid = null;
    } else changed = false;
  };

  for (const rec of over) {
    const prefix = obs.history.filter((h) => h.sequence < rec.sequence);
    const batter = obs.batters[rec.strikerId] ?? obs.batter;
    step(rec.sequence, situationBefore(obs.situation, rec), batter, prefix);
    const r: PlanRuntime = runtime!;
    const failed = ballFailed(rec);
    runtime = {
      ...r,
      ballsUsed: r.ballsUsed + 1,
      failures: failed ? r.failures + 1 : ballWorked(rec) ? 0 : r.failures,
      lastFailed: failed,
    };
    // a wicket brings a new batter: the plan starts afresh
    if (rec.wicket) runtime = null;
  }
  step(obs.sequence, obs.situation, obs.batter, obs.history);
  return {
    runtime: runtime!,
    changed,
    mode: lastMode,
    reasons,
    scores,
  };
}
