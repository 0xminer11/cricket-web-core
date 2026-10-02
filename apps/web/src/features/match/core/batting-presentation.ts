import { BATTING_INPUT } from '@the-cricketer/game-core';
import type {
  DeliveryPreviewDto,
  DeliveryResultDto,
  ResolvedDeliveryDto,
} from '@the-cricketer/shared-types';
import {
  BATTING_ANIMATION_BY_SHOT,
  resolveShotAnimation,
  timeToContact,
} from '../config/batting-animations';
import { PITCH, SEQUENCE } from '../config/visual-config';
import {
  BowlingAnimator,
  armFor,
  bowlerKindFor,
  resolveBowlingAnimation,
  timelineFor,
} from './bowling-animation';
import type { AnimatorEvent, Pose } from './bowling-animation';
import { swingFrame, stanceFrame, swingTotalSeconds } from './batting-rig';
import type { BatterFrame, SwingSpec } from './batting-rig';
import { presentContact } from './contact-assist';
import type { ContactPlan, ContactQuality } from './contact-assist';
import { BallPath } from './ball-path';
import type { BattingHand } from './coordinates';
import type { SceneEvent } from './scene-port';
import { classifyOutcome, planExit, planIncoming } from './trajectory';
import type { OutcomeKind } from './trajectory';
import { VisualEventQueue } from './visual-events';
import type { ScheduledEvent } from './visual-events';
import { clamp, vec } from './vec';
import type { Vec3 } from './vec';

/** The preview carries what a batter can read; the trajectory code wants a full resolved delivery. */
export function previewToDelivery(
  d: DeliveryPreviewDto['delivery'],
): ResolvedDeliveryDto {
  const side = {
    target: d.target,
    line: d.line,
    length: d.length,
    lineLabel: d.lineLabel,
    lengthLabel: d.lengthLabel,
  };
  return {
    variationId: d.variationId,
    name: d.name,
    intended: side,
    actual: side,
    speedKmh: d.speedKmh,
    speedMs: d.speedMs,
    movement: d.movement,
    bounce: d.bounce,
    executionRating: 'average',
    noBall: false,
    bowlingArm: d.bowlingArm,
    battingHand: d.battingHand,
  };
}

export interface BattingPresentationOptions {
  readonly hand: BattingHand;
  readonly reducedMotion: boolean;
  /** Called for every presentation milestone. Returning false from BALL_RELEASE would hold the ball (unused here). */
  readonly emit: (event: SceneEvent) => boolean | void;
  /** Called when the picture should change (camera states); keeps this class free of the camera. */
  readonly camera: (
    state: 'BowlerView' | 'BallApproach' | 'ShotFollow' | 'Wicket' | 'Reset',
  ) => void;
  readonly unavailableClips?: ReadonlySet<string>;
  /** The batter's Footwork rating; stretches how far the body may correct. */
  readonly footwork?: number;
  /** Wall-clock source in ms (injected so tests can drive it). */
  readonly wallClock?: () => number;
  /** Measure the ball-to-bat distance every frame (the lab and tests; costs a pose per frame). */
  readonly trackBat?: boolean;
}

interface Swing {
  readonly shotId: string;
  /** The clip that plays (the shot's own, or a fallback when its asset is unavailable). */
  readonly animId: string;
  /** Stay in the stance until this presentation time (Auto assist). */
  readonly waitUntil: number;
  /** Presentation (flight) time the swing started. */
  readonly startedAt: number;
  /** Seconds into the clip, advanced by dt * speed. */
  animClock: number;
  speed: number;
  spec: SwingSpec;
  batContactEmitted: boolean;
  held: number;
}

export interface BattingFrameState {
  readonly batter: BatterFrame;
  readonly bowler: Pose | null;
  readonly ball: { readonly position: Vec3; readonly spin: number } | null;
  /** The ball is still in the bowler's hand. */
  readonly ballInHand: Vec3 | null;
  readonly stumpsDisturbed: number;
  readonly sparks: readonly { readonly position: Vec3; readonly age: number }[];
}

