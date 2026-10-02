import {
  ASSIST_BY_QUALITY,
  BATTING_ANIMATION_BY_SHOT,
  CONTACT_ASSIST,
  MISCENTRE,
  timeToContact,
} from '../config/batting-animations';
import type { BattingContactAssistConfig } from '../config/batting-animations';
import {
  EDGE_HALF_WIDTH,
  NO_ADJUST,
  contactSweetSpotRel,
  relToWorld,
  worldToRel,
} from './batting-rig';
import type { BattingPoseAdjust, Rel } from './batting-rig';
import type { BattingHand } from './coordinates';
import { clamp } from './vec';
import type { Vec3 } from './vec';

export type ContactQuality =
  'perfect' | 'good' | 'okay' | 'poor' | 'edge' | 'miss';

export type MissMode = 'over' | 'under' | 'inside' | 'outside';
export type EdgeSide = 'inside' | 'outside';

export interface ContactInput {
  readonly shotId: string;
  readonly hand: BattingHand;
  /** Where the engine's incoming ball crosses the contact plane (world metres). */
  readonly ballPoint: Vec3;
  readonly quality: ContactQuality;
  /** The batter's Footwork rating (1..100): it stretches how far the body may correct. */
  readonly footwork?: number;
  /**
   * Seconds from the start of the swing until the ball reaches the contact plane. The clip's own time
   * to contact is compared with this to choose a (narrow) playback warp.
   */
  readonly secondsToBall: number;
  readonly config?: BattingContactAssistConfig;
}

export interface ContactPlan {
  readonly shotId: string;
  readonly quality: ContactQuality;
  /** The bat meets the ball (perfect..poor, edge); false for a miss. */
  readonly contactMade: boolean;
  readonly adjust: BattingPoseAdjust;
  /** Extra bat shift AT the contact frame: edge offset, mis-centering, or the daylight of a miss. */
  readonly contactShift: Rel;
  /** The ball's visual contact point after the (small, presentation-only) tolerance shift. */
  readonly ballPoint: Vec3;
  /** Metres the ball was nudged toward the bat; never more than `maxBallShift`. */
  readonly ballShift: number;
  /** Metres between the bat's sweet spot (or its edge) and the ball at contact, after everything. */
  readonly residual: number;
  /** The correction needed was more than the limits allow; the body was NOT distorted to cover it. */
  readonly exceeded: boolean;
  /** Playback speed so the contact frame lands on the ball (1 = untouched). */
  readonly timingWarp: number;
  readonly edge: EdgeSide | null;
  readonly missMode: MissMode | null;
  /** How the budget was spent, for the debug overlay. */
  readonly used: {
    readonly rootOff: number;
    readonly hipYaw: number;
    readonly shoulderYaw: number;
    readonly bat: number;
  };
}

const rel = (off: number, fwd: number, z: number): Rel => ({ off, fwd, z });
const sub = (a: Rel, b: Rel): Rel =>
  rel(a.off - b.off, a.fwd - b.fwd, a.z - b.z);
const len = (a: Rel): number => Math.hypot(a.off, a.fwd, a.z);

/**
 * A stable pseudo-random sign from the ball's place in the BATTER's own frame (so a left-hander gets the
 * mirror image of a right-hander's plan), so the same ball always meets the bat the same way.
 */
const signOf = (p: Rel, salt: number): 1 | -1 =>
  Math.sin(p.off * 12.9898 + p.z * 78.233 + salt) >= 0 ? 1 : -1;

type Dof = keyof BattingPoseAdjust;
const ORDER: readonly (readonly Dof[])[] = [
  ['batRotation'],
  ['shoulderYaw', 'hipYaw'],
  ['upperBodyPitch'],
  ['rootOff', 'rootFwd', 'rootDown'],
];

/**
 * BatBallContactPresenter. The engine has already decided the contact quality; this decides how to SHOW
 * it. Priority (section 57): correct animation, timing alignment, a small bat correction, a small shoulder
 * and hip correction, then a tiny root shift. It never distorts the clip to chase a bad delivery: if the
 * body cannot reach, it nudges the BALL by at most `maxBallShift` and otherwise reports `exceeded`.
 */
