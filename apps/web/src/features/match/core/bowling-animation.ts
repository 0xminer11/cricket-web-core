import { FLIGHT, RUN_UP } from '../config/visual-config';
import { clamp, lerp, smoothstep, vec } from './vec';
import type { Vec3 } from './vec';

export type BowlerKind = 'fast' | 'medium' | 'spin';
export type Arm = 'right' | 'left';

/**
 * Animation definition per bowling style (Module 9 brief section 18). Ids point at clips in the
 * clip library below; the release marker is a normalized time inside the delivery clip, never a
 * timeout: the ball leaves the hand when the clip crosses it.
 */
export interface BowlingAnimationDefinition {
  readonly bowlingStyleId: string;
  readonly idleAnimationId: string;
  readonly runUpAnimationId: string;
  readonly deliveryAnimationId: string;
  readonly followThroughAnimationId: string;
  readonly releaseMarker: number;
}

const def = (
  style: string,
  family: string,
  releaseMarker: number,
): BowlingAnimationDefinition => ({
  bowlingStyleId: style,
  idleAnimationId: `bowler.${family}.idle`,
  runUpAnimationId: `bowler.${family}.runup`,
  deliveryAnimationId: `bowler.${family}.delivery`,
  followThroughAnimationId: `bowler.${family}.follow`,
  releaseMarker,
});

export const BOWLING_ANIMATIONS: readonly BowlingAnimationDefinition[] = [
  def('right_arm_fast', 'fast.right', 0.68),
  def('left_arm_fast', 'fast.left', 0.68),
  def('right_arm_medium', 'medium.right', 0.66),
  def('left_arm_medium', 'medium.left', 0.66),
  def('off_spin', 'spin.right', 0.6),
  def('leg_spin', 'spin.right', 0.6),
  def('left_arm_orthodox', 'spin.left', 0.6),
  def('left_arm_wrist_spin', 'spin.left', 0.6),
];

/** Clip library: the shape of each procedural clip. A real asset pipeline would replace these. */
export interface ClipSpec {
  readonly kind: BowlerKind;
  readonly arm: Arm;
}
const clipIds = (
  family: string,
  kind: BowlerKind,
  arm: Arm,
): [string, ClipSpec][] =>
  (['idle', 'runup', 'delivery', 'follow'] as const).map((part) => [
    `bowler.${family}.${part}`,
    { kind, arm },
  ]);
export const CLIP_LIBRARY: ReadonlyMap<string, ClipSpec> = new Map([
  ...clipIds('fast.right', 'fast', 'right'),
  ...clipIds('fast.left', 'fast', 'left'),
  ...clipIds('medium.right', 'medium', 'right'),
  ...clipIds('medium.left', 'medium', 'left'),
  ...clipIds('spin.right', 'spin', 'right'),
  ...clipIds('spin.left', 'spin', 'left'),
]);

export interface ResolvedBowlingAnimation {
  readonly definition: BowlingAnimationDefinition;
  readonly clip: ClipSpec;
  /** True when the style had no mapped/available clip and a generic action was used instead. */
  readonly fallback: boolean;
}

/** The generic action used when a style has no clip: always available, never crashes the scene. */
const FALLBACK = def('right_arm_medium', 'medium.right', 0.66);

export function bowlerKindFor(style: string): BowlerKind {
  return [
    'off_spin',
    'leg_spin',
    'left_arm_orthodox',
    'left_arm_wrist_spin',
  ].includes(style)
    ? 'spin'
    : style.includes('medium')
      ? 'medium'
      : 'fast';
}
export const armFor = (style: string): Arm =>
  style.startsWith('left_arm') ? 'left' : 'right';

/**
 * Map a bowling style to its animation. `unavailable` lets a failed or missing asset be simulated
 * (and logged by the caller); the result is always playable.
 */
