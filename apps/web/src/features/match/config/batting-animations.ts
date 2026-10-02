import { SHOTS } from '@the-cricketer/game-core';
import type { DeliveryLength, DeliveryLine } from '@the-cricketer/game-core';

/**
 * Per-shot animation metadata (Module 10). Gameplay never mentions a file: it asks for a shot id and
 * gets a definition that says how long the clip is, WHEN the bat meets the ball inside it, how long
 * it takes to recover and where the bat is at that frame. New art is added by adding a definition (and
 * an asset id); no gameplay code changes. All shots here are TEMPORARY PLACEHOLDER procedural clips.
 *
 * Frame of reference: a RIGHT-HANDED batter's own frame, in metres from the middle of his stance.
 * `off` is toward the off side, `height` is up. The forward distance to the contact plane is the same for
 * every shot (`CONTACT_FORWARD`): the feet and body travel so the bat is there.
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

export interface BattingAnimationDefinition {
  readonly shotId: string;
  readonly animationId: string;
  readonly clipClass: ShotClip;
  readonly stanceType: 'front_foot' | 'back_foot';
  readonly preferredFoot: 'front' | 'back' | 'either';
  /** Whole clip, seconds (swing and follow-through; recovery is separate). */
  readonly duration: number;
  /** When the bat meets the ball, as a fraction of `duration`. NOT a timeout: the clip is driven to this frame. */
  readonly contactNormalizedTime: number;
  /** Seconds to settle back into the stance after the clip. */
  readonly recoveryTime: number;
  readonly compatibleLines: readonly DeliveryLine[];
  readonly compatibleLengths: readonly DeliveryLength[];
  /** `mirror`: one clip for both hands, mirrored across the batter's own axis. `dedicated`: a clip per hand. */
  readonly handednessMode: 'mirror' | 'dedicated';
  /** Where the sweet spot is at the contact frame. */
  readonly idealContact: { readonly off: number; readonly height: number };
  /** How far the shot can reasonably reach (footwork extends it a little). */
  readonly reach: {
    readonly off: readonly [number, number];
    readonly height: readonly [number, number];
  };
  /** Metres the front foot (or back foot) travels during the shot. */
  readonly footStep: number;
}

/** Metres from the stance to the plane where bat meets ball. */
export const CONTACT_FORWARD = 0.35;

interface Spec {
  clipClass: ShotClip;
  stance: 'front_foot' | 'back_foot';
  duration: number;
  contact: number;
  recovery: number;
  off: number;
  height: number;
  reachOff: readonly [number, number];
  reachHeight: readonly [number, number];
  step: number;
}