export function presentContact(input: ContactInput): ContactPlan {
  const config = input.config ?? CONTACT_ASSIST;
  const def = BATTING_ANIMATION_BY_SHOT.get(input.shotId);
  if (!def) throw new Error(`No batting animation for ${input.shotId}`);
  const hand = input.hand;
  const quality = input.quality;
  const weight = ASSIST_BY_QUALITY[quality] ?? 0;
  const ballRel = worldToRel(input.ballPoint, hand);
  const baseSweet = contactSweetSpotRel(def, NO_ADJUST);
  const contactMade = quality !== 'miss';

  // ---- where the bat is trying to be ---------------------------------------------------------------
  let target: Rel = ballRel;
  let contactShift: Rel = rel(0, 0, 0);
  let edge: EdgeSide | null = null;
  let missMode: MissMode | null = null;
  if (quality === 'edge') {
    // meet the ball with an edge: the bat sits half a blade-width to one side of the ball
    edge = ballRel.off >= baseSweet.off ? 'outside' : 'inside';
    target = rel(
      ballRel.off + (edge === 'outside' ? -EDGE_HALF_WIDTH : EDGE_HALF_WIDTH),
      ballRel.fwd,
      ballRel.z,
    );
  } else if (quality === 'okay' || quality === 'poor' || quality === 'good') {
    // visibly less clean: the ball finds the toe or the splice instead of the middle
    const miscentre = MISCENTRE[quality] ?? 0;
    target = rel(
      ballRel.off,
      ballRel.fwd,
      ballRel.z + signOf(ballRel, 1) * miscentre,
    );
  } else if (quality === 'miss') {
    // no correction at all: the bat goes where the shot goes and the ball is not there
    const high = ballRel.z > baseSweet.z + 0.08;
    missMode = high ? 'under' : 'over';
    const lateral = ballRel.off - baseSweet.off;
    if (Math.abs(lateral) > 0.18) missMode = lateral > 0 ? 'outside' : 'inside';
    // a ball that is higher than the bat's path is passed UNDER (the bat dips below it); a low one OVER
    contactShift = rel(
      missMode === 'outside' ? -0.22 : missMode === 'inside' ? 0.22 : 0,
      0,
      missMode === 'under' ? -0.32 : missMode === 'over' ? 0.3 : 0,
    );
  }

  // ---- the body's budget -----------------------------------------------------------------------------
  const footwork = clamp((input.footwork ?? 50) / 100);
  const cap: Record<Dof, number> = {
    rootOff: config.maxRootStride * weight * (0.7 + 0.6 * footwork),
    rootFwd: config.maxRootOffset * weight * (0.7 + 0.6 * footwork),
    rootDown: config.maxRootDrop * weight * (0.7 + 0.6 * footwork),
    hipYaw: config.maxHipYaw * weight,
    shoulderYaw: config.maxShoulderYaw * weight,
    upperBodyPitch: config.maxUpperBodyPitch * weight,
    batRotation: config.maxBatRotation * weight,
  };
  let adjust: BattingPoseAdjust = { ...NO_ADJUST };
  const sweetOf = (a: BattingPoseAdjust) => contactSweetSpotRel(def, a);
  const eps = 1e-3;
  if (weight > 0)
    for (let pass = 0; pass < 2; pass++)
      for (const group of ORDER)
        for (const dof of group) {
          const here = sweetOf(adjust);
          const residual = sub(target, here);
          if (len(residual) < 1e-4) continue;
          const probe = sweetOf({ ...adjust, [dof]: adjust[dof] + eps });
          const jac = rel(
            (probe.off - here.off) / eps,
            (probe.fwd - here.fwd) / eps,
            (probe.z - here.z) / eps,
          );
          const denom = jac.off ** 2 + jac.fwd ** 2 + jac.z ** 2;
          if (denom < 1e-9) continue;
          const step =
            (residual.off * jac.off +
              residual.fwd * jac.fwd +
              residual.z * jac.z) /
            denom;
          adjust = {
            ...adjust,
            [dof]: clamp(adjust[dof] + step, -cap[dof], cap[dof]),
          };
        }
  const reached = sweetOf(adjust);
  const needed = sub(target, reached);

  // ---- the small presentation-only nudge of the ball ------------------------------------------------------
  const ballCap = config.maxBallShift * weight;
  const reachCap = config.maxBallShiftReach * weight;
  const gap = len(needed);
  const nudge =
    gap === 0 ? 0 : Math.min(gap, gap > ballCap ? reachCap : ballCap);
  const k = gap === 0 ? 0 : nudge / gap;
  const ballRelFinal = rel(
    ballRel.off - needed.off * k,
    ballRel.fwd - needed.fwd * k,
    ballRel.z - needed.z * k,
  );
  const residual = contactMade
    ? Math.max(0, gap - nudge)
    : len(sub(reached, ballRel));
  // needing more than the normal tolerance means the shot was out of reach for this ball
  const exceeded = contactMade && gap > ballCap + 0.005;

  // ---- timing alignment -------------------------------------------------------------------------------
  const wanted = timeToContact(def) / Math.max(0.05, input.secondsToBall);
  const timingWarp = contactMade
    ? clamp(wanted, 1 - config.maxTimingWarp, 1 + config.maxTimingWarp)
    : 1;

  return {
    shotId: input.shotId,
    quality,
    contactMade,
    adjust,
    contactShift,
    ballPoint: contactMade ? relToWorld(ballRelFinal, hand) : input.ballPoint,
    ballShift: nudge,
    residual,
    exceeded,
    timingWarp,
    edge,
    missMode,
    used: {
      rootOff:
        Math.abs(adjust.rootOff) +
        Math.abs(adjust.rootFwd) +
        Math.abs(adjust.rootDown),
      hipYaw: Math.abs(adjust.hipYaw),
      shoulderYaw: Math.abs(adjust.shoulderYaw),
      bat: Math.abs(adjust.batRotation),
    },
  };
}

/** Does any correction exceed its configured limit? (Used by tests and the debug overlay.) */
export function withinLimits(
  adjust: BattingPoseAdjust,
  config: BattingContactAssistConfig = CONTACT_ASSIST,
): boolean {
  return (
    Math.abs(adjust.rootOff) <= config.maxRootStride * 1.3 + 1e-9 &&
    Math.abs(adjust.rootFwd) <= config.maxRootOffset * 1.3 + 1e-9 &&
    Math.abs(adjust.rootDown) <= config.maxRootDrop * 1.3 + 1e-9 &&
    Math.abs(adjust.hipYaw) <= config.maxHipYaw + 1e-9 &&
    Math.abs(adjust.shoulderYaw) <= config.maxShoulderYaw + 1e-9 &&
    Math.abs(adjust.upperBodyPitch) <= config.maxUpperBodyPitch + 1e-9 &&
    Math.abs(adjust.batRotation) <= config.maxBatRotation + 1e-9
  );
}
