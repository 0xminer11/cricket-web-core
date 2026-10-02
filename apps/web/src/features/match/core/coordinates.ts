import {
  clampUnit,
  classifyLength,
  classifyLine,
} from '@the-cricketer/game-core';
import type { DeliveryLength, DeliveryLine } from '@the-cricketer/game-core';
import { CAMERA_DEFAULT, PITCH, TARGETING } from '../config/visual-config';
import type { Vec3 } from './vec';

export type BattingHand = 'right' | 'left';

/** Half a turn about the vertical axis through the middle of the pitch (its own inverse). */
export const turnWorld = (p: Vec3): Vec3 => ({
  u: -p.u,
  v: PITCH.length - p.v,
  z: p.z,
});

/** Cricket-relative pitch target: x 0 = off .. 1 = leg, y 0 = yorker .. 1 = bouncer. */
export interface NormalizedTarget {
  readonly x: number;
  readonly y: number;
}

/** +1 for a right-hander: the off side (x = 0) is on the viewer's LEFT when watching from the bowler's end. */
export const handSign = (hand: BattingHand): 1 | -1 =>
  hand === 'right' ? 1 : -1;

export const sanitizeTarget = (t: NormalizedTarget): NormalizedTarget => ({
  x: clampUnit(t.x),
  y: clampUnit(t.y),
});

/** Normalized target -> metres on the pitch plane (z = 0). */
export function targetToWorld(t: NormalizedTarget, hand: BattingHand): Vec3 {
  const s = sanitizeTarget(t);
  return {
    u: handSign(hand) * (s.x - 0.5) * TARGETING.lineSpan,
    v: PITCH.length - TARGETING.yorkerOffset - s.y * TARGETING.lengthSpan,
    z: 0,
  };
}

/** Metres on the pitch plane -> normalized target, clamped into the valid region. */
export function worldToTarget(
  u: number,
  v: number,
  hand: BattingHand,
): NormalizedTarget {
  return sanitizeTarget({
    x: 0.5 + (handSign(hand) * u) / TARGETING.lineSpan,
    y: (PITCH.length - TARGETING.yorkerOffset - v) / TARGETING.lengthSpan,
  });
}

/** A pitch-side offset in BATTER-RELATIVE metres (negative = off side) -> world u. */
export const relativeToWorldU = (offset: number, hand: BattingHand): number =>
  handSign(hand) * offset;

export interface ViewParams {
  /** Camera position along the pitch (v), height (z) and lateral offset (u). */
  readonly camV: number;
  readonly camH: number;
  readonly camU: number;
  /** Point on the ground (v) the camera looks at; sets the downward tilt. */
  readonly lookV: number;
  readonly lookU: number;
  /** Vertical field of view, degrees. */
  readonly fov: number;
  /** Extra zoom multiplier (1 = none). */
  readonly zoom: number;
  /** Fraction of the viewport height where the optical centre sits; overrides the viewport's. */
  readonly centerY?: number;
  /**
   * Look from behind the BATTER instead of behind the bowler: the world is turned half a circle about the
   * middle of the pitch before it is projected, so every position, path and mapping stays in the one
   * world frame and only the camera changes.
   */
  readonly rotated?: boolean;
}
export interface Viewport {
  readonly width: number;
  readonly height: number;
  /** Fraction of the height where the optical centre sits (0.5 = middle). */
  readonly centerY?: number;
}
export interface Projected {
  readonly x: number;
  readonly y: number;
  /** Pixels per metre at that depth (a 1 m object is `scale` px tall). */
  readonly scale: number;
  readonly depth: number;
  readonly visible: boolean;
}

interface Basis {
  readonly cosP: number;
  readonly sinP: number;
  readonly f: number;
  readonly cx: number;
  readonly cy: number;
}
const basis = (view: ViewParams, viewport: Viewport): Basis => {
  const dv = view.lookV - view.camV;
  const pitch = Math.atan2(view.camH, Math.max(0.01, dv));
  // Portrait screens are scaled by width, so the pitch never overflows a narrow viewport.
  const effectiveHeight = Math.min(viewport.height, viewport.width * 0.75);
  const f =
    (effectiveHeight / 2 / Math.tan((view.fov * Math.PI) / 360)) * view.zoom;
  return {
    cosP: Math.cos(pitch),
    sinP: Math.sin(pitch),
    f,
    cx: viewport.width / 2,
    cy: viewport.height * (view.centerY ?? viewport.centerY ?? 0.5),
  };
};

const MIN_DEPTH = 0.25;

/**
 * Pinhole projection for a camera behind the bowler looking down the pitch. Pure and
 * resolution-independent: the same world point maps to the same normalized place at any size.
 */
export function project(
  point: Vec3,
  view: ViewParams,
  viewport: Viewport,
): Projected {
  const p = view.rotated ? turnWorld(point) : point;
  const b = basis(view, viewport);
  const du = p.u - view.camU;
  const dv = p.v - view.camV;
  const dz = p.z - view.camH;
  const depth = dv * b.cosP - dz * b.sinP;
  const vertical = dv * b.sinP + dz * b.cosP;
  if (depth < MIN_DEPTH)
    return { x: b.cx, y: b.cy, scale: 0, depth, visible: false };
  return {
    x: b.cx + (b.f * du) / depth,
    y: b.cy - (b.f * vertical) / depth,
    scale: b.f / depth,
    depth,
    visible: true,
  };
}

/** Screen pixel -> point on the ground plane (z = 0), or null when the ray does not hit the ground. */
export function unprojectToGround(
  sx: number,
  sy: number,
  view: ViewParams,
  viewport: Viewport,
): { u: number; v: number } | null {
  const b = basis(view, viewport);
  const a = (sx - b.cx) / b.f;
  const up = (b.cy - sy) / b.f;
  const denominator = b.sinP - b.cosP * up;
  if (denominator <= 1e-6) return null;
  const t = view.camH / denominator;
  const ground = {
    u: view.camU + t * a,
    v: view.camV + t * (b.cosP + b.sinP * up),
  };
  return view.rotated ? turnWorld({ u: ground.u, v: ground.v, z: 0 }) : ground;
}

/** Screen pixel -> normalized pitch target (clamped to the valid region), or null if off the ground. */
export function screenToTarget(
  sx: number,
  sy: number,
  view: ViewParams,
  viewport: Viewport,
  hand: BattingHand,
): NormalizedTarget | null {
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  const ground = unprojectToGround(sx, sy, view, viewport);
  return ground ? worldToTarget(ground.u, ground.v, hand) : null;
}

export function targetToScreen(
  t: NormalizedTarget,
  view: ViewParams,
  viewport: Viewport,
  hand: BattingHand,
): Projected {
  return project(targetToWorld(t, hand), view, viewport);
}

export interface TargetReadout {
  readonly line: DeliveryLine;
  readonly length: DeliveryLength;
}
/** The same classification the engine applies; only used to LABEL the marker, never to score. */
export const classifyTarget = (t: NormalizedTarget): TargetReadout => ({
  line: classifyLine(sanitizeTarget(t).x),
  length: classifyLength(sanitizeTarget(t).y),
});

export const DEFAULT_FOV = CAMERA_DEFAULT.fov;
