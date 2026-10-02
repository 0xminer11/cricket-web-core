import { PITCHES } from '../../config/pitch.config';
import { BOWLING_STYLE_WEIGHTS } from '../../config/bowling.config';
import { AI_TUNING } from '../config/tuning';
import { clamp01, gaussian, pickIndex, softmax } from '../core/math';
import { analyzeContext } from '../match-context/context';
import type {
  AIBowlerView,
  AICandidateTrace,
  AIDecisionTrace,
  AIResult,
  BowlerSelectionObservation,
} from '../types';
import { AIError } from '../types';
import { isSpinStyle } from './execution-model';

const T = AI_TUNING.selection;
const round = (n: number): number => Math.round(n * 1000) / 1000;

/** A bowler's overall skill for their own style, 0..1 (the same style weights Module 0 uses for the bowling overall). */
export function bowlerRating(b: AIBowlerView): number {
  const w = BOWLING_STYLE_WEIGHTS[b.style] as Record<string, number>;
  const a = b.bowling as unknown as Record<string, number>;
  let total = 0;
  for (const [k, weight] of Object.entries(w)) total += (a[k] ?? 0) * weight;
  return clamp01(total / 100);
}

/**
 * Choosing who bowls the next over (Module 12 sections 75-79). Candidates are only the bowlers the engine says are eligible, so a
 * restriction (consecutive overs, the over cap) can never be broken. They are ranked on skill, how the pitch suits them, the
 * matchup with the batter on strike, the phase (new ball and death overs ask for different strengths), fatigue and form, then drawn
 * with a seeded weighted choice so the order is not a fixed list.
 */
export function chooseBowlerAI(
  obs: BowlerSelectionObservation,
): AIResult<{ playerId: string }> {
  if (obs.candidates.length === 0)
    throw new AIError('AI_INVALID_BOWLER', 'There is no eligible bowler.');
  const s = obs.situation;
  const diff = obs.profile.difficulty;
  const pitch = PITCHES.find((p) => p.id === s.pitchId) ?? PITCHES[1]!;
  const ctx = analyzeContext(s, obs.history, obs.batter?.playerId ?? null);
  const rng = obs.streams.stream(`ai:select:${obs.sequence}`);
  const nextOver = Math.floor(s.legalBalls / s.ballsPerOver) / Math.max(1, s.maxBalls / s.ballsPerOver);
  const phase = nextOver < 0.3 ? 'early' : nextOver >= 0.66 ? 'death' : 'middle';
  const parts: Record<string, number>[] = [];
  const utilities: number[] = [];
  for (const b of obs.candidates) {
    const rating = bowlerRating(b);
    const spin = isSpinStyle(b.style);
    const pitchFit =
      ((spin
        ? pitch.spinMultiplier
        : (pitch.seamMultiplier + pitch.swingMultiplier + pitch.paceMultiplier) / 3) -
        1) *
      5;
    const a = b.bowling;
    const phaseFit =
      phase === 'death'
        ? (a.accuracy * 0.6 + a.control * 0.4) / 100 - 0.5
        : phase === 'early' && !spin
          ? ((a.swing + a.seam + a.pace) / 3 / 100) - 0.5
          : phase === 'middle' && spin
            ? a.spin / 100 - 0.5
            : 0;
    const batter = obs.batter;
    // a batter who is weak against pace is better bowled to by pace, and the reverse for spin (their own footwork and technique)
    const matchup = batter
      ? spin
        ? (60 - (batter.batting.footwork + batter.batting.technique) / 2) / 100
        : (60 - batter.physical.reflex) / 100
      : 0;
    const matchupNoise = (1 - diff.matchupAwareness) * 0.2;
    const fatigue = b.fatigue / 100;
    const form = 0; // a bowler's own form is already inside their effective attributes
    const workload = b.maxOvers !== null ? (b.maxOvers - b.oversBowled) / Math.max(1, b.maxOvers) : 0.5;
    const spellOutcome =
      b.legalBalls > 0 ? -((b.runsConceded / b.legalBalls - 1.5) / 3) + b.wickets * 0.15 : 0;
    const noise = gaussian(rng) * diff.decisionNoise * 0.5 + gaussian(rng) * matchupNoise * 0.5;
    const u =
      T.weights.skill * (rating - 0.5) +
      T.weights.pitch * pitchFit +
      T.weights.matchup * matchup +
      T.weights.phase * phaseFit -
      T.weights.fatigue * fatigue +
      T.weights.form * form +
      T.weights.workload * workload * 0.1 +
      0.2 * spellOutcome +
      noise;
    utilities.push(u);
    parts.push({ skill: rating - 0.5, pitch: pitchFit, matchup, phase: phaseFit, fatigue: -fatigue, spell: spellOutcome });
  }
  const probs = softmax(utilities, T.temperature * (diff.temperature / 0.14));
  const index = pickIndex(rng, probs);
  const chosen = obs.candidates[index]!;
  let trace: AIDecisionTrace | null = null;
  if (obs.trace) {
    const order = utilities.map((_u, i) => i).sort((x, y) => utilities[y]! - utilities[x]!);
    const candidates: AICandidateTrace[] = order.slice(0, 6).map((i) => ({
      id: obs.candidates[i]!.playerId,
      utility: round(utilities[i]!),
      probability: round(probs[i]!),
      parts: Object.fromEntries(Object.entries(parts[i]!).map(([k, v]) => [k, round(v)])),
    }));
    trace = {
      kind: 'bowler_selection',
      mode: phase,
      risk: 0,
      pressure: round(ctx.pressure),
      phase: ctx.phase,
      selected: chosen.playerId,
      reasons: [`${phase} overs`, `${PITCHES.find((p) => p.id === s.pitchId)?.displayName ?? 'the'} pitch`],
      candidates,
    };
  }
  return { intent: { playerId: chosen.playerId }, trace };
}
