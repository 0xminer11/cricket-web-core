import type {
  DeliveryOutcomeDto,
  DeliveryResultDto,
} from '@the-cricketer/shared-types';
import { SEQUENCE } from '../config/visual-config';
import type { TrajectoryPlan } from './trajectory';

/**
 * Presentation events for one delivery. The engine's result is already known when the ball is
 * released; these only schedule WHEN each part of it is shown (a score must not tick up before the
 * ball reaches the bat). Each event fires exactly once, in order, even if the player skips.
 */
export type VisualEventType =
  | 'SHOT_COMMITTED'
  | 'BAT_CONTACT'
  | 'BALL_EXIT'
  | 'BALL_RELEASE'
  | 'BALL_PITCH'
  | 'BALL_NEAR_BATTER'
  | 'BATTER_SHOT_START'
  | 'CONTACT_PRESENTATION'
  | 'RESULT'
  | 'SCORE_UPDATE'
  | 'SEQUENCE_COMPLETE';

export interface ScheduledEvent {
  readonly type: VisualEventType;
  /** Seconds since release. */
  readonly time: number;
}

/** Build the ordered schedule from a trajectory plan. */
export function scheduleSequence(
  plan: TrajectoryPlan,
  options: { reducedMotion?: boolean; lead: number },
): ScheduledEvent[] {
  const hold = options.reducedMotion
    ? SEQUENCE.resultHoldReduced
    : SEQUENCE.resultHold;
  const resultTime = plan.flightTime + 0.08;
  const events: ScheduledEvent[] = [
    { type: 'BALL_RELEASE', time: 0 },
    { type: 'BALL_PITCH', time: plan.pitchTime },
    {
      type: 'BATTER_SHOT_START',
      time: Math.max(0, plan.flightTime - options.lead),
    },
    { type: 'BALL_NEAR_BATTER', time: plan.flightTime },
    { type: 'CONTACT_PRESENTATION', time: plan.flightTime },
    { type: 'RESULT', time: resultTime },
    { type: 'SCORE_UPDATE', time: resultTime },
    {
      type: 'SEQUENCE_COMPLETE',
      time: Math.max(plan.duration, resultTime) + hold,
    },
  ];
  // stable order: by time, then by the order above
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.time - b.event.time || a.index - b.index)
    .map(({ event }) => event);
}

export class VisualEventQueue {
  private pending: ScheduledEvent[] = [];
  private clock = 0;
  /** `startClock` lets a sequence be scheduled mid-flight (the batting result arrives while the ball is travelling). */
  schedule(events: readonly ScheduledEvent[], startClock = 0): void {
    this.pending = [...events].sort((a, b) => a.time - b.time);
    this.clock = startClock;
  }
  get time(): number {
    return this.clock;
  }
  get empty(): boolean {
    return this.pending.length === 0;
  }
  /** Advance the clock; returns the events that became due, in order. */
  advance(dt: number): ScheduledEvent[] {
    this.clock += Math.max(0, dt);
    const due: ScheduledEvent[] = [];
    while (this.pending.length && this.pending[0]!.time <= this.clock)
      due.push(this.pending.shift()!);
    return due;
  }
  /** Skip: everything still pending fires now, once, in order. */
  flush(): ScheduledEvent[] {
    const rest = this.pending;
    this.pending = [];
    if (rest.length) this.clock = Math.max(this.clock, rest.at(-1)!.time);
    return rest;
  }
  clear(): void {
    this.pending = [];
  }
}

export type BannerTone =
  'dot' | 'run' | 'boundary' | 'six' | 'wicket' | 'extra';
export interface ResultBanner {
  /** "FOUR", "WICKET", "WIDE": shown as text, never only as an animation or a sound. */
  readonly headline: string;
  readonly detail: string;
  readonly tone: BannerTone;
  /** Full sentence for screen readers. */
  readonly announcement: string;
}

export function resultBanner(outcome: DeliveryOutcomeDto): ResultBanner {
  const tone: BannerTone = outcome.wicketType
    ? 'wicket'
    : outcome.extraType === 'wide' ||
        outcome.extraType === 'no_ball' ||
        outcome.extraType === 'bye' ||
        outcome.extraType === 'leg_bye'
      ? 'extra'
      : outcome.runsOffBat === 6
        ? 'six'
        : outcome.runsOffBat === 4
          ? 'boundary'
          : outcome.runsOffBat === 0
            ? 'dot'
            : 'run';
  const wicket = outcome.wicketType
    ? ` Dismissal: ${outcome.detail.split(' - ')[0]}.`
    : '';
  return {
    headline: outcome.headline,
    detail: outcome.detail,
    tone,
    announcement: `${outcome.headline}. ${outcome.detail}.${wicket} ${outcome.totalRuns} ${outcome.totalRuns === 1 ? 'run' : 'runs'} added.`,
  };
}

/** The over line "1 · 0 · 4 · W" from the over's ball labels. */
export const overLine = (labels: readonly string[]): string =>
  labels.join(' · ');

/** What the over summary shows once the sixth legal ball is bowled. */
export function overSummary(result: DeliveryResultDto): {
  readonly title: string;
  readonly line: string;
} | null {
  if (!result.events.some((e) => e.type === 'OVER_COMPLETED')) return null;
  return {
    title: `Over ${result.overNumber} complete`,
    line: overLine(result.match.thisOver.map((b) => b.label)),
  };
}
