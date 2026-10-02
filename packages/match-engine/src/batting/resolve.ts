import {
  SHOTS,
  shotSuitability,
  fieldRegion,
  CONTACT_WEIGHTS as W,
  CONTACT_QUALITY_BANDS,
  ENGINE_BALANCE as B,
} from '@the-cricketer/game-core';
import type {
  RandomSource,
  PitchDefinition,
  ContactQuality,
} from '@the-cricketer/game-core';
import type {
  MatchPlayerSnapshot,
  ShotIntent,
  ResolvedDelivery,
  ResolvedShot,
} from '../state/types';
import { clamp } from '../modifiers/effective';
export { shotSuitability };
export function contactQuality(score: number): ContactQuality {
  return (
    (Object.keys(CONTACT_QUALITY_BANDS) as ContactQuality[]).find(
      (key) => score >= CONTACT_QUALITY_BANDS[key][0],
    ) ?? 'miss'
  );
}
export { fieldRegion };
export function resolveShot(
  intent: ShotIntent,
  player: MatchPlayerSnapshot,
  delivery: ResolvedDelivery,
  pitch: PitchDefinition,
  rng: RandomSource,
): ResolvedShot {
  const def = SHOTS.find((s) => s.id === intent.shotId)!;
  const a = player.batting;
  const suitability = shotSuitability(
    def,
    delivery.actualLine,
    delivery.actualLength,
  );
  const fit = clamp(
    suitability +
      (((1 - suitability) * a.footwork) / 100) * B.contact.mismatchRecovery,
  );
  const skill =
    (a.timing * B.contact.skillTiming +
      a.technique * B.contact.technique +
      a.consistency * B.contact.consistency) /
    100;
  const challenge = clamp(
    delivery.executionQuality +
      (delivery.swing + delivery.seam + delivery.spin) *
        B.contact.challengeMovement +
      (delivery.speed / 45) * B.contact.challengePace,
  );
  const delta =
    intent.timingInput ??
    (rng.next() * 2 - 1) *
      (B.contact.timingFloor +
        (1 - a.timing / 100) * B.contact.timingSpread +
        def.timingDifficulty * B.contact.difficultyTiming);
  const timing = clamp(
    1 -
      Math.abs(delta) +
      (player.physical.reflex / 100) * B.contact.reflexAssist -
      challenge * B.contact.difficultyTiming,
  );
  const contactScore = clamp(
    W.userTiming * timing +
      W.shotSelection * suitability * (0.5 + a.shotSelection / 200) +
      W.lineLengthFit * fit +
      W.battingSkill * skill +
      W.bowlerChallenge * (1 - challenge) +
      W.pitch / pitch.battingDifficultyMultiplier +
      (W.form * player.form) / 100 +
      W.fatigue * (1 - player.fatigue / 100) +
      (W.pressure * player.personality.confidence) / 100,
  );
  const direction =
    def.directionDegrees[0] +
    ((def.directionDegrees[1] - def.directionDegrees[0]) *
      ((intent.directionInput ?? 0) + 1)) /
      2 +
    (rng.next() * 2 - 1) * (1 - a.placement / 100) * B.outcome.directionSpread;
  return {
    shotId: def.id,
    aggression: intent.aggression ?? 0.5,
    suitability,
    timing,
    contactScore,
    contactQuality: contactQuality(contactScore),
    direction,
    worldDirection: player.battingHand === 'left' ? -direction : direction,
    sector: fieldRegion(direction),
    exitSpeed:
      (B.outcome.exitSpeedBase + (B.outcome.exitSpeedPower * a.power) / 100) *
      contactScore *
      def.powerMultiplier,
    launchAngle:
      def.category === 'lofted' ? B.outcome.loftAngle : B.outcome.groundAngle,
  };
}