export interface BattingDebugState {
  readonly flightTime: number | null;
  readonly contactTime: number | null;
  readonly swingStartedAt: number | null;
  readonly animClock: number | null;
  readonly speed: number;
  readonly plan: ContactPlan | null;
  readonly kind: OutcomeKind | null;
  readonly pending: boolean;
  /** Closest the ball has been to the middle of the bat since the swing started (metres), or null. */
  readonly closestToSweetSpot: number | null;
  /** Where the ball is relative to the bat's middle right now (metres), or null. */
  readonly ballToSweetSpot: number | null;
  readonly ballToEdge: number | null;
}

/** How far the swing's speed may change to land its contact frame on the ball (slowed by an early tap, hurried by a late one). */
const ALIGN_SPEED = [0.35, 3] as const;

/** How much faster the part after contact plays in fast presentation. */
const FAST_AFTER_CONTACT = 2.2;

/** Hold the swing on the contact frame for at most this long while waiting for the server. */
const MAX_HOLD = 3;
/** How long after the ball passes with no swing before the player is treated as having been beaten. */
const CUTOFF_AFTER = BATTING_INPUT.windowSeconds * 0.6;

/**
 * Everything the batting scene does, with no Phaser and no DOM: the AI bowler's run-up and release, the
 * ball's flight, the batter's stance and swing, the hold on the contact frame, the contact assist, the ball's
 * single path from incoming to outgoing, and the ordered presentation events. The scene just draws what
 * `frame()` returns and feeds `update(dt)`. It presents the server's result; it never produces one.
 */
export class BattingPresentation {
  private animator: BowlingAnimator | null = null;
  private path: BallPath | null = null;
  private delivery: ResolvedDeliveryDto | null = null;
  private flightTime = 0;
  private released = false;
  private swing: Swing | null = null;
  private result: DeliveryResultDto | null = null;
  private plan: ContactPlan | null = null;
  private kind: OutcomeKind | null = null;
  private readonly queue = new VisualEventQueue();
  private emitted = new Set<string>();
  private sparks: { position: Vec3; age: number }[] = [];
  private stumpsHitAt: number | null = null;
  private sway = 0;
  private ballHeld = 0;
  /** Fast presentation: after contact the exit and the result play faster. The approach is never sped up. */
  private fast = false;
  /** The dt of the update in progress (0 outside one). */
  private updating = 0;
  private readonly warnedFallback = new Set<string>();
  private closest: number | null = null;
  private lastTick = 0;
  private replay: {
    shotId: string;
    errorSeconds: number;
    result: DeliveryResultDto;
  } | null = null;
  private replayDone = false;
  private active = false;
  private completed = false;
  fallbackBowler = false;

  constructor(private readonly opts: BattingPresentationOptions) {}

  private clock(): number {
    return (this.opts.wallClock ?? (() => performance.now()))();
  }

  /** Stand the bowler at his mark and the batter in his stance. */
  prepare(bowlerStyle: string): void {
    this.reset();
    const resolved = resolveBowlingAnimation(
      bowlerStyle,
      this.opts.unavailableClips,
    );
    this.fallbackBowler = resolved.fallback;
    this.animator = new BowlingAnimator(
      timelineFor(
        bowlerKindFor(bowlerStyle),
        armFor(bowlerStyle),
        resolved.definition.releaseMarker,
        this.opts.reducedMotion,
        true,
      ),
    );
    this.animator.on((event) => this.onAnimator(event));
  }

  get isActive(): boolean {
    return this.active;
  }

  startDelivery(
    preview: DeliveryPreviewDto,
    replay?: {
      shotId: string;
      errorSeconds: number;
      result: DeliveryResultDto;
    },
  ): void {
    this.prepare(preview.bowler.style);
    this.delivery = previewToDelivery(preview.delivery);
    this.replay = replay ?? null;
    this.replayDone = false;
    this.active = true;
    this.completed = false;
    this.opts.camera('BowlerView');
    this.animator!.start();
  }

