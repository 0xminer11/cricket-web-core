import { SHOTS, ENGINE_BALANCE as B } from '@the-cricketer/game-core';
import type {
  DeliveryIntent,
  MatchPlayerSnapshot,
  ShotIntent,
} from '../state/types';
import { MatchRandom } from '../rng/seeded';
import { shotSuitability } from '../batting/resolve';
import { clamp } from '../modifiers/effective';

export interface AiBattingContext {
  /** Chase only: runs still needed and legal balls left; null/absent when batting first. */
  readonly runsNeeded?: number | null;
  readonly ballsRemaining?: number | null;
}

/**
 * Basic AI batter for matches where a human bowls. FAIRNESS MODEL: it sees only what a batter sees
 * when the bowler runs in - the bowler's declared variation and the line/length that was aimed at -
 * plus the match situation. It never sees the resolved execution error, the delivery's RNG stream,
 * or the outcome, and it gets no hidden skill boost: the same attributes and formulas apply as to a
 * human. It draws from its own seeded stream, so identical (seed, sequence, intent) always yields the
 * identical shot, which is what makes replays and retried actions reproducible.
 */
export function aiShotIntent(
  rngSeed: string,
  batter: MatchPlayerSnapshot,
  delivery: Pick<DeliveryIntent, 'variationId' | 'line' | 'length'>,
  sequence: number,
  context: AiBattingContext = {},
): ShotIntent {
  const rng = new MatchRandom(`${rngSeed}:ai-shot:${sequence}`);
  const urgency =
    context.runsNeeded != null &&
    context.ballsRemaining != null &&
    context.ballsRemaining > 0
      ? clamp(
          (context.runsNeeded / context.ballsRemaining -
            B.simulation.chaseParRate) /
            B.simulation.chaseRateSpan,
        )
      : 0;
  const loft =
    B.simulation.loftProbability *
    (0.5 + batter.personality.riskAppetite / 100) *
    (1 + urgency * B.simulation.chaseLoftBoost);
  const defensive = B.simulation.defensiveProbability * (1 - urgency);
  const roll = rng.next();
  const category =
    roll < defensive
      ? 'defensive'
      : roll < defensive + loft
        ? 'lofted'
        : 'attack';
  const candidates = SHOTS.filter((shot) =>
    category === 'attack'
      ? ['drive', 'cross_bat'].includes(shot.category)
      : shot.category === category,
  );
  const scored = candidates.map((shot) => ({
    shot,
    score:
      shotSuitability(shot, delivery.line, delivery.length) +
      rng.next() * B.simulation.decisionNoise,
  }));
  scored.sort((a, b) => b.score - a.score);
  return { shotId: scored[0]!.shot.id };
}
