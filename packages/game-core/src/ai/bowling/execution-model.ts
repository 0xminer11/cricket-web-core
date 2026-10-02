import { DELIVERIES } from '../../seed/deliveries.seed';
import { BOWLING_STYLE_WEIGHTS } from '../../config/bowling.config';
import { ENGINE_BALANCE as B } from '../../config/engine.config';
import type {
  BowlingAttributes,
  BowlingStyle,
  DeliveryDefinition,
  PitchDefinition,
} from '../../types/index';
import { clamp01 } from '../core/math';

/**
 * A bowler's idea of how well they will bowl a given ball (Module 12 sections 63-64 and 124-125). Players know roughly how
 * accurate they are, so the AI estimates the quality, the error radius and the movement of a delivery from the bowler's own
 * attributes with the engine's published constants. It is an ESTIMATE used to choose: the engine still draws the real error
 * with the bowler's real attributes, and difficulty never touches any of these numbers.
 */
export interface DeliveryExpectation {
  readonly quality: number;
  readonly radius: number;
  readonly movement: number;
  readonly speed: number;
  readonly noBall: number;
}

export const deliveriesForStyle = (
  style: BowlingStyle,
): readonly DeliveryDefinition[] =>
  DELIVERIES.filter((d) => d.eligibleStyles.includes(style));

export const isSpinStyle = (style: BowlingStyle): boolean =>
  BOWLING_STYLE_WEIGHTS[style].spin > 0;

export function expectDelivery(
  def: DeliveryDefinition,
  style: BowlingStyle,
  bowling: BowlingAttributes,
  fatigue: number,
  pitch: PitchDefinition,
): DeliveryExpectation {
  const weights = BOWLING_STYLE_WEIGHTS[style];
  const quality = clamp01(
    (bowling.accuracy * B.execution.accuracy +
      bowling.control * B.execution.control +
      bowling.consistency * B.execution.consistency) /
      100 -
      def.difficulty * B.execution.difficulty +
      (bowling.variation / 100 - 0.5) * B.execution.variationShare * def.difficulty,
  );
  const radius =
    B.execution.error *
    (1 - bowling.accuracy / 100) *
    (1 - bowling.control / 200) *
    (1 + def.controlPenalty) *
    (1 + fatigue / 100);
  const strength = def.movementStrength * (0.5 + quality / 2);
  const swing =
    weights.swing && def.movementProfile.startsWith('swing')
      ? ((strength * bowling.swing) / 100) * pitch.swingMultiplier
      : 0;
  const seam =
    weights.seam && ['seam', 'cutter'].includes(def.movementProfile)
      ? ((strength * bowling.seam) / 100) * pitch.seamMultiplier
      : 0;
  const spin =
    weights.spin &&
    ['off_break', 'leg_break', 'googly', 'top_spin'].includes(def.movementProfile)
      ? ((strength * bowling.spin) / 100) * pitch.spinMultiplier
      : 0;
  const band = weights.spin
    ? B.speed.spin
    : style.includes('medium')
      ? B.speed.medium
      : B.speed.fast;
  const speed =
    (band[0] + (band[1] * (weights.spin ? bowling.control : bowling.pace)) / 100) *
    pitch.paceMultiplier *
    (B.speed.executionFloor + (1 - B.speed.executionFloor) * quality) *
    (def.movementProfile === 'slower' ? B.speed.slower : 1);
  return {
    quality,
    radius,
    movement: swing + seam + spin,
    speed,
    noBall: B.extras.noBallBase + (1 - quality) * B.extras.noBallError,
  };
}

/** Probability that a uniform error of +/- radius around x leaves the pitch's wide bands (x < 0.12 or x > 0.85). */
export function wideProbability(x: number, radius: number): number {
  if (radius <= 1e-6) return x < 0.12 || x > 0.85 ? 1 : 0;
  const lo = x - radius;
  const hi = x + radius;
  const span = hi - lo;
  const wideOff = Math.max(0, Math.min(hi, 0.12) - lo);
  const wideLeg = Math.max(0, hi - Math.max(lo, 0.85));
  return Math.min(1, (wideOff + wideLeg) / span);
}

/** Which attribute makes a delivery work, as a 0..1 rating of this bowler. */
export function idealAttributeRating(
  def: DeliveryDefinition,
  bowling: BowlingAttributes,
): number {
  return (bowling[def.idealAttribute] ?? 50) / 100;
}
