import type * as Phaser from 'phaser';
import { B_ZONES } from './zones';
import { PALETTE, PITCH_PALETTES } from '../config/palette';
import { PITCH, TARGETING } from '../config/visual-config';
import { targetToWorld } from '../core/coordinates';
import type {
  BattingHand,
  NormalizedTarget,
  Projected,
} from '../core/coordinates';
import type { Pose } from '../core/bowling-animation';
import type { BatterFrame } from '../core/batting-rig';
import { lerp, vec } from '../core/vec';
import type { Vec3 } from '../core/vec';

export type Quality = 'low' | 'medium' | 'high';
export type Project = (p: Vec3) => Projected;
export interface RenderContext {
  readonly g: Phaser.GameObjects.Graphics;
  readonly P: Project;
  readonly width: number;
  readonly height: number;
  readonly quality: Quality;
  /** The camera stands behind the batter: the horizon is the other way and the stripes must cover that side. */
  readonly rotated?: boolean;
}

const colorMix = (a: number, b: number, t: number): number => {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    (Math.round(lerp(ar, br, t)) << 16) |
    (Math.round(lerp(ag, bg, t)) << 8) |
    Math.round(lerp(ab, bb, t))
  );
};

function polygon(
  ctx: RenderContext,
  points: readonly Vec3[],
  fill: number,
  alpha = 1,
): boolean {
  const projected = points.map(ctx.P);
  if (projected.some((p) => !p.visible)) return false;
  ctx.g.fillStyle(fill, alpha);
  ctx.g.fillPoints(
    projected.map((p) => ({ x: p.x, y: p.y })),
    true,
  );
  return true;
}

function line(
  ctx: RenderContext,
  a: Vec3,
  b: Vec3,
  color: number,
  widthMetres: number,
  alpha = 1,
  minPx = 1,
): void {
  const pa = ctx.P(a);
  const pb = ctx.P(b);
  if (!pa.visible || !pb.visible) return;
  ctx.g.lineStyle(
    Math.max(minPx, widthMetres * ((pa.scale + pb.scale) / 2)),
    color,
    alpha,
  );
  ctx.g.lineBetween(pa.x, pa.y, pb.x, pb.y);
}

/** Sky, stands, outfield stripes and the boundary rope. */
export function drawGround(ctx: RenderContext): void {
  const { g, width, height } = ctx;
  const horizon = ctx.P(vec(0, ctx.rotated ? PITCH.length - 400 : 400, 0));
  const hy = Math.min(height, Math.max(0, horizon.y));
  const bands = ctx.quality === 'low' ? 4 : 10;
  for (let i = 0; i < bands; i++) {
    g.fillStyle(
      colorMix(PALETTE.skyTop, PALETTE.skyBottom, i / (bands - 1)),
      1,
    );
    g.fillRect(0, (hy * i) / bands, width, hy / bands + 1);
  }
  g.fillStyle(PALETTE.grassFar, 1);
  g.fillRect(0, hy, width, height - hy);

  // stands band along the horizon
  const standsTop = hy - Math.max(6, height * 0.05);
  g.fillStyle(PALETTE.standsDark, 1);
  g.fillRect(0, standsTop, width, hy - standsTop);
  if (ctx.quality !== 'low') {
    g.fillStyle(PALETTE.standsLight, 1);
    g.fillRect(
      0,
      standsTop + (hy - standsTop) * 0.5,
      width,
      (hy - standsTop) * 0.5,
    );
    const step = Math.max(7, width / 110);
    for (let x = 0, i = 0; x < width; x += step, i++) {
      g.fillStyle(PALETTE.crowdDots[i % PALETTE.crowdDots.length]!, 0.85);
      g.fillRect(
        x,
        standsTop + ((i * 7) % 5) * ((hy - standsTop) / 6),
        step * 0.55,
        step * 0.55,
      );
    }
  }

  // mown stripes across the outfield, drawn in pitch space so they follow the camera
  const stripe = 7;
  for (let v = -112, i = 0; v < 112; v += stripe, i++) {
    if (i % 2) continue;
    polygon(
      ctx,
      [
        vec(-90, v, 0),
        vec(90, v, 0),
        vec(90, v + stripe, 0),
        vec(-90, v + stripe, 0),
      ],
      PALETTE.grassStripe,
      0.55,
    );
  }
  // nearer grass tint for depth
  polygon(
    ctx,
    [vec(-90, -40, 0), vec(90, -40, 0), vec(90, 6, 0), vec(-90, 6, 0)],
    PALETTE.grassNear,
    0.35,
  );
  // boundary rope
  const points: Vec3[] = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    points.push(vec(Math.sin(a) * 70, 10 + Math.cos(a) * 70, 0));
  }
  g.lineStyle(2, PALETTE.rope, 0.7);
  g.beginPath();
  let started = false;
  for (const point of points) {
    const p = ctx.P(point);
    if (!p.visible) {
      started = false;
      continue;
    }
    if (!started) g.moveTo(p.x, p.y);
    else g.lineTo(p.x, p.y);
    started = true;
  }
  g.strokePath();
}

