import { describe, expect, it } from 'vitest';
import {
  classifyTarget,
  project,
  sanitizeTarget,
  screenToTarget,
  targetToScreen,
  targetToWorld,
  unprojectToGround,
  worldToTarget,
} from '../../apps/web/src/features/match/core/coordinates';
import { CAMERA_PRESETS } from '../../apps/web/src/features/match/core/camera-controller';
import { PitchTargetController } from '../../apps/web/src/features/match/core/pitch-target-controller';
import { VIEWPORTS } from './support';

const view = CAMERA_PRESETS.PreDelivery;

describe('normalized pitch coordinates', () => {
  it('maps the engine target to metres and back, for both batting hands', () => {
    for (const hand of ['right', 'left'] as const)
      for (let x = 0; x <= 1; x += 0.125)
        for (let y = 0; y <= 1; y += 0.125) {
          const w = targetToWorld({ x, y }, hand);
          const back = worldToTarget(w.u, w.v, hand);
          expect(back.x).toBeCloseTo(x, 9);
          expect(back.y).toBeCloseTo(y, 9);
        }
  });

  it('puts the off side on the viewer’s left for a right-hander and on the right for a left-hander', () => {
    const offRight = targetToWorld({ x: 0.1, y: 0.5 }, 'right');
    const legRight = targetToWorld({ x: 0.9, y: 0.5 }, 'right');
    expect(offRight.u).toBeLessThan(legRight.u);
    const offLeft = targetToWorld({ x: 0.1, y: 0.5 }, 'left');
    const legLeft = targetToWorld({ x: 0.9, y: 0.5 }, 'left');
    expect(offLeft.u).toBeGreaterThan(legLeft.u);
    // the middle stump line is the centre for both
    expect(targetToWorld({ x: 0.5, y: 0.5 }, 'right').u).toBeCloseTo(0, 9);
    expect(targetToWorld({ x: 0.5, y: 0.5 }, 'left').u).toBeCloseTo(0, 9);
  });

  it('places a yorker at the batter and a bouncer nearer the bowler', () => {
    const yorker = targetToWorld({ x: 0.5, y: 0 }, 'right');
    const bouncer = targetToWorld({ x: 0.5, y: 1 }, 'right');
    expect(yorker.v).toBeGreaterThan(bouncer.v);
    expect(yorker.v).toBeLessThan(20.12);
    expect(bouncer.v).toBeGreaterThan(0);
  });

  it('clamps and refuses non-finite values so the engine never receives NaN', () => {
    expect(sanitizeTarget({ x: 2, y: -3 })).toEqual({ x: 1, y: 0 });
    expect(sanitizeTarget({ x: Number.NaN, y: Infinity })).toEqual({
      x: 0,
      y: 0,
    });
    expect(
      screenToTarget(Number.NaN, 10, view, VIEWPORTS[0], 'right'),
    ).toBeNull();
    // with a shallow camera the top of the screen is above the horizon: the ray never reaches the ground
    const shallow = { ...view, camH: 2, lookV: 400 };
    expect(unprojectToGround(100, 0, shallow, VIEWPORTS[0])).toBeNull();
    // while below the horizon it always does
    expect(unprojectToGround(100, 700, shallow, VIEWPORTS[0])).not.toBeNull();
  });

  it('labels with the same classification the engine applies', () => {
    expect(classifyTarget({ x: 0.27, y: 0.48 })).toEqual({
      line: 'outside_off',
      length: 'good',
    });
    expect(classifyTarget({ x: 0.55, y: 0.05 })).toEqual({
      line: 'middle',
      length: 'yorker',
    });
    expect(classifyTarget({ x: 0.97, y: 0.95 })).toEqual({
      line: 'wide_leg',
      length: 'bouncer',
    });
  });
});

describe('camera projection and the pointer', () => {
  it.each(VIEWPORTS)(
    'round-trips pitch targets through the screen at $name',
    (viewport) => {
      for (const hand of ['right', 'left'] as const)
        for (const x of [0.04, 0.27, 0.5, 0.69, 0.96])
          for (const y of [0.02, 0.24, 0.5, 0.72, 0.95]) {
            const screen = targetToScreen({ x, y }, view, viewport, hand);
            expect(screen.visible).toBe(true);
            const back = screenToTarget(
              screen.x,
              screen.y,
              view,
              viewport,
              hand,
            )!;
            expect(back.x).toBeCloseTo(x, 6);
            expect(back.y).toBeCloseTo(y, 6);
          }
    },
  );

  it('keeps every preset able to target the whole pitch (marker on screen) at every resolution', () => {
    for (const [name, preset] of Object.entries(CAMERA_PRESETS))
      for (const viewport of VIEWPORTS)
        for (const corner of [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ]) {
          if (name !== 'PreDelivery') continue; // targeting happens in the pre-delivery shot
          const s = targetToScreen(corner, preset, viewport, 'right');
          expect(s.visible, `${name} ${viewport.name}`).toBe(true);
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.x).toBeLessThanOrEqual(viewport.width);
          expect(s.y).toBeGreaterThanOrEqual(0);
          expect(s.y).toBeLessThanOrEqual(viewport.height);
        }
  });

  it('projects farther points smaller and higher', () => {
    const near = project({ u: 0, v: 2, z: 0 }, view, VIEWPORTS[0]);
    const far = project({ u: 0, v: 19, z: 0 }, view, VIEWPORTS[0]);
    expect(far.scale).toBeLessThan(near.scale);
    expect(far.y).toBeLessThan(near.y);
  });

  it('a drag in screen space lands on the same normalized target at any resolution', () => {
    for (const viewport of VIEWPORTS) {
      const controller = new PitchTargetController();
      const aim = { x: 0.31, y: 0.55 };
      const p = targetToScreen(aim, view, viewport, 'right');
      expect(controller.setFromScreen(p.x, p.y, view, viewport, 'right')).toBe(
        true,
      );
      expect(controller.target.x).toBeCloseTo(aim.x, 6);
      expect(controller.target.y).toBeCloseTo(aim.y, 6);
    }
  });
});

describe('PitchTargetController', () => {
  it('moves by preset and nudge, and never leaves the pitch', () => {
    const c = new PitchTargetController({ x: 0.5, y: 0.5 });
    c.setLine('outside_off');
    c.setLength('yorker');
    expect(c.readout()).toMatchObject({
      line: 'outside_off',
      length: 'yorker',
    });
    for (let i = 0; i < 100; i++) c.nudge(-1, -1, true);
    expect(c.target).toEqual({ x: 0, y: 0 });
    for (let i = 0; i < 100; i++) c.nudge(1, 1, true);
    expect(c.target).toEqual({ x: 1, y: 1 });
    c.set({ x: Number.NaN, y: 4 });
    expect(Number.isFinite(c.target.x)).toBe(true);
    expect(c.target.y).toBe(1);
  });

  it('snaps to the zone centre only when assist is on and the aim is already close', () => {
    const c = new PitchTargetController();
    c.set({ x: 0.275, y: 0.49 }, true);
    expect(c.target.x).toBeCloseTo(0.27, 9);
    expect(c.target.y).toBeCloseTo(0.48, 9);
    c.set({ x: 0.2, y: 0.4 }, true);
    expect(c.target).toEqual({ x: 0.2, y: 0.4 });
  });

  it('keeps the readout text in plain cricket language', () => {
    const c = new PitchTargetController({ x: 0.27, y: 0.48 });
    expect(c.readout().text).toBe('Outside off, good length');
  });
});
