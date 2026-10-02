import type { ResolvedShotDto } from '@the-cricketer/shared-types';
import { BATTER, PITCH, SEQUENCE } from '../config/visual-config';
import { handSign } from './coordinates';
import type { BattingHand } from './coordinates';
import { clamp, lerp, lerp3, smoothstep, vec } from './vec';
import type { Vec3 } from './vec';
import type { OutcomeKind } from './trajectory';

/**
 * The AI batter's presentation. The engine already decided the shot and its contact quality; this
 * file only maps them to a convincing swing. Nothing here can change a run or a dismissal, and the
 * bat is allowed to cheat by centimetres so a "good contact" always looks like contact (and a miss
 * always shows daylight between bat and ball) without any physical collision being tested.
 */
export type ShotClip =
  | 'defend_front'
  | 'defend_back'
  | 'drive'
  | 'flick'
  | 'cut'
  | 'pull'
  | 'hook'
  | 'loft';

/** shotId -> clip. A shot without an entry falls back to its category and is reported in dev. */
export const SHOT_CLIPS: Readonly<Record<string, ShotClip>> = {
  'shot.forward_defensive': 'defend_front',
  'shot.back_foot_defensive': 'defend_back',
  'shot.straight_drive': 'drive',
  'shot.cover_drive': 'drive',
  'shot.on_drive': 'drive',
  'shot.flick': 'flick',
  'shot.cut': 'cut',
  'shot.pull': 'pull',
  'shot.hook': 'hook',
  'shot.lofted_straight': 'loft',
  'shot.lofted_off_side': 'loft',
  'shot.lofted_leg_side': 'loft',
};
const CATEGORY_FALLBACK: Readonly<Record<string, ShotClip>> = {
  defensive: 'defend_front',
  drive: 'drive',
  cross_bat: 'pull',
  lofted: 'loft',
};

export interface ClipChoice {
  readonly clip: ShotClip;
  /** True when no exact clip existed and the category fallback was used. */
  readonly fallback: boolean;
}
export function clipForShot(shotId: string, category: string): ClipChoice {
  const exact = SHOT_CLIPS[shotId];
  if (exact) return { clip: exact, fallback: false };
  return {
    clip: CATEGORY_FALLBACK[category] ?? 'defend_front',
    fallback: true,
  };
}

export interface ContactPresentation {
  readonly clip: ShotClip;
  readonly fallbackClip: boolean;
  /** Where the bat meets the ball's path (or deliberately does not). */
  readonly batContact: Vec3;
  /** Metres of daylight between the bat and the ball at the contact instant; ~0 for a hit. */
  readonly separation: number;
  /** Bat-face tilt in radians (an edge shows the bat angled). */
  readonly tilt: number;
  readonly contactMade: boolean;
  /** Seconds the swing begins before the ball arrives. */
  readonly lead: number;
}

const OFFSET: Record<ResolvedShotDto['contactQuality'], number> = {
  perfect: 0,
  good: 0.02,
  okay: 0.05,
  poor: 0.09,
  edge: 0.14,
  miss: 0,
};
/** Metres by which a missed swing passes the ball (early/late); always clearly visible. */
const MISS_SEPARATION = 0.5;

/**
 * Presentation-side "ContactPresentationResolver": from the shot, the ball's arrival point and the
 * engine's outcome, decide where the bat swings to. Tolerance is intentionally generous.
 */
export function resolveContactPresentation(
  shot: ResolvedShotDto,
  arrival: Vec3,
  kind: OutcomeKind,
  hand: BattingHand,
  reduced = false,
): ContactPresentation {
  const { clip, fallback } = clipForShot(shot.shotId, shot.category);
  const made = shot.contactQuality !== 'miss' && kind !== 'wide';
  const side = -handSign(hand);
  // a missed swing is early or late by half a metre along the line of the ball
  const miss = !made;
  const batContact = miss
    ? vec(
        arrival.u,
        arrival.v - (clip === 'loft' || clip === 'drive' ? MISS_SEPARATION : 0),
        arrival.z +
          (clip === 'pull' || clip === 'hook' || clip === 'cut' ? 0.35 : 0),
      )
    : vec(arrival.u + side * OFFSET[shot.contactQuality], arrival.v, arrival.z);
  return {
    clip,
    fallbackClip: fallback,
    batContact,
    separation: miss ? MISS_SEPARATION : OFFSET[shot.contactQuality],
    tilt: shot.contactQuality === 'edge' ? 0.55 * side : 0,
    contactMade: made,
    lead: reduced ? SEQUENCE.batterLead * 0.8 : SEQUENCE.batterLead,
  };
}

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
  /** Bat handle (top) and toe. */
  readonly batGrip: Vec3;
  readonly batTip: Vec3;
  readonly swinging: boolean;
}

const BAT_LENGTH = 0.85;

interface BatKey {
  readonly grip: Vec3;
  readonly tip: Vec3;
}

