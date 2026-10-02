import { PITCH } from '../config/visual-config';
import {
  BATTING_ANIMATION_BY_SHOT,
  CONTACT_FORWARD,
  timeToContact,
} from '../config/batting-animations';
import type { BattingAnimationDefinition } from '../config/batting-animations';
import { handSign } from './coordinates';
import type { BattingHand } from './coordinates';
import { clamp, lerp, smoothstep, vec } from './vec';
import type { Vec3 } from './vec';

/**
 * The batter's procedural rig. Everything is expressed in the batter's own frame (right-hander,
 * metres from the middle of the stance: `off` toward the off side, `fwd` toward the bowler, `z` up) and
 * converted to world coordinates once, so a left-hander is an exact mirror rather than a second
 * implementation. A clip is a handful of keyframes with the contact frame placed by the metadata, not
 * by a timer; the additive adjustments below are zero outside the contact window.
 */
export interface Rel {
  readonly off: number;
  readonly fwd: number;
  readonly z: number;
}
const rel = (off: number, fwd: number, z: number): Rel => ({ off, fwd, z });
const lerpRel = (a: Rel, b: Rel, t: number): Rel => ({
  off: lerp(a.off, b.off, t),
  fwd: lerp(a.fwd, b.fwd, t),
  z: lerp(a.z, b.z, t),
});

/** Small body corrections added on top of a clip around the contact frame. */
export interface BattingPoseAdjust {
  readonly rootOff: number;
  readonly rootFwd: number;
  /** Knee bend: lowers the whole body (positive = lower). */
  readonly rootDown: number;
  readonly hipYaw: number;
  readonly shoulderYaw: number;
  readonly upperBodyPitch: number;
  readonly batRotation: number;
}
export const NO_ADJUST: BattingPoseAdjust = {
  rootOff: 0,
  rootFwd: 0,
  rootDown: 0,
  hipYaw: 0,
  shoulderYaw: 0,
  upperBodyPitch: 0,
  batRotation: 0,
};

export type BatterJoint =
  | 'head'
  | 'neck'
  | 'pelvis'
  | 'shoulderL'
  | 'shoulderR'
  | 'elbowL'
  | 'elbowR'
  | 'grip'
  | 'kneeL'
  | 'kneeR'
  | 'footL'
  | 'footR';

export interface BatterFrame {
  readonly joints: Record<BatterJoint, Vec3>;
  readonly batGrip: Vec3;
  readonly batTip: Vec3;
  /** The middle of the blade: where a clean hit lands. */
  readonly sweetSpot: Vec3;
  readonly insideEdge: Vec3;
  readonly outsideEdge: Vec3;
  readonly swinging: boolean;
  /** Seconds-based progress through the clip (0 before, 1 at the end). */
  readonly progress: number;
  /** The batter's own-frame bat tip, for tools. */
  readonly tipRel: Rel;
}

interface Pose {
  readonly rootOff: number;
  readonly rootFwd: number;
  readonly crouch: number;
  readonly lean: number;
  readonly grip: Rel;
  readonly tip: Rel;
  readonly frontStep: number;
  readonly backStep: number;
}

export const BAT_LENGTH = 0.85;
/** Where on the blade (from the toe) a clean hit lands, and how wide the blade's edges are. */
export const SWEET_SPOT_FRACTION = 0.3;
export const EDGE_HALF_WIDTH = 0.055;
const BODY = {
  hip: 0.92,
  torso: 0.56,
  shoulder: 0.2,
  hipHalf: 0.1,
  head: 0.22,
};

const STANCE: Pose = {
  rootOff: 0,
  rootFwd: 0,
  crouch: 0.05,
  lean: 0.08,
  grip: rel(0.14, 0.12, 0.82),
  tip: rel(0.14, 0.2, 0.05),
  frontStep: 0,
  backStep: 0,
};

