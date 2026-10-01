import { PerspectiveCamera } from 'three';
import { CAMERA_LIMITS, CAMERA_PRESETS } from '@the-cricketer/game-core';
import type { CameraPresetId } from '@the-cricketer/game-core';

interface Pose {
  azimuth: number;
  polar: number;
  distance: number;
  tx: number;
  ty: number;
  tz: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Orbit camera dedicated to the character viewer. One finger/mouse drags to rotate, two fingers
 * pinch to zoom, wheel zooms, arrow keys/+/-/Home work when the viewer is focused, and the same
 * actions are exposed as methods for on-screen buttons (dragging is never the only way). Polar
 * angle and distance are clamped so the camera never goes under the floor, inside the character or
 * absurdly far away. Moves are smoothed; `update` reports whether the camera is still moving so
 * the renderer can stop when nothing changes.
 */
export class OrbitCameraController {
  readonly camera: PerspectiveCamera;
  private readonly pose: Pose;
  private goal: Pose;
  private home: Pose;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchStart: { distance: number; at: number } | undefined;
  private autoRotate = false;
  private lastInteraction = 0;
  private readonly cleanup: Array<() => void> = [];

  constructor(
    private readonly element: HTMLElement,
    aspect: number,
    private readonly onChange: () => void,
    preset: CameraPresetId = 'camera.full_body',
  ) {
    this.camera = new PerspectiveCamera(32, aspect, 0.05, 40);
    this.home = this.fromPreset(preset);
    this.pose = { ...this.home };
    this.goal = { ...this.home };
    this.apply();
    this.bind();
  }

  private fromPreset(id: CameraPresetId): Pose {
    const p = CAMERA_PRESETS[id];
    return {
      azimuth: p.azimuth,
      polar: p.polar,
      distance: p.distance,
      tx: p.target[0],
      ty: p.target[1],
      tz: p.target[2],
    };
  }

  private bind(): void {
    const el = this.element;
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() =>
        el.removeEventListener(type, fn as EventListener),
      );
    };
    on('pointerdown', (e) => {
      // Overlay controls (the Retry button) live inside the stage; capturing the pointer for
      // orbiting would steal their click.
      if (
        e.target instanceof Element &&
        e.target.closest('button, a, input, select, textarea')
      )
        return;
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2)
        this.pinchStart = {
          distance: this.pinchDistance(),
          at: this.goal.distance,
        };
      this.interacted();
    });
    on('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const next = { x: e.clientX, y: e.clientY };
      if (this.pointers.size === 1) {
        const h = Math.max(200, el.clientHeight);
        this.goal.azimuth -= ((next.x - prev.x) / h) * Math.PI * 1.2;
        this.goal.polar = clamp(
          this.goal.polar - ((next.y - prev.y) / h) * Math.PI * 0.6,
          CAMERA_LIMITS.minPolar,
          CAMERA_LIMITS.maxPolar,
        );
      }
      this.pointers.set(e.pointerId, next);
      if (this.pointers.size === 2 && this.pinchStart) {
        const ratio =
          this.pinchStart.distance / Math.max(1, this.pinchDistance());
        this.goal.distance = clamp(
          this.pinchStart.at * ratio,
          CAMERA_LIMITS.minDistance,
          CAMERA_LIMITS.maxDistance,
        );
      }
      this.interacted();
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchStart = undefined;
    };
    on('pointerup', up);
    on('pointercancel', up);
    on(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomBy(e.deltaY > 0 ? 1.1 : 0.9);
      },
      { passive: false },
    );
    on('keydown', (e) => {
      // Only while the viewer itself has focus; never hijack global shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const handled = this.key(e.key);
      if (handled) e.preventDefault();
    });
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
  }

  private key(key: string): boolean {
    switch (key) {
      case 'ArrowLeft':
        this.rotateBy(-0.35);
        return true;
      case 'ArrowRight':
        this.rotateBy(0.35);
        return true;
      case 'ArrowUp':
        this.tiltBy(-0.12);
        return true;
      case 'ArrowDown':
        this.tiltBy(0.12);
        return true;
      case '+':
      case '=':
        this.zoomBy(0.85);
        return true;
      case '-':
      case '_':
        this.zoomBy(1.18);
        return true;
      case 'Home':
        this.reset();
        return true;
      default:
        return false;
    }
  }

  private interacted(): void {
    this.lastInteraction = performance.now();
    this.onChange();
  }

  // ---- public actions (used by buttons as well as input) --------------------------------------
  rotateBy(radians: number): void {
    this.goal.azimuth += radians;
    this.interacted();
  }
  tiltBy(radians: number): void {
    this.goal.polar = clamp(
      this.goal.polar + radians,
      CAMERA_LIMITS.minPolar,
      CAMERA_LIMITS.maxPolar,
    );
    this.interacted();
  }
  zoomBy(factor: number): void {
    this.goal.distance = clamp(
      this.goal.distance * factor,
      CAMERA_LIMITS.minDistance,
      CAMERA_LIMITS.maxDistance,
    );
    this.interacted();
  }
  reset(): void {
    this.goal = { ...this.home };
    this.interacted();
  }
  /** Fly to a named preset (dressing room focuses the body part an item affects). */
  goTo(id: CameraPresetId, instant = false): void {
    const next = this.fromPreset(id);
    // keep the player's chosen rotation; only the framing changes
    this.goal = { ...next, azimuth: this.goal.azimuth };
    this.home = this.fromPreset('camera.full_body');
    if (instant) Object.assign(this.pose, this.goal);
    this.interacted();
  }
  setAutoRotate(on: boolean): void {
    this.autoRotate = on;
    this.onChange();
  }
  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Advance smoothing. Returns true while the camera is still moving (keep rendering). */
  update(deltaSeconds: number): boolean {
    if (
      this.autoRotate &&
      performance.now() - this.lastInteraction > 2500 &&
      this.pointers.size === 0
    )
      this.goal.azimuth += deltaSeconds * 0.35;
    const k = 1 - Math.exp(-deltaSeconds * 9);
    let moving = false;
    for (const key of [
      'azimuth',
      'polar',
      'distance',
      'tx',
      'ty',
      'tz',
    ] as const) {
      const d = this.goal[key] - this.pose[key];
      if (Math.abs(d) > 0.0005) {
        this.pose[key] += d * k;
        moving = true;
      } else this.pose[key] = this.goal[key];
    }
    this.apply();
    return moving || this.autoRotate;
  }

  private apply(): void {
    const { azimuth, polar, distance, tx, ty, tz } = this.pose;
    const sp = Math.sin(polar);
    this.camera.position.set(
      tx + distance * sp * Math.sin(azimuth),
      Math.max(0.15, ty + distance * Math.cos(polar)),
      tz + distance * sp * Math.cos(azimuth),
    );
    this.camera.lookAt(tx, ty, tz);
  }

  get state() {
    return { ...this.pose };
  }

  dispose(): void {
    for (const fn of this.cleanup) fn();
    this.cleanup.length = 0;
    this.pointers.clear();
  }
}
