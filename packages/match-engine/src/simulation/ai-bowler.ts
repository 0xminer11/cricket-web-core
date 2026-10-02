import {
  DELIVERIES,
  ENGINE_BALANCE as B,
  classifyLength,
  classifyLine,
  lengthCenter,
  lineCenter,
  PITCH_LENGTHS,
  PITCH_LINES,
} from '@the-cricketer/game-core';
import type { DeliveryIntent, MatchPlayerSnapshot } from '../state/types';
import { MatchRandom } from '../rng/seeded';
import { clamp } from '../modifiers/effective';

/**
 * Basic AI bowler used when a human bats. It varies the delivery, the line and the length, and aims
 * at a specific point rather than a zone centre. FAIRNESS: it chooses before the batter has made any
 * decision, from its own seeded stream, and it has no hidden skill: how well the ball lands is the
 * engine's normal execution model using the bowler's real attributes.
 */
export function aiBowlerIntent(
  rngSeed: string,
  bowler: MatchPlayerSnapshot,
  sequence: number,
): DeliveryIntent {
  const rng = new MatchRandom(`${rngSeed}:ai-bowl:${sequence}`);
  const config = B.ai.bowler;
  const options = DELIVERIES.filter((d) =>
    d.eligibleStyles.includes(bowler.bowlingStyle!),
  );
  // easier (stock) deliveries are bowled more often than the tricky ones
  const weights = options.map((d) => 1 + (1 - d.difficulty) * config.easyBias);
  let roll = rng.next() * weights.reduce((sum, w) => sum + w, 0);
  let picked = 0;
  while (picked < options.length - 1 && roll >= weights[picked]!)
    roll -= weights[picked++]!;
  const delivery = options[picked]!;

  // line: weighted choice, then a small jitter around the zone centre
  const lineTotal = PITCH_LINES.reduce(
    (sum, line) => sum + config.lineWeights[line],
    0,
  );
  let lineRoll = rng.next() * lineTotal;
  let line = PITCH_LINES[0]!;
  for (const candidate of PITCH_LINES) {
    line = candidate;
    lineRoll -= config.lineWeights[candidate];
    if (lineRoll < 0) break;
  }
  // length: mostly the delivery's natural length, sometimes one step either way
  let length = delivery.defaultLength;
  const forced =
    delivery.id.endsWith('bouncer') || delivery.id.endsWith('yorker');
  if (!forced && rng.next() < config.lengthVariety) {
    const index = PITCH_LENGTHS.indexOf(length);
    const step = rng.next() < 0.5 ? -1 : 1;
    // never wander onto the extremes by accident: yorkers and bouncers are chosen deliberately
    length = PITCH_LENGTHS[Math.min(3, Math.max(1, index + step))]!;
  }
  const jitter = (n: number) => (rng.next() * 2 - 1) * n * config.jitter;
  const target = {
    x: clamp(lineCenter(line) + jitter(1)),
    y: clamp(lengthCenter(length) + jitter(1)),
  };
  return {
    variationId: delivery.id,
    line: classifyLine(target.x),
    length: classifyLength(target.y),
    target,
  };
}
