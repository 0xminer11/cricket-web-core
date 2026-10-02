/**
 * All tunable PRESENTATION constants for the match scene. None of these touch the cricket result:
 * the engine decides where the ball pitches, how fast and how it moves; these only say how big the
 * pitch is drawn, how slowly we replay the flight and where the camera stands.
 *
 * World units are metres. Axes: u = across the pitch (+ is the viewer's right), v = along the
 * pitch (0 at the bowler's stumps, PITCH.length at the batter's stumps), z = up.
 */
export const PITCH = {
  length: 20.12,
  width: 3.05,
  stumpHeight: 0.711,
  stumpSpread: 0.2286,
  /** Distance from the batter's stumps to the popping crease. */
  poppingCrease: 1.22,
  /** Where the batter stands along the pitch (v). */
  batterV: 19.35,
  /** The plane (v) where bat meets ball / the ball passes the batter. */
  contactV: 19.0,
} as const;

/**
 * Mapping between the engine's normalized target and metres. y = 0 (yorker) lies at the batter's
 * crease and y = 1 (bouncer) is `lengthSpan` metres in front of it; x = 0.5 is the middle stump and
 * the full 0..1 range spans `lineSpan` metres, so wide-off and wide-leg sit beyond the stumps.
 */
export const TARGETING = {
  lineSpan: 3.2,
  lengthSpan: 12,
  /** y = 0 sits at the popping crease (a yorker lands at the toes); this is metres from the stumps. */
  yorkerOffset: 1.22,
} as const;

/** Presentation time scaling: the engine's m/s is real; replaying it 1:1 would be unplayable. */
export const FLIGHT = {
  /** Real flight time is multiplied by this. Pace differences between bowlers are preserved. */
  visualSlowdown: 2.4,
  gravity: 9.81,
  releaseHeight: 2.15,
  /** Metres past the bowler's crease where the arm releases. */
  releaseAhead: 0.35,
  /** Height (m) the ball reaches the batter at, given bounce 0..1: low + bounce * span. */
  arrivalLow: 0.18,
  arrivalSpan: 1.25,
  /** Peak height after the pitch, scaled from bounce. */
  apexLow: 0.2,
  apexSpan: 1.1,
  /** Lateral metres per unit of engine swing/seam/spin magnitude (visual exaggeration, clamped). */
  swingMetres: 1.4,
  seamMetres: 1.0,
  spinMetres: 1.6,
  maxLateralMetres: 0.9,
  /** Horizontal speed retained after the ball pitches. */
  postBounceSpeed: 0.82,
  /** Ball radius in metres, enlarged slightly for legibility. */
  ballRadius: 0.075,
} as const;

export interface RunUpSpec {
  readonly distance: number;
  readonly duration: number;
  readonly strideRate: number;
}
/** Bowler action timing by kind. Durations are seconds; reduced motion shortens, never skips. */
export const RUN_UP: Record<'fast' | 'medium' | 'spin', RunUpSpec> = {
  fast: { distance: 6, duration: 1.4, strideRate: 3.2 },
  medium: { distance: 4.2, duration: 1.1, strideRate: 2.8 },
  spin: { distance: 2.2, duration: 0.8, strideRate: 2.2 },
};

export const SEQUENCE = {
  /** Seconds the batter's swing begins before the ball arrives (AI reaction lead). */
  batterLead: 0.34,
  resultHold: 1.35,
  resultHoldReduced: 0.7,
  resetBlend: 0.5,
  /** Seconds the ball is held at the release marker while waiting for the server. */
  releaseHoldMax: 8,
} as const;

export const BATTER = {
  /** Batter stands slightly to the leg side of middle stump, in metres. */
  guardOffset: 0.12,
  height: 1.78,
} as const;

export const CAMERA_DEFAULT = {
  fov: 34,
} as const;

/** How far and how long (visual seconds) the ball travels after the bat, by presented result. */
export const RESULT_FLIGHT = {
  defence: { distance: 3, duration: 0.8, apex: 0.05 },
  dot: { distance: 8, duration: 1.1, apex: 0.1 },
  run1: { distance: 26, duration: 1.7, apex: 0.15 },
  run2: { distance: 40, duration: 2.0, apex: 0.2 },
  run3: { distance: 54, duration: 2.3, apex: 0.2 },
  four: { distance: 68, duration: 2.1, apex: 0.12 },
  six: { distance: 76, duration: 2.6, apex: 14 },
  edge: { distance: 12, duration: 1.0, apex: 0.4 },
  edgeFour: { distance: 62, duration: 1.9, apex: 0.1 },
  caught: { distance: 30, duration: 2.0, apex: 12 },
  keeper: { distance: 5, duration: 1.0, apex: 0.3 },
  lbw: { distance: 1.5, duration: 0.7, apex: 0.1 },
  stumps: { distance: 3.5, duration: 1.1, apex: 0.2 },
} as const;