/** Direction from the grip to the toe at the contact frame, per clip class (unit-ish, batter frame). */
const CONTACT_DIR: Record<string, Rel> = {
  defend_front: rel(0.08, 0.3, -0.95),
  defend_back: rel(0.08, 0.2, -0.97),
  drive: rel(0.1, 0.35, -0.93),
  flick: rel(-0.55, 0.4, -0.73),
  cut: rel(0.93, 0.2, -0.3),
  pull: rel(-0.93, 0.25, -0.27),
  hook: rel(-0.8, 0.25, -0.54),
  loft: rel(0.1, 0.3, -0.95),
};
/** Where the toe goes after contact, relative to the contact point. */
const FOLLOW: Record<string, Rel> = {
  defend_front: rel(0, 0.04, 0.02),
  defend_back: rel(0, 0.02, 0.02),
  drive: rel(-0.12, 0.55, 0.85),
  flick: rel(-0.5, 0.45, 0.35),
  cut: rel(0.45, 0.4, -0.2),
  pull: rel(-0.7, 0.45, -0.25),
  hook: rel(-0.55, 0.35, 0.05),
  loft: rel(-0.1, 0.6, 1.25),
};
const BACKLIFT: Record<string, { grip: Rel; tip: Rel }> = {
  defend_front: { grip: rel(0.14, 0.02, 1.0), tip: rel(0.16, 0.08, 0.6) },
  defend_back: { grip: rel(0.14, -0.1, 1.1), tip: rel(0.16, -0.05, 0.75) },
  drive: { grip: rel(0.1, -0.15, 1.2), tip: rel(0.14, -0.35, 1.75) },
  flick: { grip: rel(0.1, -0.15, 1.15), tip: rel(0.12, -0.35, 1.7) },
  cut: { grip: rel(0.2, -0.2, 1.25), tip: rel(0.45, -0.3, 1.7) },
  pull: { grip: rel(0.15, -0.2, 1.3), tip: rel(0.1, -0.3, 1.8) },
  hook: { grip: rel(0.15, -0.2, 1.4), tip: rel(0.1, -0.3, 1.8) },
  loft: { grip: rel(0.1, -0.2, 1.35), tip: rel(0.14, -0.45, 1.95) },
};

function contactPose(def: BattingAnimationDefinition): Pose {
  const d = CONTACT_DIR[def.clipClass]!;
  // `idealContact` is where the SWEET SPOT meets the ball, so the toe sits a little further along the blade
  const tip = rel(
    def.idealContact.off + d.off * BAT_LENGTH * SWEET_SPOT_FRACTION,
    CONTACT_FORWARD + d.fwd * BAT_LENGTH * SWEET_SPOT_FRACTION,
    def.idealContact.height + d.z * BAT_LENGTH * SWEET_SPOT_FRACTION,
  );
  const back = def.stanceType === 'back_foot';
  return {
    rootOff: def.idealContact.off * 0.25,
    rootFwd: back ? -0.1 : def.footStep * 0.55,
    crouch: back ? 0.1 : 0.14,
    lean: back ? -0.04 : 0.22,
    grip: rel(
      tip.off - d.off * BAT_LENGTH,
      tip.fwd - d.fwd * BAT_LENGTH,
      tip.z - d.z * BAT_LENGTH,
    ),
    tip,
    frontStep: back ? 0.04 : def.footStep,
    backStep: back ? -def.footStep : -0.08,
  };
}

function keyframes(def: BattingAnimationDefinition): [number, Pose][] {
  const c = def.contactNormalizedTime;
  const lift = BACKLIFT[def.clipClass]!;
  const contact = contactPose(def);
  const f = FOLLOW[def.clipClass]!;
  const followTip = rel(
    contact.tip.off + f.off,
    contact.tip.fwd + f.fwd,
    Math.max(0.05, contact.tip.z + f.z),
  );
  const d = CONTACT_DIR[def.clipClass]!;
  const followGrip = rel(
    followTip.off - d.off * BAT_LENGTH * 0.6,
    followTip.fwd - 0.1,
    followTip.z + 0.45,
  );
  const stanceBack = def.stanceType === 'back_foot';
  return [
    [0, STANCE],
    [
      c * 0.45,
      {
        ...STANCE,
        crouch: 0.07,
        lean: 0.04,
        grip: lift.grip,
        tip: lift.tip,
        rootFwd: stanceBack ? -0.04 : 0.02,
      },
    ],
    [c, contact],
    [
      c + (1 - c) * 0.5,
      {
        ...contact,
        grip: followGrip,
        tip: followTip,
        lean: contact.lean + 0.06,
        crouch: contact.crouch * 0.7,
      },
    ],
    [
      1,
      {
        ...contact,
        grip: lerpRel(
          followGrip,
          rel(followGrip.off, followGrip.fwd, followGrip.z + 0.1),
          1,
        ),
        tip: followTip,
        lean: contact.lean * 0.8,
        crouch: contact.crouch * 0.5,
      },
    ],
  ];
}

