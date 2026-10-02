import { PITCH } from '../config/visual-config';
import { project } from './coordinates';
import type { ViewParams, Viewport } from './coordinates';
import { clamp, lerp, smoothstep } from './vec';
import type { Vec3 } from './vec';

export type CameraState =
  | 'PreDelivery'
  | 'RunUp'
  | 'Release'
  | 'BallTracking'
  | 'Batter'
  | 'Result'
  // batting: the camera stands behind the batter
  | 'BowlerView'
  | 'BallApproach'
  | 'BatContact'
  | 'ShotFollow'
  | 'Wicket'
  | 'Reset';

/** Camera presets, tuned in the visual QA pass. v/u/z are metres in pitch space. */
export const CAMERA_PRESETS: Readonly<Record<CameraState, ViewParams>> = {
  // Aim view: steep and elevated so the length bands are tall enough to target, with the bowler at his crease.
  PreDelivery: {
    camV: -10,
    camH: 16,
    camU: 0,
    lookV: 7,
    lookU: 0,
    fov: 36,
    zoom: 1,
    centerY: 0.52,
  },
  // The bowler walks back and runs in: lower and further behind so the whole run-up is visible.
  RunUp: {
    camV: -20,
    camH: 8.5,
    camU: 0,
    lookV: 6,
    lookU: 0,
    fov: 34,
    zoom: 1,
    centerY: 0.56,
  },
  Release: {
    camV: -19,
    camH: 8,
    camU: 0,
    lookV: 7,
    lookU: 0,
    fov: 34,
    zoom: 1.02,
    centerY: 0.56,
  },
  BallTracking: {
    camV: -12,
    camH: 9,
    camU: 0,
    lookV: 12,
    lookU: 0,
    fov: 34,
    zoom: 1.05,
    centerY: 0.55,
  },
  Batter: {
    camV: -4,
    camH: 6,
    camU: 0,
    lookV: 16,
    lookU: 0,
    fov: 30,
    zoom: 1.2,
    centerY: 0.6,
  },
  // ---- batting (rotated: behind the batter, looking down the pitch at the bowler) ----------------------
  // BowlerView, BallApproach and BatContact share one framing on purpose: nothing may move the picture
  // while the player is timing the shot.
  BowlerView: {
    camV: -9,
    camH: 3.4,
    camU: 0.5,
    lookV: 13,
    lookU: 0,
    fov: 38,
    zoom: 1,
    centerY: 0.56,
    rotated: true,
  },
  BallApproach: {
    camV: -9,
    camH: 3.4,
    camU: 0.5,
    lookV: 13,
    lookU: 0,
    fov: 38,
    zoom: 1,
    centerY: 0.56,
    rotated: true,
  },
  BatContact: {
    camV: -9,
    camH: 3.4,
    camU: 0.5,
    lookV: 13,
    lookU: 0,
    fov: 38,
    zoom: 1,
    centerY: 0.56,
    rotated: true,
  },
  ShotFollow: {
    camV: -8,
    camH: 4.6,
    camU: 0.4,
    lookV: 15,
    lookU: 0,
    fov: 44,
    zoom: 0.96,
    centerY: 0.5,
    rotated: true,
  },
  // The stump camera: a cut to low behind the bowler's end, looking at the batter's stumps. Not rotated, so
  // switching to and from it is a cut (a half-turn cannot be blended).
  Wicket: {
    camV: 10,
    camH: 1.2,
    camU: 0.5,
    lookV: 20,
    lookU: 0,
    fov: 30,
    zoom: 1,
    centerY: 0.6,
  },
  Reset: {
    camV: -9,
    camH: 3.4,
    camU: 0.5,
    lookV: 13,
    lookU: 0,
    fov: 38,
    zoom: 1,
    centerY: 0.56,
    rotated: true,
  },
  Result: {
    camV: -14,
    camH: 12,
    camU: 0,
    lookV: 10,
    lookU: 0,
    fov: 40,
    zoom: 0.95,
    centerY: 0.52,
  },
};

const BLEND_SECONDS: Record<CameraState, number> = {
  BowlerView: 0.5,
  BallApproach: 0.4,
  BatContact: 0.2,
  ShotFollow: 0.7,
  Wicket: 0.5,
  Reset: 0.6,
  PreDelivery: 0.7,
  RunUp: 0.4,
  Release: 0.25,
  BallTracking: 0.55,
  Batter: 0.45,
  Result: 0.6,
};

