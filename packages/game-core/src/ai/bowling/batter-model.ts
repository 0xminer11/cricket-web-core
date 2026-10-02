import { SHOTS } from '../../seed/shots.seed';
import type { DeliveryLength, DeliveryLine, PitchDefinition } from '../../types/index';
import type { RandomSource } from '../../utils/runtime';
import { AI_TUNING } from '../config/tuning';
import { clamp, gaussian } from '../core/math';
import { estimateWithKit, outcomeValue, shotKit } from '../scoring/expected-outcome';
import type { BatterSkills, OutcomeEstimate, ShotKit, ValueTable } from '../scoring/expected-outcome';
import type { AIBatterView, AIDifficultyProfile } from '../types';

const T = AI_TUNING.bowling;

const KEYS = [
  'timing',
  'power',
  'placement',
  'defence',
  'footwork',
  'shotSelection',
  'technique',
  'consistency',
] as const;

/**
 * The bowler's picture of a batter's skills (Module 12 sections 56-57 and 219). A bowler can read a batter's public attributes,
 * but a weak AI reads them poorly: each attribute is misjudged by an error that shrinks as the difficulty's matchup awareness
 * grows. The error is drawn from a stream named after the batter, so it is the SAME misjudgement all match (consistent, not
 * re-rolled every ball) and it only ever affects what the AI chooses to bowl, never the batter's real attributes.
 */
export function scoutBatter(
  batter: AIBatterView,
  difficulty: Pick<AIDifficultyProfile, 'matchupAwareness'>,
  rng: RandomSource,
): BatterSkills {
  const sigma = (1 - difficulty.matchupAwareness) * 16;
  const batting = { ...batter.batting } as Record<string, number>;
  for (const key of KEYS)
    batting[key] = clamp(batting[key]! + gaussian(rng) * sigma, 1, 100);
  return {
    batting: batting as unknown as BatterSkills['batting'],
    reflex: clamp(batter.physical.reflex + gaussian(rng) * sigma, 1, 100),
    strength: clamp(batter.physical.strength + gaussian(rng) * sigma, 1, 100),
    form: batter.form,
    fatigue: batter.fatigue,
    confidence: batter.personality.confidence,
  };
}

/**
 * Everything about how a (scouted) batter would play a ball landing in a given place, cached per place. The estimates do not
 * depend on the state of the match, so one estimator is shared by every step of a decision (the plan manager replays an over
 * and scores the same cells again and again); only the VALUE of each result changes with the situation.
 */
export class BatterEstimator {
  private readonly kits: readonly ShotKit[];
  private readonly cache = new Map<string, readonly OutcomeEstimate[]>();
  constructor(skills: BatterSkills, private readonly pitch: PitchDefinition) {
    this.kits = SHOTS.map((shot) => shotKit(shot, skills, pitch));
  }

  estimates(
    line: DeliveryLine,
    length: DeliveryLength,
    challenge: number,
    movement: number,
  ): readonly OutcomeEstimate[] {
    const key = `${line}|${length}|${Math.round(challenge / T.challengeBucket)}|${Math.round(movement * 12)}`;
    let hit = this.cache.get(key);
    if (!hit) {
      hit = this.kits.map((k) => estimateWithKit(k, line, length, challenge, movement));
      this.cache.set(key, hit);
    }
    return hit;
  }

  get pitchDefinition(): PitchDefinition {
    return this.pitch;
  }
}

export interface BatterReply {
  /** The batting side's gain in `stateValue` units when the batter replies as expected. Lower is better for the bowler. */
  readonly value: number;
  readonly shotId: string;
  readonly expectedRuns: number;
  readonly pWicket: number;
  readonly pBoundary: number;
  readonly pDot: number;
}

/**
 * How a batter is expected to answer a ball landing in a given place: their best reply by value, blended with their average reply
 * so that a bowler does not assume a perfect answer.
 */
export class ReplyModel {
  constructor(
    private readonly values: ValueTable,
    private readonly estimator: BatterEstimator,
  ) {}

  /** The value to the batting side of an extra run with no ball bowled (a wide). */
  wideValue(): number {
    return this.values.wide;
  }

  reply(
    line: DeliveryLine,
    length: DeliveryLength,
    challenge: number,
    movement: number,
  ): BatterReply {
    const estimates = this.estimator.estimates(line, length, challenge, movement);
    let best = -Infinity;
    let total = 0;
    let bestIndex = 0;
    for (let i = 0; i < estimates.length; i++) {
      const dv = outcomeValue(this.values, estimates[i]!);
      total += dv;
      if (dv > best) {
        best = dv;
        bestIndex = i;
      }
    }
    const mean = total / estimates.length;
    const sharp = T.replySharpness;
    const e = estimates[bestIndex]!;
    return {
      value: sharp * best + (1 - sharp) * mean,
      shotId: SHOTS[bestIndex]!.id,
      expectedRuns: e.expectedRuns,
      pWicket: e.pWicket,
      pBoundary: e.pBoundary,
      pDot: e.pDot,
    };
  }
}
