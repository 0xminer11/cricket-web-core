import { BATTING_INPUT, PITCHES, SHOTS } from '@the-cricketer/game-core';
import type { BattingAssist } from '@the-cricketer/game-core';
import type { MatchPlayerSnapshot, ResolvedDelivery } from '../state/types';
import { MatchRandom } from '../rng/seeded';
import { resolveDelivery } from '../bowling/resolve';
import { resolveShot, shotSuitability } from '../batting/resolve';
import { resolveOutcome } from '../outcomes/resolve';
import { humanShotIntent } from '../batting/human-input';
import {
  calculateEffectiveMatchAttributes,
  clamp,
} from '../modifiers/effective';
import { aiBowlerIntent } from './ai-bowler';

/** How the (simulated) human chooses a shot for a delivery they can see. */
export type ShotPolicy = 'appropriate' | 'random' | 'poor' | { fixed: string };

/** Standard deviation of the contact-time error, in presentation seconds. */
export const TIMING_LEVELS = {
  rookie: 0.12,
  average: 0.06,
  advanced: 0.03,
  /** Never mistimed: the best a human could do. */
  perfect: 0,
} as const;
export type TimingLevel = keyof typeof TIMING_LEVELS;

export interface HumanBattingSimOptions {
  readonly count: number;
  readonly batter: MatchPlayerSnapshot;
  readonly bowler: MatchPlayerSnapshot;
  readonly pitchId: string;
  readonly seed: string;
  readonly timing: TimingLevel | number;
  readonly shots: ShotPolicy;
  readonly assist?: BattingAssist;
  /** Force a particular delivery type and aim instead of the AI bowler's varied choice. */
  readonly delivery?: { variationId: string; target: { x: number; y: number } };
}

/** Box-Muller from the engine's own seeded stream: simulations are reproducible. */
function gaussian(rng: MatchRandom): number {
  const u = Math.max(1e-9, rng.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

/** The shot a sensible player would pick: highest suitability for the ball, lowest risk on ties. */
export function bestShotFor(
  delivery: Pick<ResolvedDelivery, 'actualLine' | 'actualLength'>,
) {
  let best = SHOTS[0]!;
  let bestScore = -1;
  for (const shot of SHOTS) {
    const score =
      shotSuitability(shot, delivery.actualLine, delivery.actualLength) -
      shot.risk * 0.05;
    if (score > bestScore) {
      best = shot;
      bestScore = score;
    }
  }
  return best;
}

/** The most unsuitable shot for the ball: what a player who ignores the delivery does. */
function worstShotFor(
  delivery: Pick<ResolvedDelivery, 'actualLine' | 'actualLength'>,
) {
  let worst = SHOTS[0]!;
  let worstScore = 2;
  for (const shot of SHOTS) {
    const score = shotSuitability(
      shot,
      delivery.actualLine,
      delivery.actualLength,
    );
    if (score < worstScore) {
      worst = shot;
      worstScore = score;
    }
  }
  return worst;
}

export interface HumanBattingSimResult {
  readonly count: number;
  readonly contacts: Record<string, number>;
  /** Every ball as a percentage of all deliveries. */
  readonly percentages: Record<string, number>;
  /** Contact rate: share of deliveries where the bat met the ball (not a miss, not a wide). */
  readonly contactPercent: number;
  readonly goodOrBetterPercent: number;
  readonly boundaryPercent: number;
  readonly wicketPercent: number;
  readonly dotPercent: number;
  readonly runsPerBall: number;
}

/** Headless batting by a simulated human: the real resolvers, a chosen timing skill and shot policy. */
export function simulateHumanBatting(
  options: HumanBattingSimOptions,
): HumanBattingSimResult {
  const pitch = PITCHES.find((p) => p.id === options.pitchId)!;
  const bowler = calculateEffectiveMatchAttributes(options.bowler);
  const batter = calculateEffectiveMatchAttributes(options.batter);
  const sd =
    typeof options.timing === 'number'
      ? options.timing
      : TIMING_LEVELS[options.timing];
  const contacts: Record<string, number> = {};
  let runs = 0;
  let boundaries = 0;
  let wickets = 0;
  let dots = 0;
  let wides = 0;
  for (let i = 1; i <= options.count; i++) {
    const intent = options.delivery
      ? {
          variationId: options.delivery.variationId as never,
          line: 'off_stump' as const,
          length: 'good' as const,
          target: options.delivery.target,
        }
      : aiBowlerIntent(options.seed, options.bowler, i);
    const delivery = resolveDelivery(
      intent,
      bowler,
      pitch,
      new MatchRandom(`${options.seed}:ball:${i}:delivery`),
    );
    const policy = options.shots;
    const rng = new MatchRandom(`${options.seed}:sim-human:${i}`);
    const shot =
      policy === 'appropriate'
        ? bestShotFor(delivery)
        : policy === 'poor'
          ? worstShotFor(delivery)
          : policy === 'random'
            ? SHOTS[Math.floor(rng.next() * SHOTS.length)]!
            : SHOTS.find((s) => s.id === policy.fixed)!;
    const error =
      sd === 0 ? 0 : (gaussian(rng) * sd) / BATTING_INPUT.windowSeconds;
    const shotIntent = humanShotIntent(
      {
        shotId: shot.id,
        direction: 0,
        timing: clamp(error, -1, 1),
        assist: options.assist ?? 'off',
      },
      options.batter,
      delivery,
    );
    const resolved = resolveShot(
      shotIntent,
      batter,
      delivery,
      pitch,
      new MatchRandom(`${options.seed}:ball:${i}:contact`),
    );
    const outcome = resolveOutcome(
      delivery,
      resolved,
      batter,
      new MatchRandom(`${options.seed}:ball:${i}:outcome`),
    );
    const wide = outcome.extraType === 'wide';
    if (wide) wides++;
    else
      contacts[resolved.contactQuality] =
        (contacts[resolved.contactQuality] ?? 0) + 1;
    runs += outcome.runsOffBat + outcome.extras;
    if (outcome.wicketType) wickets++;
    else if (outcome.runsOffBat >= 4) boundaries++;
    if (!outcome.wicketType && outcome.runsOffBat + outcome.extras === 0)
      dots++;
  }
  const n = options.count;
  const faced = n - wides;
  const pct = (v: number, base = n) => Math.round((v * 10000) / base) / 100;
  const missed = contacts.miss ?? 0;
  return {
    count: n,
    contacts,
    percentages: Object.fromEntries(
      Object.entries(contacts).map(([k, v]) => [k, pct(v)]),
    ),
    contactPercent: pct(faced - missed, n),
    goodOrBetterPercent: pct((contacts.perfect ?? 0) + (contacts.good ?? 0)),
    boundaryPercent: pct(boundaries),
    wicketPercent: pct(wickets),
    dotPercent: pct(dots),
    runsPerBall: Math.round((runs / n) * 1000) / 1000,
  };
}