export function resolveBowlingAnimation(
  style: string,
  unavailable: ReadonlySet<string> = new Set(),
): ResolvedBowlingAnimation {
  const wanted = BOWLING_ANIMATIONS.find((d) => d.bowlingStyleId === style);
  const usable =
    wanted &&
    [
      wanted.idleAnimationId,
      wanted.runUpAnimationId,
      wanted.deliveryAnimationId,
      wanted.followThroughAnimationId,
    ].every((id) => CLIP_LIBRARY.has(id) && !unavailable.has(id));
  if (usable)
    return {
      definition: wanted,
      clip: CLIP_LIBRARY.get(wanted.deliveryAnimationId)!,
      fallback: false,
    };
  // Keep the bowler's real arm (and pace where possible) so the fallback still looks like them:
  // same kind and arm, then a medium action with the same arm, then the generic right-arm medium.
  const kind = bowlerKindFor(style);
  const arm = armFor(style);
  for (const family of [`${kind}.${arm}`, `medium.${arm}`]) {
    const candidate = def(style, family, FALLBACK.releaseMarker);
    const ids = [
      candidate.idleAnimationId,
      candidate.runUpAnimationId,
      candidate.deliveryAnimationId,
      candidate.followThroughAnimationId,
    ];
    if (ids.every((id) => CLIP_LIBRARY.has(id) && !unavailable.has(id)))
      return {
        definition: candidate,
        clip: CLIP_LIBRARY.get(candidate.deliveryAnimationId)!,
        fallback: true,
      };
  }
  return {
    definition: FALLBACK,
    clip: CLIP_LIBRARY.get(FALLBACK.deliveryAnimationId)!,
    fallback: true,
  };
}

export const DELIVERY_SECONDS: Record<BowlerKind, number> = {
  fast: 0.62,
  medium: 0.56,
  spin: 0.5,
};
export const FOLLOW_THROUGH_SECONDS = 0.55;
/** How far past the crease the bowler travels after releasing (follow-through), metres. */
export const FOLLOW_THROUGH_DISTANCE: Record<BowlerKind, number> = {
  fast: 1.6,
  medium: 1.2,
  spin: 0.5,
};

export type JointName =
  | 'head'
  | 'neck'
  | 'pelvis'
  | 'shoulderBowl'
  | 'shoulderOther'
  | 'elbowBowl'
  | 'elbowOther'
  | 'handBowl'
  | 'handOther'
  | 'hipLeft'
  | 'hipRight'
  | 'kneeLeft'
  | 'kneeRight'
  | 'footLeft'
  | 'footRight';
export type Pose = Record<JointName, Vec3>;

export const BODY = {
  hipHeight: 0.95,
  torso: 0.56,
  shoulderHalf: 0.2,
  hipHalf: 0.1,
  arm: 0.64,
  leg: 0.94,
  head: 0.2,
} as const;

/** Where a bowler stands when not in the run-up. */
export const IDLE_FORWARD = 0;

interface RigInput {
  readonly arm: Arm;
  /** Pelvis ground position. */
  readonly u: number;
  readonly v: number;
  /** Forward lean of the torso, radians. */
  readonly lean: number;
  /** Bowling-arm angle: 0 hangs down, PI/2 straight forward, PI overhead. */
  readonly bowlArm: number;
  readonly otherArm: number;
  /** Stride phase in turns; the legs alternate. */
  readonly stride: number;
  readonly strideAmplitude: number;
  readonly crouch: number;
}

const armPoint = (shoulder: Vec3, angle: number, length: number, u = 0): Vec3 =>
  vec(
    shoulder.u + u,
    shoulder.v + Math.sin(angle) * length,
    shoulder.z - Math.cos(angle) * length,
  );