export function drawPitch(
  ctx: RenderContext,
  kind: 'green' | 'hard' | 'dry',
): void {
  const palette = PITCH_PALETTES[kind];
  const half = PITCH.width / 2;
  const top = PITCH.length + 1.3;
  const bottom = -1.3;
  polygon(
    ctx,
    [
      vec(-half - 0.12, bottom, 0),
      vec(half + 0.12, bottom, 0),
      vec(half + 0.12, top, 0),
      vec(-half - 0.12, top, 0),
    ],
    palette.edge,
  );
  polygon(
    ctx,
    [
      vec(-half, bottom, 0),
      vec(half, bottom, 0),
      vec(half, top, 0),
      vec(-half, top, 0),
    ],
    palette.base,
  );
  // length-wise streaks give the surface texture and read as perspective lines
  for (let i = -3; i <= 3; i++)
    line(
      ctx,
      vec((i * half) / 3.4, bottom, 0),
      vec((i * half) / 3.4, top, 0),
      palette.streak,
      0.05,
      0.5,
    );
  if (palette.cracks) {
    for (let i = 0; i < 9; i++) {
      const u = -1.1 + ((i * 0.93) % 2.2);
      const v = 4 + ((i * 5.3) % 13);
      line(ctx, vec(u, v, 0), vec(u + 0.18, v + 0.5, 0), 0x8a7a55, 0.02, 0.8);
      line(
        ctx,
        vec(u + 0.18, v + 0.5, 0),
        vec(u + 0.05, v + 0.95, 0),
        0x8a7a55,
        0.02,
        0.8,
      );
    }
  }
  // creases (bowling crease, popping creases, return creases)
  for (const v of [0, PITCH.length])
    line(ctx, vec(-1.32, v, 0), vec(1.32, v, 0), PALETTE.crease, 0.04, 0.9);
  for (const v of [PITCH.poppingCrease, PITCH.length - PITCH.poppingCrease])
    line(ctx, vec(-1.83, v, 0), vec(1.83, v, 0), PALETTE.crease, 0.04, 0.9);
  for (const u of [-1.32, 1.32]) {
    line(ctx, vec(u, -0.1, 0), vec(u, 1.22, 0), PALETTE.crease, 0.03, 0.7);
    line(
      ctx,
      vec(u, PITCH.length - 1.22, 0),
      vec(u, PITCH.length + 0.1, 0),
      PALETTE.crease,
      0.03,
      0.7,
    );
  }
}

/** Both sets of stumps; `disturbed` (0..1) knocks the batter-end stumps over and lifts the bails. */
export function drawStumps(ctx: RenderContext, disturbed: number): void {
  for (const end of [0, PITCH.length]) {
    const hit = end === PITCH.length ? disturbed : 0;
    for (const du of [-PITCH.stumpSpread / 2, 0, PITCH.stumpSpread / 2]) {
      const lean = hit * (0.18 + Math.abs(du) * 2);
      line(
        ctx,
        vec(du, end, 0),
        vec(
          du + du * hit * 1.4,
          end + lean * (end === PITCH.length ? 1 : -1),
          PITCH.stumpHeight * (1 - hit * 0.25),
        ),
        PALETTE.stump,
        0.04,
        1,
        2,
      );
    }
    const bailLift = hit * 0.5;
    for (const du of [-PITCH.stumpSpread / 4, PITCH.stumpSpread / 4])
      line(
        ctx,
        vec(du - 0.05, end, PITCH.stumpHeight + bailLift),
        vec(du + 0.05, end, PITCH.stumpHeight + bailLift + hit * 0.1),
        PALETTE.bail,
        0.03,
        1,
        2,
      );
  }
}

/**
 * The aiming overlay: length bands and line zones laid on the pitch in the engine's coordinates,
 * with distinct line patterns (not just colours) so it works without telling red from green.
 */