const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
  rootOff: lerp(a.rootOff, b.rootOff, t),
  rootFwd: lerp(a.rootFwd, b.rootFwd, t),
  crouch: lerp(a.crouch, b.crouch, t),
  lean: lerp(a.lean, b.lean, t),
  grip: lerpRel(a.grip, b.grip, t),
  tip: lerpRel(a.tip, b.tip, t),
  frontStep: lerp(a.frontStep, b.frontStep, t),
  backStep: lerp(a.backStep, b.backStep, t),
});

/** Pose at a normalized clip time, interpolating the keyframes with an ease. */
function poseAt(def: BattingAnimationDefinition, tau: number): Pose {
  const keys = keyframes(def);
  const t = clamp(tau);
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1] = keys[i]!;
    const [t0, p0] = keys[i - 1]!;
    if (t <= t1)
      return mixPose(p0, p1, smoothstep((t - t0) / Math.max(1e-6, t1 - t0)));
  }
  return keys.at(-1)![1];
}

/**
 * How strongly the additive corrections apply at a clip time: zero until the backlift ends, full at
 * the contact frame, back to zero by the end of the clip. Outside that window the original animation
 * plays untouched, and a finished shot leaves nothing behind.
 */
export function adjustWeight(
  def: BattingAnimationDefinition,
  tau: number,
): number {
  const c = def.contactNormalizedTime;
  const start = c * 0.45;
  if (tau <= start || tau >= 1) return 0;
  if (tau <= c) return smoothstep((tau - start) / (c - start));
  return 1 - smoothstep((tau - c) / (1 - c));
}

const rotateAbout = (origin: Rel, point: Rel, yaw: number): Rel => {
  // rotate in the horizontal plane (off, fwd) about a vertical axis through `origin`
  const dx = point.off - origin.off;
  const dy = point.fwd - origin.fwd;
  return {
    off: origin.off + dx * Math.cos(yaw) - dy * Math.sin(yaw),
    fwd: origin.fwd + dx * Math.sin(yaw) + dy * Math.cos(yaw),
    z: point.z,
  };
};

/** The grip and toe for a pose after the additive adjustments. */
function applyAdjust(
  pose: Pose,
  a: BattingPoseAdjust,
  w: number,
): {
  grip: Rel;
  tip: Rel;
  rootOff: number;
  rootFwd: number;
  lean: number;
  hipYaw: number;
  shoulderYaw: number;
  down: number;
} {
  const rootOff = pose.rootOff + a.rootOff * w;
  const rootFwd = pose.rootFwd + a.rootFwd * w;
  const lean = pose.lean + a.upperBodyPitch * w;
  const hipYaw = a.hipYaw * w;
  const shoulderYaw = a.shoulderYaw * w;
  const down = a.rootDown * w;
  const neck = rel(
    rootOff,
    rootFwd + Math.sin(lean) * BODY.torso,
    BODY.hip - pose.crouch - down + Math.cos(lean) * BODY.torso,
  );
  // the upper body carries the hands: shoulder yaw swings them about the neck, hip yaw about the pelvis
  const pelvis = rel(rootOff, rootFwd, 0);
  let grip = rotateAbout(
    pelvis,
    rel(
      pose.grip.off + a.rootOff * w,
      pose.grip.fwd + a.rootFwd * w,
      pose.grip.z,
    ),
    hipYaw * 0.6,
  );
  grip = rotateAbout(neck, grip, shoulderYaw);
  // lean forward drops the hands a little (and leaning back raises them)
  grip = rel(
    grip.off,
    grip.fwd + Math.sin(a.upperBodyPitch * w) * 0.3,
    grip.z - 0.7 * a.upperBodyPitch * w - down,
  );
  const rawTip = rel(
    pose.tip.off + (grip.off - pose.grip.off),
    pose.tip.fwd + (grip.fwd - pose.grip.fwd),
    pose.tip.z + (grip.z - pose.grip.z),
  );
  // bat rotation: swing the toe about the grip across the blade (positive carries it toward the off side)
  const bx = rawTip.off - grip.off;
  const bz = rawTip.z - grip.z;
  const theta = a.batRotation * w;
  const tip = rel(
    grip.off + bx * Math.cos(theta) + bz * Math.sin(theta) * -1,
    rawTip.fwd,
    grip.z + bx * Math.sin(theta) + bz * Math.cos(theta),
  );
  return { grip, tip, rootOff, rootFwd, lean, hipYaw, shoulderYaw, down };
}