  /** Seconds on the presentation clock: negative before release (so an early tap can be buffered), null when idle. */
  now(wallMs?: number): number | null {
    if (!this.active || !this.animator) return null;
    if (!this.released)
      return Math.min(0, this.animator.elapsed - this.animator.releaseTime);
    const ahead =
      wallMs === undefined
        ? 0
        : Math.min(0.05, Math.max(0, (wallMs - this.lastTick) / 1000));
    return this.flightTime + ahead;
  }

  /** The player's swing begins now. Safe to call once per ball. */
  /**
   * The player's swing begins now. With `waitUntil` (assist Auto: the system times it) the batter stays in the stance
   * until that presentation time, then swings.
   */
  startSwing(shotId: string, at?: number, waitUntil?: number): boolean {
    if (!this.released || this.swing || !this.path) return false;
    const resolved = resolveShotAnimation(shotId, this.opts.unavailableClips);
    if (resolved.fallback && !this.warnedFallback.has(shotId)) {
      this.warnedFallback.add(shotId);
      this.opts.emit({
        type: 'ASSET_WARNING',
        message: resolved.minimal
          ? `No batting animations available; using the minimal swing for ${shotId}`
          : `No batting animation for ${shotId}; using ${resolved.animShotId}`,
      });
    }
    const start = at ?? this.flightTime;
    this.swing = {
      shotId,
      animId: resolved.animShotId,
      waitUntil: waitUntil ?? 0,
      startedAt: Math.max(0, start),
      animClock: 0,
      speed: 1,
      spec: {
        shotId: resolved.animShotId,
        hand: this.opts.hand,
        adjust: {
          rootOff: 0,
          rootFwd: 0,
          rootDown: 0,
          hipYaw: 0,
          shoulderYaw: 0,
          upperBodyPitch: 0,
          batRotation: 0,
        },
        speed: 1,
        contactShift: { off: 0, fwd: 0, z: 0 },
      },
      batContactEmitted: false,
      held: 0,
    };
    this.opts.emit({ type: 'SHOT_COMMITTED' });
    return true;
  }

  /** The server's answer. Safe to call before or after the contact frame; corrections blend in smoothly. */
  applyResult(result: DeliveryResultDto): void {
    if (!this.path || !this.delivery || this.result) return;
    if (!this.swing) {
      // no swing was made: the batter plays the shot late, from here
      this.startSwing(result.shot.shotId, this.flightTime);
    }
    const swing = this.swing!;
    this.result = result;
    const kind = classifyOutcome(result.shot, result.outcome);
    this.kind = kind;
    const made = result.shot.contactQuality !== 'miss' && kind !== 'wide';
    const quality: ContactQuality = made ? result.shot.contactQuality : 'miss';
    const incoming = this.path.incoming;
    const plan = presentContact({
      shotId: swing.animId,
      hand: this.opts.hand,
      ballPoint: incoming.arrival,
      quality,
      footwork: this.opts.footwork ?? 55,
      secondsToBall: Math.max(0.05, incoming.flightTime - swing.startedAt),
    });
    this.plan = plan;
    swing.speed = plan.timingWarp;
    swing.spec = {
      shotId: swing.animId,
      hand: this.opts.hand,
      adjust: plan.adjust,
      speed: 1,
      contactShift: plan.contactShift,
    };
    const delivery = this.delivery;
    this.path.resolve({
      contact: plan.ballPoint,
      now: this.flightTime,
      exitFrom: (start) =>
        planExit(
          kind,
          start,
          result.shot,
          result.outcome,
          this.opts.hand,
          delivery,
        ),
    });
    if (kind === 'bowled')
      this.stumpsHitAt = this.path.timeAtV(PITCH.length - 0.08);

    const def = BATTING_ANIMATION_BY_SHOT.get(swing.animId)!;
    const contactTime = this.path.contactTime;
    // aligned contact meets the ball exactly; a miss keeps its own (early or late) timing
    const batContact = plan.contactMade
      ? contactTime
      : this.flightTime +
        Math.max(0, timeToContact(def) - swing.animClock) / swing.speed;
    const swingEnd = plan.contactMade
      ? contactTime +
        Math.max(0, swingTotalSeconds(swing.animId) - timeToContact(def))
      : this.flightTime +
        Math.max(0, swingTotalSeconds(swing.animId) - swing.animClock) /
          swing.speed;
    const hold = this.opts.reducedMotion
      ? SEQUENCE.resultHoldReduced
      : SEQUENCE.resultHold;
    const resultAt = Math.max(contactTime, batContact) + 0.08;
    const events: ScheduledEvent[] = [
      { type: 'BAT_CONTACT', time: batContact },
      { type: 'CONTACT_PRESENTATION', time: contactTime },
      { type: 'BALL_EXIT', time: contactTime },
      { type: 'RESULT', time: resultAt },
      { type: 'SCORE_UPDATE', time: resultAt },
      {
        type: 'SEQUENCE_COMPLETE',
        time: Math.max(
          this.path.duration + hold,
          swingEnd + 0.1,
          resultAt + hold,
        ),
      },
    ];
    // scheduled from inside an update, the queue is advanced once more by this frame's dt: start it one frame behind
    this.queue.schedule(events, this.flightTime - this.updating);
  }

