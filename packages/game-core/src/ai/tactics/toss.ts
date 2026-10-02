import { PITCHES } from '../../config/pitch.config';
import { MATCH_FORMATS } from '../../config/match.config';
import type { RandomSource } from '../../utils/runtime';
import { AI_TUNING } from '../config/tuning';
import { gaussian, sigmoid } from '../core/math';

const T = AI_TUNING.toss;

/** What the AI knows about a side when it chooses at the toss: its real roster, not a rating alone. */
export interface TossSideSummary {
  /** Mean batting overall of the side's top order, 0..100. */
  readonly battingStrength: number;
  /** Mean bowling overall of its bowlers, 0..100. */
  readonly bowlingStrength: number;
  readonly paceBowlers: number;
  readonly spinBowlers: number;
}

export interface TossAIInput {
  readonly pitchId: string;
  readonly formatId: string;
  readonly own: TossSideSummary;
  readonly opponent: TossSideSummary;
}

export interface TossAIResult {
  readonly decision: 'bat' | 'bowl';
  /** Probability the AI preferred to bat (before the draw). */
  readonly pBat: number;
  readonly reasons: readonly string[];
}

/**
 * The AI's toss decision (Module 12 section 73). It weighs the pitch (green favours bowling first, hard and dry favour batting
 * first), what its own attack suits (a pace-heavy attack on a green pitch, spin on a dry one), the strength of its batting
 * against its bowling, and the format; then it DRAWS the choice from a seeded probability, so the same side does not choose
 * identically every time but a strong reason makes the choice very likely.
 */
export function chooseTossDecision(
  input: TossAIInput,
  rng: RandomSource,
): TossAIResult {
  const pitch = PITCHES.find((p) => p.id === input.pitchId) ?? PITCHES[1]!;
  const format = MATCH_FORMATS.find((f) => f.id === input.formatId);
  const reasons: string[] = [];
  // pitch: positive = bat first
  const pitchLean =
    input.pitchId === 'pitch.green' ? -1 : input.pitchId === 'pitch.dry' ? 0.6 : 0.3;
  // composition: how well the attack suits the pitch
  const bowlers = Math.max(1, input.own.paceBowlers + input.own.spinBowlers);
  const paceShare = input.own.paceBowlers / bowlers;
  const attackFit =
    ((pitch.seamMultiplier + pitch.swingMultiplier) / 2 - 1) * paceShare * 10 +
    (pitch.spinMultiplier - 1) * (1 - paceShare) * 10;
  // strengths: stronger batting than bowling = bat first
  const balance = (input.own.battingStrength - input.own.bowlingStrength) / 50;
  // the opponent's batting strength makes bowling first a better idea (restrict them), their weak batting the opposite
  const threat = (input.opponent.battingStrength - input.own.bowlingStrength) / 80;
  const formatLean = format ? (1 - format.aiAggressionModifier) * 0.5 : 0;
  const d =
    T.weights.pitch * pitchLean -
    T.weights.composition * attackFit +
    T.weights.strength * balance -
    T.weights.strength * 0.5 * threat +
    T.weights.format * formatLean +
    gaussian(rng) * 0.0; // keeps the stream's draw count fixed whatever the inputs
  reasons.push(
    pitchLean < 0 ? 'the pitch helps bowlers early' : 'the pitch is good for batting first',
  );
  if (attackFit > 0.15) reasons.push('the attack suits the pitch');
  if (balance > 0.2) reasons.push('the batting is the stronger half');
  else if (balance < -0.2) reasons.push('the bowling is the stronger half');
  const pBat = sigmoid(d / T.temperature);
  const decision = rng.next() < pBat ? 'bat' : 'bowl';
  return { decision, pBat, reasons };
}