export function rig(input: RigInput): Pose {
  const side = input.arm === 'right' ? 1 : -1;
  const hipZ = BODY.hipHeight - input.crouch;
  const pelvis = vec(input.u, input.v, hipZ);
  const neckV = Math.sin(input.lean) * BODY.torso;
  const neckZ = Math.cos(input.lean) * BODY.torso;
  const neck = vec(input.u, input.v + neckV, hipZ + neckZ);
  const shoulderBowl = vec(
    input.u + side * BODY.shoulderHalf,
    neck.v,
    neck.z - 0.02,
  );
  const shoulderOther = vec(
    input.u - side * BODY.shoulderHalf,
    neck.v,
    neck.z - 0.02,
  );
  const handBowl = armPoint(shoulderBowl, input.bowlArm, BODY.arm);
  const handOther = armPoint(shoulderOther, input.otherArm, BODY.arm);
  const elbowBowl = armPoint(shoulderBowl, input.bowlArm, BODY.arm * 0.5);
  const elbowOther = armPoint(shoulderOther, input.otherArm, BODY.arm * 0.5);
  const swing = Math.sin(input.stride * Math.PI * 2) * input.strideAmplitude;
  const lift = (phaseOffset: number) =>
    Math.max(0, Math.sin((input.stride + phaseOffset) * Math.PI * 2)) *
    input.strideAmplitude *
    0.5;
  const leg = (sideSign: number, offset: number) => {
    const hip = vec(input.u + sideSign * BODY.hipHalf, input.v, hipZ);
    const reach = swing * (offset === 0 ? 1 : -1);
    const foot = vec(hip.u, input.v + reach, lift(offset));
    const knee = vec(
      hip.u,
      lerp(hip.v, foot.v, 0.5) + 0.08,
      lerp(hip.z, foot.z, 0.5) + 0.06 + lift(offset) * 0.4,
    );
    return { hip, foot, knee };
  };
  const left = leg(-1, 0);
  const right = leg(1, 0.5);
  return {
    head: vec(neck.u, neck.v + 0.04, neck.z + 0.22),
    neck,
    pelvis,
    shoulderBowl,
    shoulderOther,
    elbowBowl,
    elbowOther,
    handBowl,
    handOther,
    hipLeft: left.hip,
    hipRight: right.hip,
    kneeLeft: left.knee,
    kneeRight: right.knee,
    footLeft: left.foot,
    footRight: right.foot,
  };
}

export type BowlerPhase =
  'idle' | 'walk_back' | 'run_up' | 'delivery' | 'follow_through';

export interface BowlerFrame {
  readonly pose: Pose;
  readonly phase: BowlerPhase;
  /** Normalized time inside the current phase. */
  readonly phaseTime: number;
  /** Position of the bowling hand: the ball leaves from here. */
  readonly hand: Vec3;
}

/** The bowler waits at the crease while the player aims, then walks back to his mark before running in. */
export const WALK_BACK_SECONDS: Record<BowlerKind, number> = {
  fast: 0.55,
  medium: 0.4,
  spin: 0.25,
};
export const CREASE_V = -0.4;

export interface BowlerTimeline {
  readonly kind: BowlerKind;
  readonly walkBackSeconds: number;
  readonly arm: Arm;
  readonly runUpDistance: number;
  readonly runUpSeconds: number;
  readonly deliverySeconds: number;
  readonly releaseMarker: number;
  /** Lateral position of the bowler's run (over the wicket). */
  readonly lineU: number;
}

export function timelineFor(
  kind: BowlerKind,
  arm: Arm,
  releaseMarker: number,
  reduced = false,
  /** An AI bowler waits at his mark and runs in at once; there is no aiming to walk back from. */
  startAtMark = false,
): BowlerTimeline {
  const spec = RUN_UP[kind];
  return {
    kind,
    walkBackSeconds: startAtMark
      ? 0
      : reduced
        ? WALK_BACK_SECONDS[kind] * 0.6
        : WALK_BACK_SECONDS[kind],
    arm,
    runUpDistance: spec.distance,
    runUpSeconds: reduced ? spec.duration * 0.7 : spec.duration,
    deliverySeconds: DELIVERY_SECONDS[kind],
    releaseMarker,
    lineU: arm === 'right' ? 0.16 : -0.16,
  };
}

/**
 * Pose at a point on the timeline. `clock` is seconds since the delivery began: first the bowler
 * walks back from his crease to his mark, then runs in, delivers and follows through.
 */
