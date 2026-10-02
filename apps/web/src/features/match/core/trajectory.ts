import type {
  DeliveryOutcomeDto,
  ResolvedDeliveryDto,
  ResolvedShotDto,
} from '@the-cricketer/shared-types';
import { FLIGHT, PITCH, RESULT_FLIGHT } from '../config/visual-config';
import { handSign, relativeToWorldU, targetToWorld } from './coordinates';
import type { BattingHand } from './coordinates';
import { clamp, lerp, lerp3, vec } from './vec';
import type { Vec3 } from './vec';

/**
 * Ball-flight planner. It is a PRESENTATION function: it draws the path the engine already decided.
 * It never changes a number the engine returned: the ball pitches at the engine's actual target, at
 * a time derived from the engine's speed, bending by the engine's swing/seam/spin and bouncing by
 * the engine's bounce. The result only decides which kind of exit path is drawn after the bat.
 */
export type OutcomeKind =
  | 'bowled'
  | 'lbw'
  | 'caught'
  | 'wide'
  | 'miss'
  | 'edge'
  | 'defence'
  | 'ground'
  | 'boundary'
  | 'six';

export function classifyOutcome(
  shot: ResolvedShotDto,
  outcome: DeliveryOutcomeDto,
): OutcomeKind {
  if (outcome.wicketType === 'lbw') return 'lbw';
  if (outcome.wicketType === 'caught') return 'caught';
  if (outcome.wicketType) return 'bowled';
  if (outcome.extraType === 'wide') return 'wide';
  if (shot.contactQuality === 'miss') return 'miss';
  if (outcome.runsOffBat === 6) return 'six';
  if (shot.contactQuality === 'edge') return 'edge';
  if (outcome.runsOffBat === 4) return 'boundary';
  if (shot.category === 'defensive') return 'defence';
  return 'ground';
}

export type SegmentKind = 'pre_bounce' | 'post_bounce' | 'exit' | 'hold';

export interface Segment {
  readonly kind: SegmentKind;
  readonly start: number;
  readonly end: number;
  readonly at: (s: number) => Vec3;
}

export interface TrajectoryEvent {
  readonly type:
    | 'BALL_RELEASE'
    | 'BALL_PITCH'
    | 'BALL_NEAR_BATTER'
    | 'CONTACT_PRESENTATION'
    | 'BALL_SETTLED';
  readonly time: number;
}

export interface TrajectoryPlan {
  readonly kind: OutcomeKind;
  readonly release: Vec3;
  /** Exactly the engine's actual target mapped to the pitch plane. */
  readonly pitchPoint: Vec3;
  /** Where the ball meets the bat (or the stumps / pads / keeper's line). */
  readonly arrival: Vec3;
  readonly segments: readonly Segment[];
  readonly events: readonly TrajectoryEvent[];
  /** Time (visual seconds) from release to the ball reaching the batter. */
  readonly flightTime: number;
  readonly duration: number;
  /** Seconds from release at which the ball hits the ground. */
  readonly pitchTime: number;
  readonly speedKmh: number;
}

/** Lateral metres for an engine movement magnitude, clamped so it never looks exaggerated. */
export const lateralMetres = (magnitude: number, perUnit: number): number =>
  Math.max(
    -FLIGHT.maxLateralMetres,
    Math.min(FLIGHT.maxLateralMetres, magnitude * perUnit),
  );

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Ball position at plan time t (seconds since release). Holds the last point after the plan ends. */
export function ballAt(plan: TrajectoryPlan, t: number): Vec3 {
  const time = Math.max(0, t);
  const last = plan.segments.at(-1)!;
  if (time >= last.end) return last.at(1);
  const segment = plan.segments.find((s) => time < s.end) ?? last;
  const span = Math.max(1e-6, segment.end - segment.start);
  return segment.at(clamp((time - segment.start) / span));
}

export interface PlanInput {
  readonly delivery: ResolvedDeliveryDto;
  readonly shot: ResolvedShotDto;
  readonly outcome: DeliveryOutcomeDto;
  readonly release: Vec3;
  readonly hand: BattingHand;
}

export interface IncomingInput {
  readonly delivery: ResolvedDeliveryDto;
  readonly release: Vec3;
  readonly hand: BattingHand;
}

/** The ball from the bowler's hand to the batter: release -> the engine's pitch point -> the contact plane. */
export interface IncomingPlan {
  readonly release: Vec3;
  /** Exactly the engine's actual target mapped to the pitch plane. */
  readonly pitchPoint: Vec3;
  /** Where the ball reaches the contact plane (before any presentation nudge). */
  readonly arrival: Vec3;
  /** Seconds (presentation) from release to the pitch, and from the pitch to the batter. */
  readonly pitchTime: number;
  readonly flightTime: number;
  /** Position for a time in 0..flightTime. */
  readonly at: (t: number) => Vec3;
  readonly speedKmh: number;
}