export interface SwingSpec {
  readonly shotId: string;
  readonly hand: BattingHand;
  readonly adjust: BattingPoseAdjust;
  /** Playback speed multiplier (1 = the clip's own rhythm); timing warp lives here. */
  readonly speed: number;
  /** Extra bat offset applied AT the contact frame only (a miss passes the ball; an edge meets it with the edge). */
  readonly contactShift: Rel;
}

const toWorldFactory = (hand: BattingHand) => {
  const sign = handSign(hand);
  return (r: Rel): Vec3 => vec(-sign * r.off, PITCH.batterV - r.fwd, r.z);
};
/** Batter-frame position of a world point (the inverse of the mapping above). */
export function worldToRel(p: Vec3, hand: BattingHand): Rel {
  const sign = handSign(hand);
  return rel(-sign * p.u, PITCH.batterV - p.v, p.z);
}
export function relToWorld(r: Rel, hand: BattingHand): Vec3 {
  return toWorldFactory(hand)(r);
}

/** The batter at rest: stance, with a barely-there breathing sway so it does not look frozen. */
export function stanceFrame(hand: BattingHand, clock = 0): BatterFrame {
  return buildFrame(
    STANCE,
    NO_ADJUST,
    0,
    hand,
    0,
    false,
    Math.sin(clock * 1.6) * 0.012,
  );
}

/** Where the toe of the bat is at the contact frame for a given adjustment (used by the contact solver). */
export function contactTipRel(
  def: BattingAnimationDefinition,
  adjust: BattingPoseAdjust,
  shift: Rel = rel(0, 0, 0),
): Rel {
  const pose = poseAt(def, def.contactNormalizedTime);
  const out = applyAdjust(pose, adjust, 1);
  return rel(
    out.tip.off + shift.off,
    out.tip.fwd + shift.fwd,
    out.tip.z + shift.z,
  );
}

/** Position of the sweet spot (not the toe) at the contact frame. */
export function contactSweetSpotRel(
  def: BattingAnimationDefinition,
  adjust: BattingPoseAdjust,
  shift: Rel = rel(0, 0, 0),
): Rel {
  const pose = poseAt(def, def.contactNormalizedTime);
  const out = applyAdjust(pose, adjust, 1);
  return rel(
    lerp(out.tip.off, out.grip.off, SWEET_SPOT_FRACTION) + shift.off,
    lerp(out.tip.fwd, out.grip.fwd, SWEET_SPOT_FRACTION) + shift.fwd,
    lerp(out.tip.z, out.grip.z, SWEET_SPOT_FRACTION) + shift.z,
  );
}

