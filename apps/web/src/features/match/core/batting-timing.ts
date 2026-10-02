import { BATTING_INPUT } from '@the-cricketer/game-core';
import {
  BATTING_ANIMATION_BY_SHOT,
  timeToContact,
} from '../config/batting-animations';
import { clamp } from './vec';

export type TimingCategory =
  'very_early' | 'early' | 'perfect' | 'late' | 'very_late';

export const TIMING_TEXT: Readonly<Record<TimingCategory, string>> = {
  very_early: 'Very early',
  early: 'Early',
  perfect: 'Perfect timing',
  late: 'Late',
  very_late: 'Very late',
};

export function timingCategory(normalized: number): TimingCategory {
  const t = BATTING_INPUT.timingLabels;
  const size = Math.abs(normalized);
  if (size <= t.perfect) return 'perfect';
  if (normalized < 0) return size <= t.near ? 'early' : 'very_early';
  return size <= t.near ? 'late' : 'very_late';
}

/** What the scene knows about the incoming ball once the bowler has released it (presentation seconds). */
export interface BallTimeline {
  /** The ball lands. */
  readonly pitchTime: number;
  /** The ball reaches the batter (the contact plane). */
  readonly contactTime: number;
  readonly speedKmh: number;
}

/**
 * BattingTimingPredictor. It does NOT decide anything: it only knows when the ball will reach the bat on
 * the presentation clock, so the swing can be started so its contact frame lines up, the timing error
 * can be measured against the ball, and an optional cue can show when to press.
 */
export class BattingTimingPredictor {
  constructor(readonly timeline: BallTimeline) {}

  /** Seconds from the start of a swing to the contact frame. */
  swingLead(shotId: string): number {
    const def = BATTING_ANIMATION_BY_SHOT.get(shotId);
    return def ? timeToContact(def) : 0.4;
  }

  /** The best moment to press for this shot, on the same clock as the timeline. */
  idealTapTime(shotId: string): number {
    return this.timeline.contactTime - this.swingLead(shotId);
  }

  /** Contact-time error in seconds: negative means the bat would arrive before the ball. */
  errorSeconds(tapTime: number, shotId: string): number {
    return tapTime + this.swingLead(shotId) - this.timeline.contactTime;
  }

  /** The number the server receives: the error as a fraction of the timing window, clamped to -1..1. */
  normalized(tapTime: number, shotId: string): number {
    return (
      Math.round(
        clamp(
          this.errorSeconds(tapTime, shotId) / BATTING_INPUT.windowSeconds,
          -1,
          1,
        ) * 1e4,
      ) / 1e4
    );
  }

  /**
   * 0 a long way before the ideal press, 1 exactly at it. Drives the optional timing cue; beyond the
   * ideal moment it falls again so the cue visibly "passes".
   */
  cue(now: number, shotId: string, lead = 0.7): number {
    const ideal = this.idealTapTime(shotId);
    const before = (now - (ideal - lead)) / lead;
    return before <= 1 ? clamp(before) : clamp(1 - (now - ideal) / lead);
  }

  /** The last moment a swing still makes sense; after it the ball has gone by. */
  lateCutoff(shotId: string): number {
    return this.idealTapTime(shotId) + BATTING_INPUT.windowSeconds;
  }
}
