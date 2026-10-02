import { describe, expect, it } from 'vitest';
import type {
  DeliveryPreviewDto,
  DeliveryResultDto,
} from '../../packages/shared-types/src/index';
import { BattingPresentation } from '../../apps/web/src/features/match/core/batting-presentation';
import { stanceFrame } from '../../apps/web/src/features/match/core/batting-rig';
import {
  BATTING_ANIMATION_BY_SHOT,
  timeToContact,
} from '../../apps/web/src/features/match/config/batting-animations';
import { BattingTimingPredictor } from '../../apps/web/src/features/match/core/batting-timing';
import { PITCH } from '../../apps/web/src/features/match/config/visual-config';
import type { SceneEvent } from '../../apps/web/src/features/match/core/scene-port';
import {
  makeDelivery,
  makeOutcome,
  makeResult,
  makeShot,
  makeState,
} from '../match-visual/support';

const dist = (
  a: { u: number; v: number; z: number },
  b: { u: number; v: number; z: number },
) => Math.hypot(a.u - b.u, a.v - b.v, a.z - b.z);

function previewOf(
  overrides: Partial<ReturnType<typeof makeDelivery>> = {},
): DeliveryPreviewDto {
  const d = makeDelivery({
    actual: {
      target: { x: 0.5, y: 0.3 },
      line: 'middle',
      length: 'full',
      lineLabel: 'Middle',
      lengthLabel: 'Full',
    },
    speedMs: 34,
    speedKmh: 122.4,
    movement: { swing: 0, seam: 0, spin: 0 },
    bounce: 0.45,
    ...overrides,
  });
  return {
    sequence: 1,
    inningsNumber: 1,
    overNumber: 1,
    ballInOver: 1,
    bowler: {
      playerId: 'b',
      name: 'Bowler',
      style: 'right_arm_fast',
      styleName: 'Right-arm fast',
      arm: 'right',
      kind: 'fast',
    },
    delivery: {
      variationId: d.variationId,
      name: d.name,
      target: d.actual.target,
      line: d.actual.line,
      length: d.actual.length,
      lineLabel: d.actual.lineLabel,
      lengthLabel: d.actual.lengthLabel,
      speedMs: d.speedMs,
      speedKmh: d.speedKmh,
      movement: d.movement,
      bounce: d.bounce,
      bowlingArm: d.bowlingArm,
      battingHand: d.battingHand,
    },
    match: makeState(),
  };
}

function resultFor(
  preview: DeliveryPreviewDto,
  shotId: string,
  quality: DeliveryResultDto['shot']['contactQuality'],
  outcome = makeOutcome(),
): DeliveryResultDto {
  return makeResult({
    delivery: makeDelivery({
      actual: {
        target: preview.delivery.target,
        line: preview.delivery.line,
        length: preview.delivery.length,
        lineLabel: preview.delivery.lineLabel,
        lengthLabel: preview.delivery.lengthLabel,
      },
      speedMs: preview.delivery.speedMs,
      speedKmh: preview.delivery.speedKmh,
      movement: preview.delivery.movement,
      bounce: preview.delivery.bounce,
    }),
    shot: makeShot({
      shotId,
      contactQuality: quality,
      category: shotId.includes('lofted') ? 'lofted' : 'drive',
      worldDirection: 30,
    }),
    outcome,
  });
}

function harness(hand: 'right' | 'left' = 'right') {
  const events: {
    type: string;
    at: number;
    made?: boolean;
    quality?: string;
  }[] = [];
  let wall = 0;
  let timeline: { pitchTime: number; contactTime: number } | null = null;
  const camera: string[] = [];
  const p = new BattingPresentation({
    hand,
    reducedMotion: false,
    wallClock: () => wall,
    camera: (state) => void camera.push(state),
    emit: (e: SceneEvent) => {
      events.push({
        type: e.type,
        at: p.now() ?? -1,
        ...(e.type === 'BAT_CONTACT'
          ? { made: e.made, quality: e.quality }
          : {}),
      });
      if (e.type === 'BALL_TIMELINE') timeline = e;
    },
  });
  const dt = 1 / 60;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      wall += dt * 1000;
      p.update(dt);
    }
  };
  /** Millisecond steps: the ball crosses the bat in about one 60 fps frame, so contact needs a finer look. */
  const fine = (seconds: number, each: () => void = () => undefined) => {
    for (let i = 0; i < Math.round(seconds * 1000); i++) {
      wall += 1;
      p.update(0.001);
      each();
    }
  };
  const until = (done: () => boolean, max = 60 * 30) => {
    for (let i = 0; i < max && !done(); i++) step();
  };
  const order = () => events.map((e) => e.type);
  return {
    p,
    step,
    fine,
    until,
    events,
    order,
    camera,
    timeline: () => timeline!,
  };
}