export function drawZones(
  ctx: RenderContext,
  hand: BattingHand,
  focus: { line: string; length: string },
): void {
  const edgeY = [0, ...B_ZONES.lengthEdges, 1];
  const edgeX = [0, ...B_ZONES.lineEdges, 1];
  const lengthNames = ['yorker', 'full', 'good', 'short', 'bouncer'];
  const lineNames = [
    'wide_off',
    'outside_off',
    'off_stump',
    'middle',
    'leg',
    'wide_leg',
  ];
  // length bands: alternate fills, with the band that holds the aim lightly highlighted
  for (let i = 0; i < lengthNames.length; i++) {
    const a = targetToWorld({ x: 0, y: edgeY[i]! }, hand);
    const b = targetToWorld({ x: 0, y: edgeY[i + 1]! }, hand);
    const half = (TARGETING.lineSpan / 2) * 1.0;
    const active = focus.length === lengthNames[i];
    polygon(
      ctx,
      [
        vec(-half, a.v, 0),
        vec(half, a.v, 0),
        vec(half, b.v, 0),
        vec(-half, b.v, 0),
      ],
      active ? 0xffffff : 0x000000,
      active ? 0.16 : i % 2 ? 0.06 : 0.0,
    );
  }
  // zone boundaries: dashed (length) and dotted (line) so they differ without colour
  for (const y of edgeY.slice(1, -1)) {
    const a = targetToWorld({ x: 0, y }, hand);
    dashed(
      ctx,
      vec(-TARGETING.lineSpan / 2, a.v, 0),
      vec(TARGETING.lineSpan / 2, a.v, 0),
      14,
      8,
      0.55,
    );
  }
  for (const x of edgeX.slice(1, -1)) {
    const a = targetToWorld({ x, y: 0 }, hand);
    const b = targetToWorld({ x, y: 1 }, hand);
    dashed(ctx, vec(a.u, a.v, 0), vec(b.u, b.v, 0), 3, 7, 0.4);
  }
  void lineNames;
  void focus.line;
}

function dashed(
  ctx: RenderContext,
  a: Vec3,
  b: Vec3,
  dash: number,
  gap: number,
  alpha: number,
): void {
  const pa = ctx.P(a);
  const pb = ctx.P(b);
  if (!pa.visible || !pb.visible) return;
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  ctx.g.lineStyle(1.5, PALETTE.zoneLine, alpha);
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(len, d + dash);
    ctx.g.lineBetween(
      pa.x + (dx * d) / len,
      pa.y + (dy * d) / len,
      pa.x + (dx * e) / len,
      pa.y + (dy * e) / len,
    );
  }
}

/** The aim marker: a ring in the pitch plane (so it foreshortens with the pitch) and a pin. */
export function drawTargetMarker(
  ctx: RenderContext,
  target: NormalizedTarget,
  hand: BattingHand,
  color: number = PALETTE.target,
  radius = 0.26,
): void {
  const centre = targetToWorld(target, hand);
  const ring: Vec3[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    ring.push(
      vec(
        centre.u + Math.cos(a) * radius,
        centre.v + Math.sin(a) * radius * 1.5,
        0,
      ),
    );
  }
  const pts = ring.map(ctx.P);
  if (pts.some((p) => !p.visible)) return;
  ctx.g.fillStyle(color, 0.28);
  ctx.g.fillPoints(
    pts.map((p) => ({ x: p.x, y: p.y })),
    true,
  );
  ctx.g.lineStyle(4, PALETTE.targetEdge, 0.9);
  ctx.g.strokePoints(
    pts.map((p) => ({ x: p.x, y: p.y })),
    true,
  );
  ctx.g.lineStyle(2.5, color, 1);
  ctx.g.strokePoints(
    pts.map((p) => ({ x: p.x, y: p.y })),
    true,
  );
  const c = ctx.P(centre);
  const r = Math.max(5, c.scale * 0.11);
  ctx.g.lineStyle(3, PALETTE.targetEdge, 0.9);
  ctx.g.lineBetween(c.x - r, c.y, c.x + r, c.y);
  ctx.g.lineBetween(c.x, c.y - r, c.x, c.y + r);
  ctx.g.lineStyle(1.5, color, 1);
  ctx.g.lineBetween(c.x - r, c.y, c.x + r, c.y);
  ctx.g.lineBetween(c.x, c.y - r, c.x, c.y + r);
}

function shadow(
  ctx: RenderContext,
  at: Vec3,
  radius: number,
  alpha = 0.28,
): void {
  const p = ctx.P(vec(at.u, at.v, 0));
  if (!p.visible) return;
  ctx.g.fillStyle(PALETTE.shadow, alpha);
  ctx.g.fillEllipse(p.x, p.y, radius * p.scale * 2, radius * p.scale * 0.7);
}

const limb = (
  ctx: RenderContext,
  a: Vec3,
  b: Vec3,
  color: number,
  metres: number,
) => line(ctx, a, b, color, metres, 1, 2);

function head(
  ctx: RenderContext,
  at: Vec3,
  radiusMetres: number,
  color: number,
): void {
  const p = ctx.P(at);
  if (!p.visible) return;
  ctx.g.fillStyle(0x111111, 0.9);
  ctx.g.fillCircle(p.x, p.y, Math.max(3, radiusMetres * p.scale) + 1);
  ctx.g.fillStyle(color, 1);
  ctx.g.fillCircle(p.x, p.y, Math.max(3, radiusMetres * p.scale));
}

