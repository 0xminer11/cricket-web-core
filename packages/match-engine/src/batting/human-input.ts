import { BATTING_INPUT, SHOTS } from '@the-cricketer/game-core';
import type { BattingAssist } from '@the-cricketer/game-core';
import type {
  MatchPlayerSnapshot,
  ResolvedDelivery,
  ShotIntent,
} from '../state/types';
import {
  calculateEffectiveMatchAttributes,
  clamp,
} from '../modifiers/effective';

/** What a human batter chose, as the client reports it. Never a result. */
export interface HumanBattingInput {
  readonly shotId: string;
  /** -1 strong leg side .. 0 straight .. +1 strong off side, relative to the batter's hand. */
  readonly direction: number;
  /** Contact-time error normalized to -1 (very early) .. +1 (very late). */
  readonly timing: number;
  readonly assist: BattingAssist;
}

export type TimingLabel =
  'very_early' | 'early' | 'perfect' | 'late' | 'very_late';

/** The label for a (raw, unassisted) timing error, used for feedback text only. */
export function timingLabel(timing: number): TimingLabel {
  const t = BATTING_INPUT.timingLabels;
  const size = Math.abs(timing);
  if (size <= t.perfect) return 'perfect';
  if (timing < 0) return size <= t.near ? 'early' : 'very_early';
  return size <= t.near ? 'late' : 'very_late';
}

/**
 * How much of a timing error this batter and this ball forgive. Better Timing widens the effective
 * window; better Reaction helps most against pace. It is deliberately gentle: skill makes a good
 * timing input more reliable, it does not make timing automatic. Uses the batter's EFFECTIVE
 * attributes (form, fatigue and equipment already applied).
 */
export function timingForgiveness(
  batter: MatchPlayerSnapshot,
  delivery: Pick<ResolvedDelivery, 'speed'>,
): number {
  const effective = calculateEffectiveMatchAttributes(batter);
  const tol = BATTING_INPUT.tolerance;
  const pace = clamp(delivery.speed / tol.referenceSpeed, 0, 1.3);
  return clamp(
    1 -
      (effective.batting.timing / 100) * tol.timing -
      (effective.physical.reflex / 100) * tol.reaction * pace,
    0.4,
    1,
  );
}

/**
 * Turn a human's input into the engine's ShotIntent. The direction is mapped onto the chosen
 * shot's own arc (a cover drive cannot be played behind square), and the timing error is scaled by
 * the assist level and the batter's skill before the engine ever sees it. `auto` assist sends no
 * timing at all, so the engine times the ball like an AI batter.
 */
export function humanShotIntent(
  input: HumanBattingInput,
  batter: MatchPlayerSnapshot,
  delivery: Pick<ResolvedDelivery, 'speed'>,
): ShotIntent {
  const shot = SHOTS.find((s) => s.id === input.shotId);
  if (!shot) throw new Error('Unknown shot');
  const [min, max] = shot.directionDegrees;
  const desired =
    clamp(input.direction, -1, 1) * BATTING_INPUT.directionDegrees;
  const directionInput = clamp(((desired - min) / (max - min)) * 2 - 1, -1, 1);
  if (input.assist === 'auto') return { shotId: shot.id, directionInput };
  const scale = BATTING_INPUT.assist[input.assist].scale;
  return {
    shotId: shot.id,
    directionInput,
    timingInput:
      Math.round(
        clamp(
          clamp(input.timing, -1, 1) *
            scale *
            timingForgiveness(batter, delivery),
          -1,
          1,
        ) * 1e6,
      ) / 1e6,
  };
}
