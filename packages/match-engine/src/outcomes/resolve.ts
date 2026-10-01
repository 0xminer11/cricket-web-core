import { ENGINE_BALANCE as B, SHOTS } from '@the-cricketer/game-core';
import type { RandomSource } from '@the-cricketer/game-core';
import type {
  Outcome,
  ResolvedDelivery,
  ResolvedShot,
  MatchPlayerSnapshot,
} from '../state/types';
export function resolveOutcome(
  delivery: ResolvedDelivery,
  shot: ResolvedShot,
  player: MatchPlayerSnapshot,
  rng: RandomSource,
): Outcome {
  const result: Outcome = {
    runsOffBat: 0,
    extras: 0,
    extraType: null,
    wicketType: null,
    legalDelivery: true,
    completedRuns: 0,
    distanceClass: 'infield',
  };
  if (delivery.noBall)
    Object.assign(result, {
      extras: 1,
      extraType: 'no_ball',
      legalDelivery: false,
    });
  else if (
    delivery.actualLine === 'wide_off' ||
    delivery.actualLine === 'wide_leg'
  )
    return { ...result, extras: 1, extraType: 'wide', legalDelivery: false };
  const def = SHOTS.find((s) => s.id === shot.shotId)!;
  const defensive = def.category === 'defensive';
  const movement = delivery.swing + delivery.seam + delivery.spin;
  const wicketChance =
    B.outcome.wicket[shot.contactQuality] *
    (B.outcome.riskBase + def.risk * B.outcome.riskScale) *
    (defensive
      ? B.outcome.defensiveWicket *
        (1 - (player.batting.defence / 100) * B.outcome.defenceShare)
      : 1) *
    (1 + movement * B.outcome.movementWicket) *
    (1 + (shot.aggression - 0.5) * B.outcome.aggressionRisk);
  const onStumps =
    ['middle', 'off_stump', 'leg'].includes(delivery.actualLine) &&
    ['full', 'good', 'yorker'].includes(delivery.actualLength);
  if (
    rng.next() < wicketChance &&
    !delivery.noBall &&
    (shot.contactQuality !== 'miss' || onStumps)
  ) {
    result.wicketType =
      shot.contactQuality === 'miss'
        ? rng.next() < B.outcome.bowledShare
          ? 'bowled'
          : 'lbw'
        : 'caught';
    return result;
  }
  const weights: number[] = [...B.outcome[shot.contactQuality]];
  const power =
    B.outcome.powerFloor +
    ((player.batting.power * (1 - B.outcome.strengthShare) +
      player.physical.strength * B.outcome.strengthShare) /
      100) *
      B.outcome.powerScale;
  for (let i = 4; i < 6; i++)
    weights[i] =
      ((weights[i]! *
        power *
        def.powerMultiplier *
        B.outcome.fieldCoverage[shot.sector] *
        (1 + (shot.aggression - 0.5) * B.outcome.aggressionPower) *
        (1 +
          (player.batting.placement / 100 - 0.5) * B.outcome.placementShare)) /
        (1 + movement * B.outcome.movementBoundary)) *
      (defensive
        ? B.outcome.defensiveBoundary
        : def.category === 'lofted'
          ? B.outcome.loftBoundary
          : 1);
  if (defensive) {
    weights[0] = weights[0]! * 2;
    weights[2] = weights[2]! / 2;
    weights[5] = 0;
  }
  let roll = rng.next() * weights.reduce((sum, w) => sum + w, 0);
  let index = 0;
  while (index < weights.length - 1 && roll >= weights[index]!)
    roll -= weights[index++]!;
  result.runsOffBat = B.outcome.runs[index]!;
  if (shot.contactQuality === 'miss' && !delivery.noBall) {
    const extra = rng.next();
    if (extra < B.extras.bye + B.extras.legBye)
      Object.assign(result, {
        extras: 1,
        extraType: extra < B.extras.bye ? 'bye' : 'leg_bye',
      });
  }
  result.completedRuns = result.runsOffBat < 4 ? result.runsOffBat : 0;
  if (result.extraType === 'bye' || result.extraType === 'leg_bye')
    result.completedRuns = result.extras;
  result.distanceClass =
    result.runsOffBat === 6
      ? 'six'
      : result.runsOffBat === 4
        ? 'boundary'
        : result.completedRuns > 1
          ? 'outfield'
          : 'infield';
  return result;
}
