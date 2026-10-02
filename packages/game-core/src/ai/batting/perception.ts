import { AI_TUNING } from '../config/tuning';
import { classifyLength, classifyLine } from '../../match-geometry';
import { ENGINE_BALANCE as B } from '../../config/engine.config';
import { clamp01, gaussian } from '../core/math';
import type { RandomSource } from '../../utils/runtime';
import type {
  AIBatterView,
  AIDifficultyProfile,
  ObservedDelivery,
} from '../types';
import type { DeliveryLength, DeliveryLine } from '../../types/index';

const T = AI_TUNING.batting;

/** The ball as the batter reads it: close to the truth for a skilled, alert batter, blurrier for a weak one. */
export interface PerceivedDelivery {
  readonly line: DeliveryLine;
  readonly length: DeliveryLength;
  readonly x: number;
  readonly y: number;
  readonly speed: number;
  /** swing + seam + spin as read */
  readonly movement: number;
  /** 0..1 how hard the batter judges the ball to be */
  readonly challenge: number;
  /** The read line or length differs from the real one. */
  readonly misread: boolean;
  /** 0..1: how well this batter reads a ball (their Shot Selection and Reflex, and the difficulty). */
  readonly skill: number;
}

/**
 * Perception (Module 12 sections 42-43 and 216-218): the AI batter does NOT receive the exact trajectory. It receives what a
 * batter could read, blurred by their own Shot Selection and Reflex and by the difficulty's perception accuracy. A
 * misreading changes which shot the AI CHOOSES; it never changes the ball, and a misreading is never a skill boost.
 */
export function perceiveDelivery(
  ball: ObservedDelivery,
  batter: Pick<AIBatterView, 'batting' | 'physical'>,
  difficulty: Pick<AIDifficultyProfile, 'perceptionAccuracy'>,
  rng: RandomSource,
): PerceivedDelivery {
  const skill = clamp01(
    0.45 * (batter.batting.shotSelection / 100) +
      0.3 * (batter.physical.reflex / 100) +
      0.25 * difficulty.perceptionAccuracy,
  );
  const sigma = T.perceptionNoise * Math.pow(1 - skill, 1.3) + 0.008;
  // four draws every time so the stream stays aligned whatever the skill
  const nx = gaussian(rng);
  const ny = gaussian(rng);
  const x = clamp01(ball.x + nx * sigma);
  const y = clamp01(ball.y + ny * sigma * 0.9);
  const movement = Math.max(
    0,
    (ball.swing + ball.seam + ball.spin) * (1 + gaussian(rng) * 0.2 * (1 - skill)),
  );
  const speed = Math.max(5, ball.speed * (1 + gaussian(rng) * 0.04 * (1 - skill)));
  const line = classifyLine(x);
  const length = classifyLength(y);
  const challenge = clamp01(
    T.challengePrior +
      movement * B.contact.challengeMovement +
      (speed / 45) * B.contact.challengePace,
  );
  return {
    line,
    length,
    x,
    y,
    speed,
    movement,
    challenge,
    misread: line !== classifyLine(ball.x) || length !== classifyLength(ball.y),
    skill,
  };
}