  /** Jump to the end: every remaining event fires once, in order, and the ball and batter settle. */
  skip(): void {
    if (!this.path || !this.result) return;
    for (const event of this.queue.flush()) this.handle(event);
    this.flightTime = this.path.duration;
    if (this.swing)
      this.swing.animClock = swingTotalSeconds(this.swing.animId) + 1;
    if (this.kind === 'bowled') this.stumpsHitAt = this.stumpsHitAt ?? 0;
  }

  /** Back to a still stance with the bowler at his mark: nothing is carried into the next ball. */
  reset(): void {
    this.animator?.reset();
    this.path = null;
    this.delivery = null;
    this.flightTime = 0;
    this.released = false;
    this.swing = null;
    this.result = null;
    this.plan = null;
    this.kind = null;
    this.queue.clear();
    this.emitted = new Set();
    this.sparks = [];
    this.stumpsHitAt = null;
    this.ballHeld = 0;
    this.closest = null;
    this.replay = null;
    this.replayDone = false;
    this.active = false;
    this.completed = false;
  }

  // ---- events ---------------------------------------------------------------------------------------

  private once(key: string, event: SceneEvent): void {
    if (this.emitted.has(key)) return;
    this.emitted.add(key);
    this.opts.emit(event);
  }

  private onAnimator(event: AnimatorEvent): boolean | void {
    if (event.type !== 'BALL_RELEASE' || this.released || !this.delivery)
      return;
    const incoming = planIncoming({
      delivery: this.delivery,
      release: vec(event.hand.u, event.hand.v, event.hand.z),
      hand: this.opts.hand,
    });
    this.path = new BallPath(incoming);
    this.flightTime = 0;
    this.released = true;
    this.opts.camera('BallApproach');
    const accepted = this.opts.emit({ type: 'BALL_RELEASE', hand: event.hand });
    this.opts.emit({
      type: 'BALL_TIMELINE',
      pitchTime: incoming.pitchTime,
      contactTime: incoming.flightTime,
      speedKmh: incoming.speedKmh,
    });
    return accepted === false ? false : true;
  }

  private handle(event: ScheduledEvent): void {
    switch (event.type) {
      case 'BAT_CONTACT':
        this.once('BAT_CONTACT', {
          type: 'BAT_CONTACT',
          made: this.plan?.contactMade ?? false,
          quality: this.plan?.quality ?? 'miss',
        });
        return;
      case 'CONTACT_PRESENTATION':
        if (this.plan?.contactMade && this.path)
          this.sparks.push({
            position: this.path.positionAt(this.path.contactTime),
            age: 0,
          });
        this.once('CONTACT_PRESENTATION', { type: 'CONTACT_PRESENTATION' });
        return;
      case 'BALL_EXIT':
        this.opts.camera(
          this.kind === 'bowled' || this.kind === 'lbw'
            ? 'Wicket'
            : 'ShotFollow',
        );
        this.once('BALL_EXIT', { type: 'BALL_EXIT' });
        return;
      case 'RESULT':
        this.once('RESULT', { type: 'RESULT' });
        return;
      case 'SCORE_UPDATE':
        this.once('SCORE_UPDATE', { type: 'SCORE_UPDATE' });
        return;
      case 'SEQUENCE_COMPLETE':
        if (!this.completed) {
          this.completed = true;
          this.opts.camera('Reset');
          this.once('SEQUENCE_COMPLETE', { type: 'SEQUENCE_COMPLETE' });
        }
        return;
      default:
        return;
    }
  }