export interface PersonColors {
  readonly shirt: number;
  readonly pants: number;
  readonly skin: number;
}

/** A procedural bowler (TEMPORARY PLACEHOLDER): ground shadow, legs, torso, arms, head. */
export function drawBowler(
  ctx: RenderContext,
  pose: Pose,
  colors: PersonColors,
): void {
  shadow(ctx, pose.pelvis, 0.5);
  limb(ctx, pose.hipLeft, pose.kneeLeft, colors.pants, 0.13);
  limb(ctx, pose.kneeLeft, pose.footLeft, colors.pants, 0.11);
  limb(ctx, pose.hipRight, pose.kneeRight, colors.pants, 0.13);
  limb(ctx, pose.kneeRight, pose.footRight, colors.pants, 0.11);
  limb(ctx, pose.pelvis, pose.neck, colors.shirt, 0.34);
  limb(ctx, pose.shoulderOther, pose.elbowOther, colors.shirt, 0.1);
  limb(ctx, pose.elbowOther, pose.handOther, colors.skin, 0.08);
  limb(ctx, pose.shoulderBowl, pose.elbowBowl, colors.shirt, 0.1);
  limb(ctx, pose.elbowBowl, pose.handBowl, colors.skin, 0.08);
  head(ctx, pose.head, 0.115, colors.skin);
}

export function drawBatter(
  ctx: RenderContext,
  frame: Pick<BatterFrame, 'joints' | 'batGrip' | 'batTip'>,
  colors: PersonColors,
): void {
  const j = frame.joints;
  shadow(ctx, j.pelvis, 0.55);
  limb(ctx, j.footL, j.kneeL, PALETTE.pad, 0.16);
  limb(ctx, j.kneeL, j.pelvis, colors.pants, 0.15);
  limb(ctx, j.footR, j.kneeR, PALETTE.pad, 0.16);
  limb(ctx, j.kneeR, j.pelvis, colors.pants, 0.15);
  limb(ctx, j.pelvis, j.neck, colors.shirt, 0.36);
  limb(ctx, j.shoulderL, j.elbowL, colors.shirt, 0.1);
  limb(ctx, j.elbowL, j.grip, colors.skin, 0.08);
  limb(ctx, j.shoulderR, j.elbowR, colors.shirt, 0.1);
  limb(ctx, j.elbowR, j.grip, colors.skin, 0.08);
  limb(ctx, frame.batGrip, frame.batTip, PALETTE.bat, 0.11);
  head(ctx, j.head, 0.125, colors.skin);
  // helmet band
  const h = ctx.P(j.head);
  if (h.visible) {
    ctx.g.fillStyle(0x1b4fb3, 1);
    ctx.g.fillRect(
      h.x - h.scale * 0.13,
      h.y - h.scale * 0.14,
      h.scale * 0.26,
      h.scale * 0.08,
    );
  }
}

export interface TrailPoint {
  readonly x: number;
  readonly y: number;
}

export function drawBall(
  ctx: RenderContext,
  at: Vec3,
  radiusMetres: number,
  trail: readonly TrailPoint[],
  spin: number,
): void {
  const p = ctx.P(at);
  if (!p.visible) return;
  // ground shadow gives the depth cue, strongest at the bounce
  const height = Math.max(0, at.z);
  const ground = ctx.P(vec(at.u, at.v, 0));
  if (ground.visible) {
    ctx.g.fillStyle(PALETTE.shadow, Math.max(0.1, 0.4 - height * 0.12));
    const r = Math.max(2, radiusMetres * ground.scale);
    ctx.g.fillEllipse(ground.x, ground.y, r * 2.2, r * 0.8);
  }
  if (trail.length > 1 && ctx.quality !== 'low') {
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1]!;
      const b = trail[i]!;
      ctx.g.lineStyle(
        Math.max(1, (p.scale * radiusMetres * 1.4 * i) / trail.length),
        0xffffff,
        (0.5 * i) / trail.length,
      );
      ctx.g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }
  const r = Math.max(3.5, radiusMetres * p.scale);
  ctx.g.fillStyle(0x111111, 0.9);
  ctx.g.fillCircle(p.x, p.y, r + 1.2);
  ctx.g.fillStyle(PALETTE.ball, 1);
  ctx.g.fillCircle(p.x, p.y, r);
  // seam: a short arc that rotates with the engine's spin so spin is visible on the ball
  ctx.g.lineStyle(Math.max(1, r * 0.25), PALETTE.ballHighlight, 0.9);
  ctx.g.lineBetween(
    p.x - Math.cos(spin) * r * 0.7,
    p.y - Math.sin(spin) * r * 0.7,
    p.x + Math.cos(spin) * r * 0.7,
    p.y + Math.sin(spin) * r * 0.7,
  );
}