const SPECS: Readonly<Record<string, Spec>> = {
  'shot.forward_defensive': {
    clipClass: 'defend_front',
    stance: 'front_foot',
    duration: 0.95,
    contact: 0.38,
    recovery: 0.35,
    off: 0.03,
    height: 0.5,
    reachOff: [-0.3, 0.7],
    reachHeight: [0.15, 0.85],
    step: 0.32,
  },
  'shot.back_foot_defensive': {
    clipClass: 'defend_back',
    stance: 'back_foot',
    duration: 0.9,
    contact: 0.4,
    recovery: 0.3,
    off: 0.25,
    height: 0.82,
    reachOff: [-0.3, 0.7],
    reachHeight: [0.3, 1.2],
    step: 0.18,
  },
  'shot.straight_drive': {
    clipClass: 'drive',
    stance: 'front_foot',
    duration: 1.05,
    contact: 0.42,
    recovery: 0.4,
    off: 0.03,
    height: 0.45,
    reachOff: [-0.35, 0.55],
    reachHeight: [0.15, 0.95],
    step: 0.36,
  },
  'shot.cover_drive': {
    clipClass: 'drive',
    stance: 'front_foot',
    duration: 1.1,
    contact: 0.42,
    recovery: 0.4,
    off: 0.48,
    height: 0.55,
    reachOff: [0.1, 1.0],
    reachHeight: [0.15, 0.95],
    step: 0.4,
  },
  'shot.on_drive': {
    clipClass: 'drive',
    stance: 'front_foot',
    duration: 1.1,
    contact: 0.42,
    recovery: 0.4,
    off: -0.35,
    height: 0.45,
    reachOff: [-0.7, 0.2],
    reachHeight: [0.15, 0.95],
    step: 0.36,
  },
  'shot.flick': {
    clipClass: 'flick',
    stance: 'front_foot',
    duration: 1.0,
    contact: 0.42,
    recovery: 0.38,
    off: -0.35,
    height: 0.58,
    reachOff: [-0.95, 0.0],
    reachHeight: [0.2, 0.95],
    step: 0.3,
  },
  'shot.cut': {
    clipClass: 'cut',
    stance: 'back_foot',
    duration: 1.0,
    contact: 0.42,
    recovery: 0.38,
    off: 0.7,
    height: 1.05,
    reachOff: [0.25, 1.1],
    reachHeight: [0.5, 1.3],
    step: 0.2,
  },
  'shot.pull': {
    clipClass: 'pull',
    stance: 'back_foot',
    duration: 1.05,
    contact: 0.42,
    recovery: 0.4,
    off: -0.15,
    height: 1.2,
    reachOff: [-0.9, 0.2],
    reachHeight: [0.6, 1.5],
    step: 0.2,
  },
  'shot.hook': {
    clipClass: 'hook',
    stance: 'back_foot',
    duration: 1.05,
    contact: 0.42,
    recovery: 0.4,
    off: -0.15,
    height: 1.4,
    reachOff: [-0.8, 0.3],
    reachHeight: [0.9, 1.7],
    step: 0.18,
  },
  'shot.lofted_straight': {
    clipClass: 'loft',
    stance: 'front_foot',
    duration: 1.2,
    contact: 0.44,
    recovery: 0.45,
    off: 0.03,
    height: 0.58,
    reachOff: [-0.3, 0.5],
    reachHeight: [0.2, 1.0],
    step: 0.38,
  },
  'shot.lofted_off_side': {
    clipClass: 'loft',
    stance: 'front_foot',
    duration: 1.2,
    contact: 0.44,
    recovery: 0.45,
    off: 0.48,
    height: 0.58,
    reachOff: [0.1, 1.0],
    reachHeight: [0.2, 1.0],
    step: 0.4,
  },
  'shot.lofted_leg_side': {
    clipClass: 'loft',
    stance: 'front_foot',
    duration: 1.2,
    contact: 0.44,
    recovery: 0.45,
    off: -0.38,
    height: 0.58,
    reachOff: [-0.95, 0.1],
    reachHeight: [0.2, 1.0],
    step: 0.38,
  },
};

/** Every Module 0 shot with its animation metadata, built once from the shot config and the specs above. */
export const BATTING_ANIMATIONS: readonly BattingAnimationDefinition[] =
  SHOTS.map((shot) => {
    const spec = SPECS[shot.id]!;
    return {
      shotId: shot.id,
      animationId: `bat.${shot.id.replace('shot.', '')}`,
      clipClass: spec.clipClass,
      stanceType: spec.stance,
      preferredFoot:
        shot.preferredFoot === 'front' || shot.preferredFoot === 'back'
          ? shot.preferredFoot
          : 'either',
      duration: spec.duration,
      contactNormalizedTime: spec.contact,
      recoveryTime: spec.recovery,
      compatibleLines: shot.idealLines,
      compatibleLengths: shot.idealLengths,
      handednessMode: 'mirror' as const,
      idealContact: { off: spec.off, height: spec.height },
      reach: { off: spec.reachOff, height: spec.reachHeight },
      footStep: spec.step,
    };
  });

export const BATTING_ANIMATION_BY_SHOT: ReadonlyMap<
  string,
  BattingAnimationDefinition
> = new Map(BATTING_ANIMATIONS.map((d) => [d.shotId, d]));

/** The asset id a shot's clip is registered under (what a failed load is reported as). */
export const battingClipId = (shotId: string): string =>
  `batting.${shotId.replace('shot.', '')}`;

/** The generic clip each family falls back to when its own clip is unavailable. */
const FALLBACK_SHOT: Readonly<Record<ShotClip, string>> = {
  defend_front: 'shot.forward_defensive',
  defend_back: 'shot.back_foot_defensive',
  drive: 'shot.straight_drive',
  flick: 'shot.flick',
  cut: 'shot.cut',
  pull: 'shot.pull',
  hook: 'shot.hook',
  loft: 'shot.lofted_straight',
};
export const GENERIC_SWING = 'shot.straight_drive';