export function bowlerFrameAt(
  timeline: BowlerTimeline,
  clock: number,
): BowlerFrame {
  const startV = -timeline.runUpDistance;
  const side = timeline.arm === 'right' ? 1 : -1;
  const u = timeline.lineU;
  if (clock < 0)
    return idleFrame(
      timeline,
      timeline.walkBackSeconds > 0 ? CREASE_V : startV,
    );
  if (clock < timeline.walkBackSeconds) {
    const s = clamp(clock / timeline.walkBackSeconds);
    const stride = (clock * 2.4) % 1;
    const pose = rig({
      arm: timeline.arm,
      u,
      v: lerp(CREASE_V, startV, smoothstep(s)),
      lean: 0.04,
      bowlArm: 0.2 + 0.25 * Math.sin(stride * Math.PI * 2),
      otherArm: 0.2 - 0.25 * Math.sin(stride * Math.PI * 2),
      stride,
      strideAmplitude: 0.35,
      crouch: 0,
    });
    return { pose, phase: 'walk_back', phaseTime: s, hand: pose.handBowl };
  }
  const t = clock - timeline.walkBackSeconds;
  const runEnd = timeline.runUpSeconds;
  const deliveryEnd = runEnd + timeline.deliverySeconds;
  if (t < runEnd) {
    const s = clamp(t / runEnd);
    const stride = (t * RUN_UP[timeline.kind].strideRate) % 1;
    const v = lerp(startV, -0.15, easeRun(s));
    const pose = rig({
      arm: timeline.arm,
      u,
      v,
      lean: 0.16,
      bowlArm: 0.7 * Math.sin(stride * Math.PI * 2) + 0.4,
      otherArm: -0.7 * Math.sin(stride * Math.PI * 2) + 0.4,
      stride,
      strideAmplitude: 0.55,
      crouch: 0.04,
    });
    return { pose, phase: 'run_up', phaseTime: s, hand: pose.handBowl };
  }
  if (t < deliveryEnd) {
    const s = clamp((t - runEnd) / timeline.deliverySeconds);
    // arm: back (-0.5) during the gather, over the top (PI * 0.92) at the release marker
    const gather = clamp(s / Math.max(0.01, timeline.releaseMarker));
    const bowlArm = lerp(-0.55, Math.PI * 0.92, smoothstep(gather));
    const otherArm =
      s < timeline.releaseMarker
        ? lerp(0.6, Math.PI * 0.8, smoothstep(s / timeline.releaseMarker))
        : lerp(
            Math.PI * 0.8,
            0.5,
            smoothstep((s - timeline.releaseMarker) / 0.3),
          );
    const pose = rig({
      arm: timeline.arm,
      u: u - side * 0.03 * Math.sin(s * Math.PI),
      v: lerp(-0.15, FLIGHT.releaseAhead - 0.05, smoothstep(s)),
      lean: lerp(0.1, 0.5, smoothstep(s)),
      bowlArm,
      otherArm,
      stride: 0.25 + s * 0.3,
      strideAmplitude: 0.7,
      crouch: 0.1 * Math.sin(s * Math.PI),
    });
    return { pose, phase: 'delivery', phaseTime: s, hand: pose.handBowl };
  }
  const f = clamp((t - deliveryEnd) / FOLLOW_THROUGH_SECONDS);
  const pose = rig({
    arm: timeline.arm,
    u,
    v: lerp(
      FLIGHT.releaseAhead - 0.05,
      FOLLOW_THROUGH_DISTANCE[timeline.kind],
      easeRun(f),
    ),
    lean: lerp(0.5, 0.75, smoothstep(f)),
    bowlArm: lerp(Math.PI * 0.92, Math.PI * 1.55, smoothstep(f)),
    otherArm: lerp(0.5, 0.15, smoothstep(f)),
    stride: 0.55 + f * 0.4,
    strideAmplitude: 0.45 * (1 - f * 0.6),
    crouch: 0.12,
  });
  return {
    pose,
    phase: 'follow_through',
    phaseTime: f,
    hand: pose.handBowl,
  };
}
const easeRun = (s: number) => 1 - (1 - clamp(s)) ** 1.6;