  // ---- the frame ------------------------------------------------------------------------------------

  update(dt: number): void {
    this.sway += dt;
    this.lastTick = this.clock();
    if (!this.active || !this.animator) return;
    this.animator.update(dt);
    for (const s of this.sparks) s.age += dt;
    this.sparks = this.sparks.filter((s) => s.age < 0.4);
    const path = this.path;
    if (!path || dt <= 0) return;
    this.updating = dt;
    try {
      this.advance(path, dt);
    } finally {
      this.updating = 0;
    }
  }

  setFast(on: boolean): void {
    this.fast = on;
  }

  private advance(path: BallPath, dt: number): void {
    // after contact the exit and the result may play faster; the approach (the part being timed) never does
    if (
      this.fast &&
      this.result !== null &&
      this.flightTime >= path.incoming.flightTime
    )
      dt *= FAST_AFTER_CONTACT;
    const incoming = path.incoming;
    const flightBefore = this.flightTime;
    const clockBefore = this.swing?.animClock ?? 0;
    this.flightTime += dt;
    // a committed swing and the ball wait together at the bat for the umpire, rather than the ball slipping
    // past before the answer arrives (never longer than MAX_HOLD, so a dead connection cannot freeze the ball)
    if (
      this.swing &&
      !this.result &&
      this.flightTime >= incoming.flightTime &&
      this.ballHeld < MAX_HOLD
    ) {
      this.ballHeld += dt;
      this.flightTime = incoming.flightTime;
    }

    // milestones of the ball itself
    if (this.flightTime >= incoming.pitchTime)
      this.once('BALL_PITCH', { type: 'BALL_PITCH' });
    if (this.flightTime >= incoming.flightTime - 0.2)
      this.once('CONTACT_WINDOW', { type: 'CONTACT_WINDOW' });
    if (this.flightTime >= incoming.flightTime)
      this.once('BALL_NEAR_BATTER', { type: 'BALL_NEAR_BATTER' });

    // an automatic replay (after a retry) plays the swing the player already made
    if (this.replay && !this.replayDone) {
      const def = BATTING_ANIMATION_BY_SHOT.get(
        resolveShotAnimation(this.replay.shotId, this.opts.unavailableClips)
          .animShotId,
      );
      const tap =
        incoming.flightTime -
        (def ? timeToContact(def) : 0.4) +
        this.replay.errorSeconds;
      if (this.flightTime >= Math.max(0.05, tap)) {
        this.replayDone = true;
        this.startSwing(this.replay.shotId);
        this.applyResult(this.replay.result);
      }
    }

    // the swing
    const swing = this.swing;
    if (swing) {
      const def = BATTING_ANIMATION_BY_SHOT.get(swing.animId)!;
      const contactClock = timeToContact(def);
      const next = swing.animClock + dt * swing.speed;
      if (this.flightTime < swing.waitUntil) {
        // Auto assist: the system times the swing, so the batter waits for the moment
      } else if (this.result !== null && this.plan?.contactMade) {
        // The engine says the bat met the ball, so the contact frame must land ON the ball however the tap was
        // timed (how well it was timed is already in the result: Perfect, Edge, Poor...). A late swing catches
        // up through its downswing, an early one eases off and waits on the contact frame; after contact it
        // plays at normal speed. A MISS is never aligned: early and late swings show as early and late.
        const left = incoming.flightTime - this.flightTime;
        if (swing.animClock < contactClock - 1e-9) {
          swing.speed = clamp(
            (contactClock - swing.animClock) / Math.max(left, 0.03),
            ALIGN_SPEED[0],
            ALIGN_SPEED[1],
          );
          swing.animClock = Math.min(
            contactClock + (left <= 0 ? dt : 0),
            swing.animClock + dt * swing.speed,
          );
        } else if (left > 0) {
          swing.speed = 0;
          swing.animClock = contactClock;
        } else {
          swing.speed = 1;
          swing.animClock += dt;
        }
      } else if (!this.result && next >= contactClock) {
        // hold on the contact frame until the server has answered (never longer than MAX_HOLD)
        swing.held += dt;
        swing.animClock = swing.held < MAX_HOLD ? contactClock : next;
      } else swing.animClock = next;
    } else if (
      !this.result &&
      this.flightTime >= incoming.flightTime + CUTOFF_AFTER
    ) {
      this.once('LATE_CUTOFF', { type: 'LATE_CUTOFF' });
    }

    if (this.swing && this.opts.trackBat) {
      // the ball crosses the bat between two frames: look at eight points in between
      const clockAfter = this.swing.animClock;
      for (let k = 1; k <= 8; k++) {
        const f = k / 8;
        const now = this.measure(
          flightBefore + (this.flightTime - flightBefore) * f,
          clockBefore + (clockAfter - clockBefore) * f,
        );
        if (now && (this.closest === null || now.sweet < this.closest))
          this.closest = now.sweet;
      }
    }
    if (!this.result) return;
    for (const event of this.queue.advance(dt)) this.handle(event);
  }

