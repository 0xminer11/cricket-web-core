import {
  DELIVERIES,
  ENGINE_BALANCE as B,
  BOWLING_STYLE_WEIGHTS,
  PITCH_LINES,
  PITCH_LENGTHS,
  classifyLine,
  classifyLength,
} from '@the-cricketer/game-core';
import type { RandomSource, PitchDefinition } from '@the-cricketer/game-core';
import type {
  MatchPlayerSnapshot,
  DeliveryIntent,
  ResolvedDelivery,
} from '../state/types';
import { clamp } from '../modifiers/effective';
/** The geometry lives in game-core so presentation layers classify a target identically. */
export const LINES = PITCH_LINES;
export const LENGTHS = PITCH_LENGTHS;
export { classifyLine, classifyLength };
export function resolveDelivery(
  intent: DeliveryIntent,
  player: MatchPlayerSnapshot,
  pitch: PitchDefinition,
  rng: RandomSource,
): ResolvedDelivery {
  const def = DELIVERIES.find((d) => d.id === intent.variationId)!;
  const attrs = player.bowling;
  const weights = BOWLING_STYLE_WEIGHTS[player.bowlingStyle!];
  // -1..1; 0 (the default for AI/headless play and any intent without an input) changes nothing.
  const input = (clamp(intent.executionInput ?? 0.5) - 0.5) * 2;
  const baseQuality = clamp(
    (attrs.accuracy * B.execution.accuracy +
      attrs.control * B.execution.control +
      attrs.consistency * B.execution.consistency) /
      100 -
      def.difficulty * B.execution.difficulty +
      (rng.next() - 0.5) * B.execution.variance +
      (attrs.variation / 100 - 0.5) *
        B.execution.variationShare *
        def.difficulty,
  );
  const quality = clamp(baseQuality + input * B.execution.inputQuality);
  const radius =
    B.execution.error *
    (1 - input * B.execution.inputRadius) *
    (1 - attrs.accuracy / 100) *
    (1 - attrs.control / 200) *
    (1 + def.controlPenalty) *
    (1 + player.fatigue / 100);
  const target = intent.target ?? {
    x: B.lineCenters[intent.line],
    y: B.lengthCenters[intent.length],
  };
  const actualTarget = {
    x: clamp(target.x + (rng.next() * 2 - 1) * radius),
    y: clamp(target.y + (rng.next() * 2 - 1) * radius),
  };
  const speedBand = weights.spin
    ? B.speed.spin
    : player.bowlingStyle!.includes('medium')
      ? B.speed.medium
      : B.speed.fast;
  const speed =
    (speedBand[0] +
      (speedBand[1] * (weights.spin ? attrs.control : attrs.pace)) / 100) *
    pitch.paceMultiplier *
    (B.speed.executionFloor + (1 - B.speed.executionFloor) * quality) *
    (def.movementProfile === 'slower' ? B.speed.slower : 1);
  const movement = def.movementStrength * (0.5 + quality / 2);
  const swing =
    weights.swing && def.movementProfile.startsWith('swing')
      ? ((movement * attrs.swing) / 100) * pitch.swingMultiplier
      : 0;
  const seam =
    weights.seam && ['seam', 'cutter'].includes(def.movementProfile)
      ? ((movement * attrs.seam) / 100) * pitch.seamMultiplier
      : 0;
  const spin =
    weights.spin &&
    ['off_break', 'leg_break', 'googly', 'top_spin'].includes(
      def.movementProfile,
    )
      ? ((movement * attrs.spin) / 100) * pitch.spinMultiplier
      : 0;
  return {
    deliveryDefinitionId: def.id,
    intendedLine: intent.line,
    intendedLength: intent.length,
    target: { ...target },
    actualTarget,
    actualLine: classifyLine(actualTarget.x),
    actualLength: classifyLength(actualTarget.y),
    speed,
    swing,
    seam,
    spin,
    bounce: clamp(((actualTarget.y * speed) / 40) * pitch.bounceMultiplier),
    executionQuality: quality,
    noBall:
      rng.next() < B.extras.noBallBase + (1 - quality) * B.extras.noBallError,
  };
}