/** Deliver, tap at the ideal moment (plus an error in seconds) and answer at once. */
function play(
  h: ReturnType<typeof harness>,
  shotId: string,
  quality: DeliveryResultDto['shot']['contactQuality'],
  options: {
    errorSeconds?: number;
    answerDelay?: number;
    preview?: DeliveryPreviewDto;
    outcome?: ReturnType<typeof makeOutcome>;
  } = {},
) {
  const preview = options.preview ?? previewOf();
  h.p.startDelivery(preview);
  h.until(() => h.events.some((e) => e.type === 'BALL_TIMELINE'));
  const predictor = new BattingTimingPredictor({
    ...h.timeline(),
    speedKmh: 120,
  });
  const tap = predictor.idealTapTime(shotId) + (options.errorSeconds ?? 0);
  h.until(() => (h.p.now() ?? 0) >= tap);
  expect(h.p.startSwing(shotId)).toBe(true);
  const result = resultFor(preview, shotId, quality, options.outcome);
  const delay = options.answerDelay ?? 0.03;
  h.until(() => (h.p.now() ?? 0) >= tap + delay);
  h.p.applyResult(result);
  return { preview, result, tap };
}

describe('batting presentation: one delivery, in order', () => {
  it('runs the whole sequence once and in order: release, timeline, commit, contact, exit, result, score, reset', () => {
    const h = harness();
    play(h, 'shot.straight_drive', 'good');
    h.until(() => h.events.some((e) => e.type === 'SEQUENCE_COMPLETE'));
    const order = h.order();
    const first = (t: string) => order.indexOf(t);
    for (const t of [
      'BALL_RELEASE',
      'BALL_TIMELINE',
      'SHOT_COMMITTED',
      'BAT_CONTACT',
      'CONTACT_PRESENTATION',
      'BALL_EXIT',
      'RESULT',
      'SCORE_UPDATE',
      'SEQUENCE_COMPLETE',
    ])
      expect(
        order.filter((x) => x === t),
        t,
      ).toHaveLength(1);
    expect(first('BALL_RELEASE')).toBeLessThan(first('BALL_TIMELINE'));
    expect(first('BALL_TIMELINE')).toBeLessThan(first('SHOT_COMMITTED'));
    expect(first('SHOT_COMMITTED')).toBeLessThan(first('CONTACT_PRESENTATION'));
    expect(first('CONTACT_PRESENTATION')).toBeLessThan(first('RESULT'));
    expect(first('RESULT')).toBeLessThan(first('SEQUENCE_COMPLETE'));
    // the score and banner come after contact, never before the ball reaches the bat
    expect(h.events[first('SCORE_UPDATE')]!.at).toBeGreaterThanOrEqual(
      h.events[first('CONTACT_PRESENTATION')]!.at,
    );
    expect(h.camera[0]).toBe('BowlerView');
    expect(h.camera).toContain('BallApproach');
    expect(h.camera).toContain('ShotFollow');
    expect(h.camera.at(-1)).toBe('Reset');
  });

  it('releases from the AI bowler’s hand and the ball starts there', () => {
    const h = harness();
    h.p.startDelivery(previewOf());
    h.until(() => h.events.some((e) => e.type === 'BALL_RELEASE'));
    const f = h.p.frame();
    expect(f.ball).not.toBeNull();
    expect(f.ball!.position.z).toBeGreaterThan(1.9);
    expect(f.ball!.position.z).toBeLessThan(2.5);
    expect(f.ball!.position.v).toBeLessThan(2);
  });

  it('a well-timed good shot: the bat’s sweet spot is on the ball at the moment of contact', () => {
    for (const hand of ['right', 'left'] as const)
      for (const [shot, quality] of [
        ['shot.straight_drive', 'good'],
        ['shot.straight_drive', 'perfect'],
        ['shot.cover_drive', 'good'],
      ] as const) {
        const h = harness(hand);
        const preview = previewOf(
          shot === 'shot.cover_drive'
            ? {
                actual: {
                  target: { x: 0.3, y: 0.3 },
                  line: 'outside_off',
                  length: 'full',
                  lineLabel: 'x',
                  lengthLabel: 'y',
                },
              }
            : {},
        );
        const hh = {
          ...preview,
          delivery: { ...preview.delivery, battingHand: hand },
        };
        play(h, shot, quality, { preview: hh });
        let best = Infinity;
        h.fine(0.9, () => {
          const f = h.p.frame();
          if (f.ball && f.batter.swinging)
            best = Math.min(best, dist(f.batter.sweetSpot, f.ball.position));
        });
        expect(best, `${hand} ${shot} ${quality}`).toBeLessThan(0.05);
      }
  });

  it('an edge meets the bat’s edge, not its middle', () => {
    const h = harness();
    play(h, 'shot.straight_drive', 'edge', {
      outcome: makeOutcome({ runsOffBat: 1, totalRuns: 1 }),
    });
    let at = 0;
    let atMiddle = 0;
    let edgeDist = Infinity;
    let i = 0;
    h.fine(0.9, () => {
      i++;
      const f = h.p.frame();
      if (!f.ball || !f.batter.swinging) return;
      const d = Math.min(
        dist(f.batter.insideEdge, f.ball.position),
        dist(f.batter.outsideEdge, f.ball.position),
      );
      if (d < edgeDist) {
        edgeDist = d;
        atMiddle = dist(f.batter.sweetSpot, f.ball.position);
        at = i;
      }
    });
    expect(at).toBeGreaterThan(0);
    expect(edgeDist).toBeLessThan(0.06);
    expect(atMiddle).toBeGreaterThan(0.03);
  });

  it('a miss shows daylight between bat and ball and the ball carries on past the bat', () => {
    const h = harness();
    play(h, 'shot.cover_drive', 'miss', {
      outcome: makeOutcome({
        runsOffBat: 0,
        totalRuns: 0,
        headline: 'DOT BALL',
      }),
    });
    let closest = Infinity;
    let lastV = 0;
    h.fine(0.9, () => {
      const f = h.p.frame();
      if (f.ball && f.batter.swinging)
        closest = Math.min(closest, dist(f.batter.sweetSpot, f.ball.position));
      if (f.ball) lastV = f.ball.position.v;
    });
    expect(closest).toBeGreaterThan(0.18);
    h.until(() => h.events.some((e) => e.type === 'SEQUENCE_COMPLETE'));
    expect(h.p.frame().ball!.position.v).toBeGreaterThan(PITCH.contactV);
    expect(lastV).toBeGreaterThan(0);
    expect(h.events.find((e) => e.type === 'BAT_CONTACT')).toMatchObject({
      made: false,
      quality: 'miss',
    });
  });

  it('a wide is never contact, however the engine scored the shot', () => {
    const h = harness();
    play(h, 'shot.cover_drive', 'good', {
      outcome: makeOutcome({
        runsOffBat: 0,
        extras: 1,
        totalRuns: 1,
        extraType: 'wide',
        legal: false,
        headline: 'WIDE',
      }),
    });
    h.until(() => h.events.some((e) => e.type === 'SEQUENCE_COMPLETE'));
    expect(h.events.find((e) => e.type === 'BAT_CONTACT')).toMatchObject({
      made: false,
    });
    expect(h.p.debug().plan?.contactMade).toBe(false);
  });

  it('bowled: the ball goes on to the stumps and the stumps are disturbed', () => {
    const h = harness();
    play(h, 'shot.forward_defensive', 'miss', {
      outcome: makeOutcome({
        runsOffBat: 0,
        totalRuns: 0,
        wicketType: 'bowled',
        headline: 'WICKET',
      }),
    });
    expect(h.p.debug().kind).toBe('bowled');
    h.until(() => h.events.some((e) => e.type === 'SEQUENCE_COMPLETE'));
    expect(h.p.frame().ball!.position.v).toBeGreaterThan(PITCH.length - 0.5);
    expect(h.p.frame().stumpsDisturbed).toBeGreaterThan(0.9);
    expect(h.camera).toContain('Wicket');
  });

  it('holds the swing and the ball together on the contact frame while the server has not answered, then carries on when it does', () => {
    const h = harness();
    const preview = previewOf();
    h.p.startDelivery(preview);
    h.until(() => h.events.some((e) => e.type === 'BALL_TIMELINE'));
    const predictor = new BattingTimingPredictor({
      ...h.timeline(),
      speedKmh: 120,
    });
    h.until(
      () => (h.p.now() ?? 0) >= predictor.idealTapTime('shot.straight_drive'),
    );
    h.p.startSwing('shot.straight_drive');
    // no answer for a long time
    const def = BATTING_ANIMATION_BY_SHOT.get('shot.straight_drive')!;
    h.step(60 * 2);
    expect(h.p.debug().animClock).toBeCloseTo(timeToContact(def), 6);
    expect(h.p.debug().pending).toBe(true);
    // the swing and the ball wait together on the contact frame: the ball does not slip past the bat
    const a = h.p.frame().ball!.position;
    h.step(10);
    const b = h.p.frame().ball!.position;
    expect(dist(a, b)).toBeLessThan(1e-9);
    expect(a.v).toBeGreaterThan(PITCH.contactV - 0.5);
    expect(a.v).toBeLessThan(PITCH.contactV + 0.5);
    h.p.applyResult(resultFor(preview, 'shot.straight_drive', 'good'));
    h.until(() => h.events.some((e) => e.type === 'SEQUENCE_COMPLETE'));
    expect(h.events.filter((e) => e.type === 'RESULT')).toHaveLength(1);
  });

  it('plays a missed deadline as a swing that comes too late: no input, the ball goes by, the cutoff fires once', () => {
    const h = harness();
    h.p.startDelivery(previewOf());
    h.until(() => h.events.some((e) => e.type === 'LATE_CUTOFF'));
    h.step(120);
    expect(h.events.filter((e) => e.type === 'LATE_CUTOFF')).toHaveLength(1);
    expect(h.p.debug().pending).toBe(false);
    expect(h.p.frame().ball!.position.v).toBeGreaterThan(PITCH.contactV);
  });

  it('refuses a second swing for the same ball and ignores a result before any swing started wrongly', () => {
    const h = harness();
    h.p.startDelivery(previewOf());
    expect(h.p.startSwing('shot.cover_drive')).toBe(false); // not released yet
    h.until(() => h.events.some((e) => e.type === 'BALL_TIMELINE'));
    expect(h.p.startSwing('shot.cover_drive')).toBe(true);
    expect(h.p.startSwing('shot.pull')).toBe(false);
    expect(h.events.filter((e) => e.type === 'SHOT_COMMITTED')).toHaveLength(1);
  });

  it('skip fires every remaining event once, in order, and a second skip does nothing', () => {
    const h = harness();
    play(h, 'shot.straight_drive', 'good');
    h.step(10);
    h.p.skip();
    h.p.skip();
    const order = h.order();
    for (const t of ['RESULT', 'SCORE_UPDATE', 'SEQUENCE_COMPLETE'])
      expect(
        order.filter((x) => x === t),
        t,
      ).toHaveLength(1);
    expect(order.at(-1)).toBe('SEQUENCE_COMPLETE');
    const rest = stanceFrame('right');
    h.step(5);
    const f = h.p.frame();
    expect(dist(f.batter.joints.pelvis, rest.joints.pelvis)).toBeLessThan(1e-6);
  });

  it('a retried result is replayed automatically: the same swing, the same ending', () => {
    const h = harness();
    const preview = previewOf();
    const result = resultFor(preview, 'shot.straight_drive', 'good');
    h.p.startDelivery(preview, {
      shotId: 'shot.straight_drive',
      errorSeconds: 0.02,
      result,
    });
    h.until(() => h.events.some((e) => e.type === 'SEQUENCE_COMPLETE'));
    expect(h.order().filter((x) => x === 'SHOT_COMMITTED')).toHaveLength(1);
    expect(h.order().filter((x) => x === 'RESULT')).toHaveLength(1);
  });

  it('timing error shows: an early swing meets the plane before the ball, a late one after it', () => {
    const when = (errorSeconds: number) => {
      const h = harness();
      play(h, 'shot.straight_drive', 'miss', { errorSeconds });
      h.until(() => h.events.some((e) => e.type === 'BAT_CONTACT'));
      const bat = h.events.find((e) => e.type === 'BAT_CONTACT')!.at;
      h.until(() => h.events.some((e) => e.type === 'CONTACT_PRESENTATION'));
      const ball = h.events.find((e) => e.type === 'CONTACT_PRESENTATION')!.at;
      return bat - ball;
    };
    expect(when(-0.12)).toBeLessThan(0);
    expect(when(0.12)).toBeGreaterThan(0);
    expect(Math.abs(when(0))).toBeLessThan(0.05);
  });

  it('a contact the engine reports meets the ball however the tap was timed: a late swing catches up, an early one waits', () => {
    for (const hand of ['right', 'left'] as const)
      for (const quality of ['perfect', 'good', 'okay', 'poor'] as const)
        for (const errorSeconds of [-0.2, -0.1, 0.1, 0.18]) {
          const h = harness(hand);
          const preview = previewOf();
          const hh = {
            ...preview,
            delivery: { ...preview.delivery, battingHand: hand },
          };
          play(h, 'shot.straight_drive', quality, {
            preview: hh,
            errorSeconds,
          });
          let best = Infinity;
          h.fine(0.9, () => {
            const f = h.p.frame();
            if (f.ball && f.batter.swinging)
              best = Math.min(best, dist(f.batter.sweetSpot, f.ball.position));
          });
          expect(best, `${hand} ${quality} ${errorSeconds}`).toBeLessThan(0.15);
          expect(
            h.events.filter((e) => e.type === 'BAT_CONTACT'),
            `${hand} ${quality} ${errorSeconds}`,
          ).toHaveLength(1);
        }
  });

  it('assist Auto times the swing: the batter holds the stance until the moment, then meets the ball', () => {
    const h = harness();
    const preview = previewOf();
    h.p.startDelivery(preview);
    h.until(() => h.events.some((e) => e.type === 'BALL_TIMELINE'));
    const predictor = new BattingTimingPredictor({
      ...h.timeline(),
      speedKmh: 120,
    });
    const ideal = predictor.idealTapTime('shot.straight_drive');
    // the player taps far too early; the system waits
    h.until(() => (h.p.now() ?? 0) >= 0.2);
    expect(h.p.startSwing('shot.straight_drive', undefined, ideal)).toBe(true);
    h.p.applyResult(resultFor(preview, 'shot.straight_drive', 'good'));
    h.until(() => (h.p.now() ?? 0) >= ideal - 0.05);
    expect(h.p.frame().batter.progress).toBeLessThan(0.05);
    let best = Infinity;
    h.fine(0.9, () => {
      const f = h.p.frame();
      if (f.ball && f.batter.swinging)
        best = Math.min(best, dist(f.batter.sweetSpot, f.ball.position));
    });
    expect(best).toBeLessThan(0.06);
  });

  it('a miss is NOT aligned: a swing made early or late stays early or late', () => {
    const closest = (errorSeconds: number) => {
      const h = harness();
      play(h, 'shot.straight_drive', 'miss', { errorSeconds });
      let best = Infinity;
      h.fine(0.9, () => {
        const f = h.p.frame();
        if (f.ball && f.batter.swinging)
          best = Math.min(best, dist(f.batter.sweetSpot, f.ball.position));
      });
      return best;
    };
    expect(closest(-0.15)).toBeGreaterThan(0.15);
    expect(closest(0.15)).toBeGreaterThan(0.15);
  });

  it('after 100 deliveries of every kind the batter is exactly where he started (no root drift)', () => {
    const shots = [...BATTING_ANIMATION_BY_SHOT.keys()];
    const qualities = [
      'perfect',
      'good',
      'okay',
      'poor',
      'edge',
      'miss',
    ] as const;
    const h = harness();
    const start = stanceFrame('right').joints.pelvis;
    for (let n = 0; n < 100; n++) {
      const shot = shots[n % shots.length]!;
      const quality = qualities[n % qualities.length]!;
      h.events.length = 0;
      play(h, shot, quality, { errorSeconds: ((n % 7) - 3) * 0.03 });
      h.until(() => h.events.some((e) => e.type === 'SEQUENCE_COMPLETE'));
      h.p.reset();
      const f = h.p.frame();
      expect(dist(f.batter.joints.pelvis, start), `delivery ${n}`).toBeLessThan(
        1e-9,
      );
      // the bat only sways a little, as it does in any stance
      expect(
        dist(f.batter.sweetSpot, stanceFrame('right').sweetSpot),
      ).toBeLessThan(0.02);
    }
  });

  it('the ball never jumps between frames anywhere in a delivery, including at contact', () => {
    for (const quality of ['perfect', 'edge', 'miss'] as const) {
      const h = harness();
      play(h, 'shot.straight_drive', quality);
      let last = h.p.frame().ball!.position;
      for (let i = 0; i < 600; i++) {
        h.step();
        const now = h.p.frame().ball!.position;
        expect(dist(last, now), `${quality} frame ${i}`).toBeLessThan(2.6);
        last = now;
        if (h.events.some((e) => e.type === 'SEQUENCE_COMPLETE')) break;
      }
    }
  });
});