function idleFrame(timeline: BowlerTimeline, startV: number): BowlerFrame {
  const pose = rig({
    arm: timeline.arm,
    u: timeline.lineU,
    v: startV,
    lean: 0.06,
    bowlArm: 0.12,
    otherArm: 0.12,
    stride: 0,
    strideAmplitude: 0,
    crouch: 0,
  });
  return { pose, phase: 'idle', phaseTime: 0, hand: pose.handBowl };
}

export type AnimatorEvent =
  | { type: 'RUN_UP_STARTED' }
  | { type: 'BALL_RELEASE'; hand: Vec3 }
  | { type: 'FOLLOW_THROUGH_STARTED' }
  | { type: 'ANIMATION_COMPLETE' }
  | { type: 'ANIMATION_CANCELLED' };

/**
 * Drives the bowler's action from frame deltas (not timers), so pausing the scene pauses the
 * bowler. At the release marker it emits BALL_RELEASE; if the listener answers `false` (the
 * server has not replied yet) the action holds at that instant until `update` is called again and
 * the listener says yes. That keeps the ball from being "released" before it has a result.
 */
export class BowlingAnimator {
  private time = -1;
  private releasedAt: number | null = null;
  private active = false;
  private followEmitted = false;
  private listener: (event: AnimatorEvent) => boolean | void = () => undefined;
  constructor(public timeline: BowlerTimeline) {}
  on(listener: (event: AnimatorEvent) => boolean | void): void {
    this.listener = listener;
  }
  get isActive(): boolean {
    return this.active;
  }
  get releaseTime(): number {
    return (
      this.timeline.walkBackSeconds +
      this.timeline.runUpSeconds +
      this.timeline.deliverySeconds * this.timeline.releaseMarker
    );
  }
  get released(): boolean {
    return this.releasedAt !== null;
  }
  get elapsed(): number {
    return Math.max(0, this.time);
  }
  start(): void {
    this.time = 0;
    this.releasedAt = null;
    this.followEmitted = false;
    this.active = true;
    this.listener({ type: 'RUN_UP_STARTED' });
  }
  /** Aborts before release (for example when the server rejected the delivery). */
  cancel(): void {
    if (!this.active) return;
    this.active = false;
    this.time = -1;
    this.listener({ type: 'ANIMATION_CANCELLED' });
  }
  reset(): void {
    this.active = false;
    this.time = -1;
    this.releasedAt = null;
  }
  frame(): BowlerFrame {
    return bowlerFrameAt(this.timeline, this.time);
  }
  /** Advance by `dt` seconds. */
  update(dt: number): BowlerFrame {
    if (!this.active) return this.frame();
    const next = this.time + Math.max(0, dt);
    if (this.releasedAt === null && next >= this.releaseTime) {
      this.time = this.releaseTime;
      const ready = this.listener({
        type: 'BALL_RELEASE',
        hand: this.frame().hand,
      });
      if (ready === false) return this.frame();
      this.releasedAt = this.time;
      return this.frame();
    }
    this.time = next;
    const total =
      this.timeline.walkBackSeconds +
      this.timeline.runUpSeconds +
      this.timeline.deliverySeconds +
      FOLLOW_THROUGH_SECONDS;
    const deliveryEnd =
      this.timeline.walkBackSeconds +
      this.timeline.runUpSeconds +
      this.timeline.deliverySeconds;
    if (!this.followEmitted && this.time >= deliveryEnd) {
      this.followEmitted = true;
      this.listener({ type: 'FOLLOW_THROUGH_STARTED' });
    }
    if (this.time >= total) {
      this.time = total;
      this.active = false;
      this.listener({ type: 'ANIMATION_COMPLETE' });
    }
    return this.frame();
  }
}