/** The delivery's natural arrival point at the contact plane, from the engine's pitch point, seam/spin and bounce. */
export function defaultArrival(
  delivery: ResolvedDeliveryDto,
  hand: BattingHand,
): Vec3 {
  const pitchPoint = targetToWorld(delivery.actual.target, hand);
  const deviation = relativeToWorldU(
    lateralMetres(delivery.movement.seam, FLIGHT.seamMetres) +
      lateralMetres(delivery.movement.spin, FLIGHT.spinMetres),
    hand,
  );
  const afterV = Math.max(0.05, PITCH.contactV - pitchPoint.v);
  const bounce = clamp(delivery.bounce);
  const arrivalZ = clamp(
    FLIGHT.arrivalLow +
      FLIGHT.arrivalSpan * bounce * clamp(afterV / 6, 0.12, 1),
    0.08,
    1.9,
  );
  return vec(pitchPoint.u + deviation, PITCH.contactV, arrivalZ);
}

/**
 * Plan the ball up to the batter. `arrivalOverride` lets the bowling scene end a ball at the stumps or the
 * pads; a batting scene leaves it empty (the outcome is not known yet) and continues the ball afterwards.
 */
export function planIncoming(
  input: IncomingInput,
  arrivalOverride: Vec3 | null = null,
): IncomingPlan {
  const { delivery, release, hand } = input;
  const pitchPoint = targetToWorld(delivery.actual.target, hand);
  const speed = Math.max(8, delivery.speedMs);
  const arrival = arrivalOverride ?? defaultArrival(delivery, hand);

  // ---- pre-bounce: release -> the engine's actual pitch point -----------------------------------
  const realPre = Math.max(0.12, (pitchPoint.v - release.v) / speed);
  const pre = realPre * FLIGHT.visualSlowdown;
  const swingWorld = relativeToWorldU(
    lateralMetres(delivery.movement.swing, FLIGHT.swingMetres),
    hand,
  );
  const preAt = (s: number): Vec3 => {
    // Aim to the opposite side, then curl onto the target: swing grows late and the ball still lands
    // exactly on the engine's target.
    const u =
      lerp(release.u, pitchPoint.u - swingWorld, s) + swingWorld * s * s;
    const v = lerp(release.v, pitchPoint.v, s);
    // ballistic drop under gravity over the REAL flight time, so a slow ball loops and a fast one is flat
    const z =
      (1 - s) * (release.z + 0.5 * FLIGHT.gravity * realPre * realPre * s);
    return vec(u, v, Math.max(0, z));
  };

  // ---- post-bounce: pitch point -> batter, with the engine's bounce -------------------------------
  const bounce = clamp(delivery.bounce);
  const apex = FLIGHT.apexLow + FLIGHT.apexSpan * bounce;
  const postDuration = Math.max(
    0.1,
    ((arrival.v - pitchPoint.v) / (speed * FLIGHT.postBounceSpeed)) *
      FLIGHT.visualSlowdown,
  );
  const postAt = (s: number): Vec3 => {
    const z =
      arrival.z * s + 4 * Math.max(0, apex - arrival.z / 2) * s * (1 - s);
    // movement off the pitch shows late: ease the lateral deviation in
    const u = lerp(pitchPoint.u, arrival.u, s * (0.4 + 0.6 * s));
    return vec(u, lerp(pitchPoint.v, arrival.v, s), Math.max(0, z));
  };
  const flightTime = pre + postDuration;
  return {
    release,
    pitchPoint,
    arrival,
    pitchTime: pre,
    flightTime,
    speedKmh: delivery.speedKmh,
    at: (t) =>
      t <= 0
        ? preAt(0)
        : t < pre
          ? preAt(t / pre)
          : t < flightTime
            ? postAt((t - pre) / postDuration)
            : postAt(1),
  };
}