const mixView = (a: ViewParams, b: ViewParams, t: number): ViewParams => ({
  rotated: (t < 0.5 ? a : b).rotated ?? false,
  camV: lerp(a.camV, b.camV, t),
  centerY: lerp(a.centerY ?? 0.5, b.centerY ?? 0.5, t),
  camH: lerp(a.camH, b.camH, t),
  camU: lerp(a.camU, b.camU, t),
  lookV: lerp(a.lookV, b.lookV, t),
  lookU: lerp(a.lookU, b.lookU, t),
  fov: lerp(a.fov, b.fov, t),
  zoom: lerp(a.zoom, b.zoom, t),
});

export interface CameraHints {
  /** Current ball position, used lightly while tracking. */
  readonly ball?: Vec3 | null;
}

/**
 * Chooses where the camera stands for each part of a delivery and blends between them. It is a
 * pure function of time and state (no Phaser), which is what lets the tests prove the bowler, the
 * ball and the target marker stay inside the frame at every supported viewport. Reduced motion
 * keeps the camera on one still shot.
 */
export class MatchCameraController {
  private state: CameraState = 'PreDelivery';
  private from: ViewParams = CAMERA_PRESETS.PreDelivery;
  private current: ViewParams = CAMERA_PRESETS.PreDelivery;
  private elapsed = 0;
  private blend = 0;
  /**
   * `rest` is the one shot a reduced-motion player always gets: PreDelivery when bowling (aiming) and
   * BowlerView when batting.
   */
  constructor(
    private readonly reducedMotion = false,
    private readonly rest: CameraState = 'PreDelivery',
  ) {}
  get cameraState(): CameraState {
    return this.state;
  }
  get view(): ViewParams {
    return this.current;
  }
  setState(next: CameraState): void {
    if (next === this.state) return;
    this.state = next;
    this.from = this.current;
    this.elapsed = 0;
    const turns =
      (CAMERA_PRESETS[next].rotated ?? false) !== (this.from.rotated ?? false);
    this.blend = this.reducedMotion || turns ? 0 : BLEND_SECONDS[next];
  }
  /** Snap immediately (used on resync and when the scene is first shown). */
  snapTo(next: CameraState): void {
    this.state = next;
    this.from = CAMERA_PRESETS[next];
    this.current = CAMERA_PRESETS[next];
    this.elapsed = 0;
    this.blend = 0;
  }
  update(dt: number, hints: CameraHints = {}): ViewParams {
    const target = this.reducedMotion
      ? CAMERA_PRESETS[this.rest]
      : CAMERA_PRESETS[this.state];
    this.elapsed += Math.max(0, dt);
    const t = this.blend <= 0 ? 1 : smoothstep(this.elapsed / this.blend);
    let view = mixView(this.from, target, t);
    if (!this.reducedMotion && this.state === 'BallTracking' && hints.ball) {
      // drift the look point toward the ball without letting it run away from the pitch
      const follow = clamp((hints.ball.v - 4) / (PITCH.length - 4));
      view = { ...view, lookV: lerp(view.lookV, 8 + follow * 12, 0.6) };
    }
    if (!this.reducedMotion && this.state === 'ShotFollow' && hints.ball) {
      // watch the ball go: the look point and the height follow it down the ground, never past a sensible limit
      const away = clamp((PITCH.length - hints.ball.v - 2) / 40);
      view = {
        ...view,
        lookV: lerp(view.lookV, 13 + away * 26, 0.6),
        camH: lerp(view.camH, view.camH + 2.2, away),
        fov: lerp(view.fov, view.fov + 4, away),
      };
    }
    this.current = view;
    return view;
  }
}

/** True when every point is on screen with `margin` pixels to spare. */
export function framesAll(
  points: readonly Vec3[],
  view: ViewParams,
  viewport: Viewport,
  margin = 6,
): boolean {
  return points.every((p) => {
    const s = project(p, view, viewport);
    return (
      s.visible &&
      s.x >= margin &&
      s.x <= viewport.width - margin &&
      s.y >= margin &&
      s.y <= viewport.height - margin
    );
  });
}