export interface ResolvedShotAnimation {
  /** The clip that will actually play (its shot id; the ENGINE's shot is unchanged). */
  readonly animShotId: string;
  readonly fallback: boolean;
  /** Every batting clip was unavailable: the minimal procedural swing plays. */
  readonly minimal: boolean;
}

/**
 * Pick the clip to play for a shot. If its own clip failed to load, use its family's generic clip, then the
 * forward defensive, then the minimal procedural swing; the match is always playable and the shot the engine
 * resolved never changes.
 */
export function resolveShotAnimation(
  shotId: string,
  unavailable: ReadonlySet<string> = new Set(),
): ResolvedShotAnimation {
  const ok = (id: string) =>
    BATTING_ANIMATION_BY_SHOT.has(id) && !unavailable.has(battingClipId(id));
  if (ok(shotId))
    return { animShotId: shotId, fallback: false, minimal: false };
  const family = BATTING_ANIMATION_BY_SHOT.get(shotId)?.clipClass;
  const candidates = [
    family ? FALLBACK_SHOT[family] : null,
    'shot.forward_defensive',
    GENERIC_SWING,
  ].filter((id): id is string => id !== null);
  for (const id of candidates)
    if (ok(id)) return { animShotId: id, fallback: true, minimal: false };
  return { animShotId: GENERIC_SWING, fallback: true, minimal: true };
}

/** Seconds from the start of a shot's clip to the contact frame at normal speed. */
export const timeToContact = (d: BattingAnimationDefinition): number =>
  d.duration * d.contactNormalizedTime;

/**
 * Contact assist limits (Module 10 section 5). These are deliberately small: the original cricket shot
 * must stay recognizable. They are configuration, not hard-coded, so they can be tuned against real
 * animations in the batting lab.
 */
export interface BattingContactAssistConfig {
  /** Metres the whole body may shift forward or down (a lean or a crouch). */
  readonly maxRootOffset: number;
  /**
   * Metres the whole body may step sideways toward the line of the ball: footwork, scaled by the batter's
   * Footwork. The engine lets a ball well outside off still be met, so the batter must be able to go there.
   */
  readonly maxRootStride: number;
  /** Metres the body may sink (knees bending to get under a low ball) or rise onto the toes. */
  readonly maxRootDrop: number;
  readonly maxHipYaw: number;
  readonly maxShoulderYaw: number;
  readonly maxUpperBodyPitch: number;
  readonly maxBatRotation: number;
  /** Playback speed may be warped by +/- this fraction to line the contact frame up with the ball. */
  readonly maxTimingWarp: number;
  /**
   * Presentation-only: how far (metres) the ball's visual contact point may be nudged toward the bat
   * when a good contact cannot be reached by the body alone. The engine's result is untouched.
   */
  readonly maxBallShift: number;
  /**
   * Used only when the shot cannot physically reach the ball (a pull to a ball well outside off): the
   * ball is nudged further rather than the body being twisted, and the contact plan is flagged `exceeded`.
   */
  readonly maxBallShiftReach: number;
}
export const CONTACT_ASSIST: BattingContactAssistConfig = {
  maxRootOffset: 0.12,
  maxRootStride: 0.5,
  maxRootDrop: 0.3,
  maxHipYaw: 0.3,
  maxShoulderYaw: 0.3,
  maxUpperBodyPitch: 0.12,
  maxBatRotation: 0.3,
  maxTimingWarp: 0.1,
  maxBallShift: 0.14,
  maxBallShiftReach: 0.4,
};

/**
 * How much of the body's correction budget each contact quality may use. Every real contact must visibly
 * meet the bat, so contact qualities keep (almost) the full budget; they differ in HOW CLEANLY the ball
 * meets the bat (the mis-centring below), not in whether it does. A miss gets none.
 */
export const ASSIST_BY_QUALITY: Readonly<Record<string, number>> = {
  perfect: 1,
  good: 1,
  okay: 1,
  poor: 0.85,
  edge: 1,
  miss: 0,
};

/** Metres from the sweet spot where the ball lands: the toe or the splice for a poor hit. */
export const MISCENTRE: Readonly<Record<string, number>> = {
  perfect: 0,
  good: 0.015,
  okay: 0.05,
  poor: 0.09,
};