export function planTrajectory(input: PlanInput): TrajectoryPlan {
  const { delivery, shot, outcome, hand } = input;
  const kind = classifyOutcome(shot, outcome);
  const base = defaultArrival(delivery, hand);
  // The ball ends at the bat, or at the stumps / pads when the engine says it was bowled / lbw.
  let override: Vec3 | null = null;
  if (kind === 'bowled')
    override = vec(
      (base.u - targetToWorld(delivery.actual.target, hand).u) * 0.2,
      PITCH.length,
      PITCH.stumpHeight / 2,
    );
  if (kind === 'lbw')
    override = vec(lerp(base.u, 0, 0.7), PITCH.contactV + 0.05, 0.42);
  const incoming = planIncoming(
    { delivery, release: input.release, hand },
    override,
  );
  const exit = planExit(kind, incoming.arrival, shot, outcome, hand, delivery);
  const segments: Segment[] = [
    {
      kind: 'pre_bounce',
      start: 0,
      end: incoming.pitchTime,
      at: (s) => incoming.at(s * incoming.pitchTime),
    },
    {
      kind: 'post_bounce',
      start: incoming.pitchTime,
      end: incoming.flightTime,
      at: (s) =>
        incoming.at(
          incoming.pitchTime + s * (incoming.flightTime - incoming.pitchTime),
        ),
    },
    {
      kind: 'exit',
      start: incoming.flightTime,
      end: incoming.flightTime + exit.duration,
      at: exit.at,
    },
  ];
  const duration = incoming.flightTime + exit.duration;
  return {
    kind,
    release: input.release,
    pitchPoint: incoming.pitchPoint,
    arrival: incoming.arrival,
    segments,
    events: [
      { type: 'BALL_RELEASE', time: 0 },
      { type: 'BALL_PITCH', time: incoming.pitchTime },
      { type: 'BALL_NEAR_BATTER', time: incoming.flightTime },
      { type: 'CONTACT_PRESENTATION', time: incoming.flightTime },
      { type: 'BALL_SETTLED', time: duration },
    ],
    flightTime: incoming.flightTime,
    duration,
    pitchTime: incoming.pitchTime,
    speedKmh: delivery.speedKmh,
  };
}

export interface Exit {
  readonly duration: number;
  readonly at: (s: number) => Vec3;
}

/** Direction on the ground for a degree angle where 0 is straight back toward the bowler. */
const groundDirection = (
  degrees: number,
): { readonly u: number; readonly v: number } => ({
  // positive degrees is the batter's right-hand side, which is the viewer's LEFT (negative u)
  u: -Math.sin(toRad(degrees)),
  v: -Math.cos(toRad(degrees)),
});

/** Where the ball goes after the bat (or past it), from the point where it left the incoming path. */
export function planExit(
  kind: OutcomeKind,
  from: Vec3,
  shot: ResolvedShotDto,
  outcome: DeliveryOutcomeDto,
  hand: BattingHand,
  delivery: ResolvedDeliveryDto,
): Exit {
  const dir = groundDirection(shot.worldDirection);
  const along = (
    spec: { distance: number; duration: number; apex: number },
    direction: { u: number; v: number },
    ease = 0.7,
  ): Exit => {
    const end = vec(
      from.u + direction.u * spec.distance,
      from.v + direction.v * spec.distance,
      0,
    );
    return {
      duration: spec.duration,
      at: (s) => {
        // decelerates as it travels; lofted shots carry a high arc
        const t = 1 - (1 - s) ** (1 + ease);
        const p = lerp3(from, end, t);
        const z =
          from.z * (1 - Math.min(1, s * 3)) + 4 * spec.apex * s * (1 - s);
        return vec(p.u, p.v, Math.max(0, z));
      },
    };
  };
  switch (kind) {
    case 'six':
      return along(RESULT_FLIGHT.six, dir, 0.3);
    case 'boundary':
      return along(RESULT_FLIGHT.four, dir, 0.55);
    case 'caught': {
      const spec = RESULT_FLIGHT.caught;
      const end = vec(
        from.u + dir.u * spec.distance,
        from.v + dir.v * spec.distance,
        1.1,
      );
      return {
        duration: spec.duration,
        at: (s) => {
          const p = lerp3(from, end, s);
          return vec(p.u, p.v, p.z + 4 * spec.apex * s * (1 - s) * 0.45);
        },
      };
    }
    case 'defence':
      return along(RESULT_FLIGHT.defence, dir, 1.2);
    case 'edge': {
      // a glance toward the wicketkeeper's side: behind the batter, on the off side
      const behind = { u: -handSign(hand) * 0.55, v: 0.83 };
      if (outcome.runsOffBat >= 4) {
        const wide = { u: -handSign(hand) * 0.45, v: -0.9 };
        return along(RESULT_FLIGHT.edgeFour, wide, 0.4);
      }
      return along(RESULT_FLIGHT.edge, behind, 0.9);
    }
    case 'miss':
    case 'wide': {
      // beyond the bat to the keeper: continues down the line it was travelling
      const lateral = relativeToWorldU(
        delivery.movement.seam + delivery.movement.spin,
        hand,
      );
      return along(
        RESULT_FLIGHT.keeper,
        { u: Math.max(-0.4, Math.min(0.4, lateral * 0.5)), v: 1 },
        0.8,
      );
    }
    case 'bowled':
      return along(RESULT_FLIGHT.stumps, { u: 0, v: 1 }, 1.0);
    case 'lbw':
      return along(RESULT_FLIGHT.lbw, { u: 0, v: -1 }, 1.2);
    case 'ground': {
      const runs = outcome.runsOffBat;
      const spec =
        runs === 0
          ? RESULT_FLIGHT.dot
          : runs === 1
            ? RESULT_FLIGHT.run1
            : runs === 2
              ? RESULT_FLIGHT.run2
              : RESULT_FLIGHT.run3;
      return along(spec, dir, 0.8);
    }
  }
}