  frame(): BattingFrameState {
    const hand = this.opts.hand;
    const batter = this.swing
      ? swingFrame(
          { ...this.swing.spec, speed: 1 },
          this.swing.animClock,
          hand,
          this.sway,
        )
      : stanceFrame(hand, this.sway);
    const bowler = this.animator ? this.animator.frame().pose : null;
    const ball = this.path
      ? {
          position: this.path.positionAt(this.flightTime),
          spin:
            this.flightTime *
            (8 + Math.abs(this.delivery?.movement.spin ?? 0) * 90),
        }
      : null;
    const inHand =
      this.active && this.animator && !this.released
        ? this.animator.frame().hand
        : null;
    const stumps =
      this.stumpsHitAt === null
        ? 0
        : Math.max(0, Math.min(1, (this.flightTime - this.stumpsHitAt) / 0.4));
    return {
      batter,
      bowler,
      ball,
      ballInHand: inHand,
      stumpsDisturbed: stumps,
      sparks: this.sparks,
    };
  }

  /** Ball-to-bat distances right now (only meaningful while the swing is under way). */
  private measure(
    flightTime = this.flightTime,
    animClock = this.swing?.animClock ?? 0,
  ): { sweet: number; edge: number } | null {
    if (!this.path || !this.swing) return null;
    const ball = this.path.positionAt(flightTime);
    const f = swingFrame(
      { ...this.swing.spec, speed: 1 },
      animClock,
      this.opts.hand,
      this.sway,
    );
    const d = (a: Vec3, b: Vec3) => Math.hypot(a.u - b.u, a.v - b.v, a.z - b.z);
    return {
      sweet: d(f.sweetSpot, ball),
      edge: Math.min(d(f.insideEdge, ball), d(f.outsideEdge, ball)),
    };
  }

  debug(): BattingDebugState {
    return {
      flightTime: this.released ? this.flightTime : null,
      contactTime: this.path?.contactTime ?? null,
      swingStartedAt: this.swing?.startedAt ?? null,
      animClock: this.swing?.animClock ?? null,
      speed: this.swing?.speed ?? 1,
      plan: this.plan,
      kind: this.kind,
      pending: this.swing !== null && this.result === null,
      closestToSweetSpot: this.closest,
      ballToSweetSpot: this.measure()?.sweet ?? null,
      ballToEdge: this.measure()?.edge ?? null,
    };
  }

  /** The server's result for this ball once it has been applied. */
  get appliedResult(): DeliveryResultDto | null {
    return this.result;
  }

  /** The animation resolved for the bowler (so the scene can warn about a fallback). */
  get bowlerFallback(): boolean {
    return this.fallbackBowler;
  }
}