function buildFrame(
  pose: Pose,
  adjust: BattingPoseAdjust,
  weight: number,
  hand: BattingHand,
  progress: number,
  swinging: boolean,
  sway = 0,
  shift: Rel = rel(0, 0, 0),
  shiftWeight = 0,
): BatterFrame {
  const toWorld = toWorldFactory(hand);
  const o = applyAdjust(pose, adjust, weight);
  const gripRel = rel(
    o.grip.off + shift.off * shiftWeight,
    o.grip.fwd + shift.fwd * shiftWeight,
    o.grip.z + sway + shift.z * shiftWeight,
  );
  const tipRel = rel(
    o.tip.off + shift.off * shiftWeight,
    o.tip.fwd + shift.fwd * shiftWeight,
    o.tip.z + shift.z * shiftWeight,
  );
  const pelvisRel = rel(o.rootOff, o.rootFwd, BODY.hip - pose.crouch - o.down);
  const neckRel = rel(
    o.rootOff,
    o.rootFwd + Math.sin(o.lean) * BODY.torso,
    BODY.hip - pose.crouch - o.down + Math.cos(o.lean) * BODY.torso,
  );
  const centre = rel(neckRel.off, neckRel.fwd, neckRel.z - 0.02);
  const shoulder = (side: number) =>
    rotateAbout(
      centre,
      rel(centre.off + side * BODY.shoulder, centre.fwd, centre.z),
      o.shoulderYaw,
    );
  const hip = (side: number) =>
    rotateAbout(
      pelvisRel,
      rel(pelvisRel.off + side * BODY.hipHalf, pelvisRel.fwd, pelvisRel.z),
      o.hipYaw,
    );
  // front foot (the leg-side one for either hand, in the batter's own frame) strides toward the bowler
  const frontFoot = rel(
    -0.22 + o.rootOff * 0.4,
    pose.frontStep + o.rootFwd * 0.5,
    0,
  );
  const backFoot = rel(
    0.22 + o.rootOff * 0.4,
    pose.backStep + o.rootFwd * 0.5,
    0,
  );
  const knee = (h: Rel, f: Rel, bend: number) =>
    rel(
      lerp(h.off, f.off, 0.5),
      lerp(h.fwd, f.fwd, 0.5) + bend,
      lerp(h.z, f.z, 0.5) + 0.04,
    );
  const shL = shoulder(-1);
  const shR = shoulder(1);
  const elbow = (s: Rel, side: number) =>
    rel(
      lerp(s.off, gripRel.off, 0.5) + side * 0.07,
      lerp(s.fwd, gripRel.fwd, 0.5) - 0.05,
      lerp(s.z, gripRel.z, 0.5) - 0.08,
    );
  const sweet = rel(
    lerp(tipRel.off, gripRel.off, SWEET_SPOT_FRACTION),
    lerp(tipRel.fwd, gripRel.fwd, SWEET_SPOT_FRACTION),
    lerp(tipRel.z, gripRel.z, SWEET_SPOT_FRACTION),
  );
  const hipL = hip(-1);
  const hipR = hip(1);
  return {
    joints: {
      head: toWorld(
        rel(neckRel.off, neckRel.fwd + 0.03, neckRel.z + BODY.head),
      ),
      neck: toWorld(neckRel),
      pelvis: toWorld(pelvisRel),
      shoulderL: toWorld(shL),
      shoulderR: toWorld(shR),
      elbowL: toWorld(elbow(shL, -1)),
      elbowR: toWorld(elbow(shR, 1)),
      grip: toWorld(gripRel),
      kneeL: toWorld(knee(hipL, frontFoot, 0.06)),
      kneeR: toWorld(knee(hipR, backFoot, 0.04)),
      footL: toWorld(frontFoot),
      footR: toWorld(backFoot),
    },
    batGrip: toWorld(gripRel),
    batTip: toWorld(tipRel),
    sweetSpot: toWorld(sweet),
    insideEdge: toWorld(rel(sweet.off - EDGE_HALF_WIDTH, sweet.fwd, sweet.z)),
    outsideEdge: toWorld(rel(sweet.off + EDGE_HALF_WIDTH, sweet.fwd, sweet.z)),
    swinging,
    progress,
    tipRel,
  };
}

/**
 * The batter `clock` seconds after the swing began (negative = still in the stance). The clip plays at
 * `spec.speed` and settles back into the stance over its recovery time. With no spec the batter simply
 * stands there.
 */
export function swingFrame(
  spec: SwingSpec | null,
  clock: number,
  hand: BattingHand,
  sway = 0,
): BatterFrame {
  if (!spec || clock < 0) return stanceFrame(hand, sway);
  const def = BATTING_ANIMATION_BY_SHOT.get(spec.shotId);
  if (!def) return stanceFrame(hand, sway);
  const tau = (clock * spec.speed) / def.duration;
  if (tau < 1) {
    const pose = poseAt(def, tau);
    const w = adjustWeight(def, tau);
    // the shift (a miss, an edge) is applied around the contact frame only, and only to the bat
    const shiftWeight = adjustWeight(def, tau);
    return buildFrame(
      pose,
      spec.adjust,
      w,
      spec.hand,
      tau,
      true,
      0,
      spec.contactShift,
      shiftWeight,
    );
  }
  // recovery: ease from the end of the clip back to the stance, with no adjustment left over
  const end = poseAt(def, 1);
  const r = clamp(
    (clock * spec.speed - def.duration) / Math.max(1e-6, def.recoveryTime),
  );
  if (r >= 1) return stanceFrame(hand, sway);
  return buildFrame(
    mixPose(end, STANCE, smoothstep(r)),
    NO_ADJUST,
    0,
    spec.hand,
    1,
    false,
  );
}

/** Seconds from the start of the swing to the end of its recovery: the earliest the next ball may start. */
export function swingTotalSeconds(shotId: string, speed = 1): number {
  const def = BATTING_ANIMATION_BY_SHOT.get(shotId);
  return def ? (def.duration + def.recoveryTime) / speed : 0;
}

export { timeToContact };