function batKeys(
  hand: BattingHand,
  presentation: ContactPresentation,
  baseU: number,
  baseV: number,
): { stance: BatKey; backlift: BatKey; contact: BatKey; follow: BatKey } {
  const side = -handSign(hand);
  const stanceU = baseU + side * 0.12;
  const stance: BatKey = {
    grip: vec(stanceU, baseV - 0.28, 0.82),
    tip: vec(stanceU, baseV - 0.34, 0.04),
  };
  const backlift: BatKey = {
    grip: vec(stanceU + side * 0.05, baseV + 0.1, 1.15),
    tip: vec(stanceU + side * 0.1, baseV + 0.32, 1.75),
  };
  const c = presentation.batContact;
  const tip = vec(c.u, c.v, c.z);
  let grip: Vec3;
  let followTip: Vec3;
  let followGrip: Vec3;
  switch (presentation.clip) {
    case 'pull':
    case 'hook':
    case 'cut': {
      // horizontal bat
      grip = vec(c.u - side * 0.7, c.v + 0.05, c.z + 0.05);
      followTip = vec(c.u + side * 0.5, c.v - 0.5, c.z + 0.2);
      followGrip = vec(c.u - side * 0.3, c.v - 0.25, c.z + 0.5);
      break;
    }
    case 'flick': {
      grip = vec(c.u + side * 0.2, c.v + 0.25, c.z + 0.62);
      followTip = vec(c.u - side * 0.55, c.v - 0.5, c.z + 0.3);
      followGrip = vec(c.u - side * 0.2, c.v - 0.1, c.z + 0.9);
      break;
    }
    case 'loft': {
      grip = vec(c.u + side * 0.1, c.v + 0.3, c.z + 0.7);
      followTip = vec(c.u - side * 0.1, c.v - 0.7, c.z + 1.3);
      followGrip = vec(c.u + side * 0.1, c.v - 0.2, c.z + 1.9);
      break;
    }
    case 'drive': {
      grip = vec(c.u + side * 0.15, c.v + 0.28, c.z + 0.68);
      followTip = vec(c.u - side * 0.1, c.v - 0.75, c.z + 0.9);
      followGrip = vec(c.u + side * 0.05, c.v - 0.1, c.z + 1.55);
      break;
    }
    default: {
      // defence: the bat meets the ball vertically and stays there
      grip = vec(c.u + side * 0.05, c.v + 0.12, c.z + 0.74);
      followTip = vec(c.u, c.v - 0.1, Math.max(0.05, c.z - 0.1));
      followGrip = vec(c.u + side * 0.05, c.v + 0.05, c.z + 0.72);
    }
  }
  const tilt = presentation.tilt;
  return {
    stance,
    backlift,
    contact: { grip: vec(grip.u + tilt * 0.2, grip.v, grip.z), tip },
    follow: { grip: followGrip, tip: followTip },
  };
}

const mix = (a: BatKey, b: BatKey, t: number): BatKey => ({
  grip: lerp3(a.grip, b.grip, t),
  tip: lerp3(a.tip, b.tip, t),
});

export interface BatterSpec {
  readonly hand: BattingHand;
}

/**
 * Pose at time `t` relative to the instant the ball arrives (negative before). With no
 * presentation the batter stands in stance; with one he plays the shot.
 */
export function batterFrameAt(
  spec: BatterSpec,
  presentation: ContactPresentation | null,
  t: number,
): BatterFrame {
  const side = -handSign(spec.hand);
  const baseU = BATTER.guardOffset * handSign(spec.hand);
  const baseV = PITCH.batterV;
  let key: BatKey;
  let progress = 0;
  let swinging = false;
  if (!presentation) {
    const sway = Math.sin(t * 1.6) * 0.012;
    key = {
      grip: vec(baseU + side * 0.12, baseV - 0.28, 0.82 + sway),
      tip: vec(baseU + side * 0.12, baseV - 0.34, 0.04),
    };
  } else {
    const keys = batKeys(spec.hand, presentation, baseU, baseV);
    const lead = presentation.lead;
    if (t <= -lead) key = keys.stance;
    else if (t < -lead * 0.45)
      key = mix(
        keys.stance,
        keys.backlift,
        smoothstep((t + lead) / (lead * 0.55)),
      );
    else if (t < 0)
      key = mix(
        keys.backlift,
        keys.contact,
        smoothstep((t + lead * 0.45) / (lead * 0.45)),
      );
    else key = mix(keys.contact, keys.follow, smoothstep(t / 0.45));
    swinging = t > -lead;
    progress = clamp((t + lead) / (lead + 0.45));
  }
  const front =
    presentation?.clip === 'defend_back' ||
    presentation?.clip === 'cut' ||
    presentation?.clip === 'pull' ||
    presentation?.clip === 'hook'
      ? 0.18
      : -0.22;
  const shift = presentation ? front * smoothstep(progress * 1.4) : 0;
  const pelvis = vec(
    baseU,
    baseV + shift,
    0.92 - (presentation ? 0.08 * Math.sin(progress * Math.PI) : 0),
  );
  const neck = vec(
    baseU,
    pelvis.v - 0.06 - (presentation ? 0.12 * progress : 0),
    pelvis.z + 0.56,
  );
  const shoulderL = vec(baseU - 0.2, neck.v, neck.z - 0.02);
  const shoulderR = vec(baseU + 0.2, neck.v, neck.z - 0.02);
  const grip = key.grip;
  const elbow = (s: Vec3) =>
    vec(
      (s.u + grip.u) / 2,
      (s.v + grip.v) / 2 - 0.1,
      (s.z + grip.z) / 2 - 0.08,
    );
  const foot = (u: number, advance: number) =>
    vec(baseU + u, baseV - 0.05 + advance + (shift < 0 ? shift * 0.6 : 0), 0);
  const footL = foot(-0.2, 0);
  const footR = foot(0.2, 0);
  const knee = (f: Vec3) => vec(f.u, lerp(f.v, pelvis.v, 0.5) - 0.03, 0.46);
  return {
    joints: {
      head: vec(neck.u, neck.v - 0.03, neck.z + 0.22),
      neck,
      pelvis,
      shoulderL,
      shoulderR,
      elbowL: elbow(shoulderL),
      elbowR: elbow(shoulderR),
      grip,
      kneeL: knee(footL),
      kneeR: knee(footR),
      footL,
      footR,
    },
    batGrip: grip,
    batTip: key.tip,
    swinging,
  };
}
export { BAT_LENGTH };
