import { describe, expect, it } from 'vitest';
import {
  BowlingStateMachine,
  InvalidTransitionError,
} from '../../apps/web/src/features/match/core/bowling-state-machine';
import {
  executionScore,
  executionWindow,
  meterCursor,
} from '../../apps/web/src/features/match/core/timing-meter';
import { BowlingInputController } from '../../apps/web/src/features/match/core/bowling-input-controller';
import {
  ballAt,
  classifyOutcome,
  planTrajectory,
} from '../../apps/web/src/features/match/core/trajectory';
import {
  BowlingAnimator,
  bowlerFrameAt,
  resolveBowlingAnimation,
  timelineFor,
} from '../../apps/web/src/features/match/core/bowling-animation';
import type { AnimatorEvent } from '../../apps/web/src/features/match/core/bowling-animation';
import {
  batterFrameAt,
  clipForShot,
  resolveContactPresentation,
} from '../../apps/web/src/features/match/core/batter-animation';
import {
  MatchCameraController,
  CAMERA_PRESETS,
  framesAll,
} from '../../apps/web/src/features/match/core/camera-controller';
import {
  VisualEventQueue,
  resultBanner,
  scheduleSequence,
} from '../../apps/web/src/features/match/core/visual-events';
import { targetToWorld } from '../../apps/web/src/features/match/core/coordinates';
import { PITCH } from '../../apps/web/src/features/match/config/visual-config';
import { vec } from '../../apps/web/src/features/match/core/vec';
import { VIEWPORTS, makeDelivery, makeOutcome, makeShot } from './support';

const release = vec(0.16, 0.3, 2.1);

describe('bowling state machine', () => {
  it('only allows the legal transitions', () => {
    const m = new BowlingStateMachine();
    expect(() => m.transition('RESULT')).toThrow(InvalidTransitionError);
    m.transition('TARGETING');
    m.transition('READY');
    expect(() => m.transition('RESULT')).toThrow();
    m.transition('RUN_UP');
    expect(m.can('READY')).toBe(false);
    m.transition('RELEASED');
    m.transition('BALL_IN_FLIGHT');
    m.transition('PITCHED');
    m.transition('BATTER_ACTION');
    m.transition('RESULT');
    m.transition('RESETTING');
    m.transition('TARGETING');
    expect(m.inputOpen).toBe(true);
  });

  it('closes input from the moment the run-up starts and allows an abort back to targeting', () => {
    const m = new BowlingStateMachine('READY');
    m.transition('RUN_UP');
    expect(m.inputOpen).toBe(false);
    expect(m.tryTransition('TARGETING')).toBe(true);
    expect(m.inputOpen).toBe(true);
    expect(
      new BowlingStateMachine('BALL_IN_FLIGHT').tryTransition('TARGETING'),
    ).toBe(false);
  });
});

describe('execution meter', () => {
  const skilled = { accuracy: 90, control: 85, consistency: 80 };
  const novice = { accuracy: 30, control: 30, consistency: 30 };
  it('widens the perfect window with Accuracy, Control and Consistency, and with assist', () => {
    expect(executionWindow(skilled, 'medium', false)).toBeGreaterThan(
      executionWindow(novice, 'medium', false),
    );
    expect(executionWindow(novice, 'medium', true)).toBeGreaterThan(
      executionWindow(novice, 'medium', false),
    );
    expect(executionWindow(novice, 'high', false)).toBeLessThan(
      executionWindow(novice, 'low', false),
    );
    for (const s of [skilled, novice])
      for (const d of ['low', 'medium', 'high'] as const) {
        const w = executionWindow(s, d, true);
        expect(w).toBeGreaterThan(0);
        expect(w).toBeLessThanOrEqual(0.3);
      }
  });
  it('sweeps 0..1..0 deterministically and scores 1 in the window, 0 at the edges', () => {
    expect(meterCursor(0, 2)).toBe(0);
    expect(meterCursor(1, 2)).toBe(1);
    expect(meterCursor(2, 2)).toBeCloseTo(0, 9);
    expect(meterCursor(0.5, 2)).toBe(0.5);
    expect(meterCursor(Number.NaN, 2)).toBe(0.5);
    expect(executionScore(0.5, 0.1)).toBe(1);
    expect(executionScore(0.58, 0.1)).toBe(1);
    expect(executionScore(0, 0.1)).toBe(0);
    expect(executionScore(0.25, 0.1)).toBeGreaterThan(0);
    expect(executionScore(0.25, 0.1)).toBeLessThan(1);
  });
});

describe('bowling input controller', () => {
  const deliveries = [
    { id: 'delivery.fast.stock', difficulty: 'low', defaultLength: 'good' },
    { id: 'delivery.fast.yorker', difficulty: 'high', defaultLength: 'yorker' },
  ] as const;
  const make = () => {
    const input = new BowlingInputController();
    input.machine.transition('TARGETING');
    input.configure({
      bowlerId: 'b',
      deliveries,
      skills: { accuracy: 60, control: 60, consistency: 60 },
    });
    return input;
  };
  it('a second tap while the first delivery is running does nothing', () => {
    const input = make();
    const first = input.commit(1);
    expect(first).not.toBeNull();
    expect(input.machine.state).toBe('RUN_UP');
    expect(input.commit(1.01)).toBeNull();
    expect(input.commit(1.02)).toBeNull();
    expect(input.selectDelivery('delivery.fast.yorker')).toBe(false);
  });
  it('picking a yorker moves the aim to the batter’s toes and keeps the line', () => {
    const input = make();
    input.targetController.setLine('outside_off');
    input.selectDelivery('delivery.fast.yorker');
    const t = input.targetController.target;
    expect(t.x).toBeCloseTo(0.27, 9);
    expect(t.y).toBeCloseTo(0.06, 9);
  });
  it('sends a bounded execution score, and nothing at all in assist mode', () => {
    const input = make();
    input.startMeter(0);
    const out = input.commit(input.meterPeriod / 4)!;
    expect(out.executionInput).toBeGreaterThanOrEqual(0);
    expect(out.executionInput).toBeLessThanOrEqual(1);
    const assisted = make();
    assisted.setAssist(true);
    expect(assisted.commit(0.4)!.executionInput).toBeUndefined();
  });
  it('refuses to bowl without a bowler or delivery', () => {
    const input = new BowlingInputController();
    input.machine.transition('TARGETING');
    expect(input.commit(0)).toBeNull();
  });
});

describe('ball trajectory', () => {
  const plan = (
    d = makeDelivery(),
    s = makeShot(),
    o = makeOutcome(),
    hand: 'right' | 'left' = 'right',
  ) => planTrajectory({ delivery: d, shot: s, outcome: o, release, hand });

  it('pitches exactly on the engine’s actual target, not the aimed one', () => {
    for (const hand of ['right', 'left'] as const)
      for (const actual of [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.5 },
        { x: 0.9, y: 0.9 },
        { x: 0.3, y: 0.02 },
      ]) {
        const d = makeDelivery({
          actual: { ...makeDelivery().actual, target: actual },
        });
        const p = plan(d, makeShot(), makeOutcome(), hand);
        const expected = targetToWorld(actual, hand);
        expect(p.pitchPoint.u).toBeCloseTo(expected.u, 9);
        expect(p.pitchPoint.v).toBeCloseTo(expected.v, 9);
        const atPitch = ballAt(p, p.pitchTime);
        expect(atPitch.u).toBeCloseTo(expected.u, 6);
        expect(atPitch.v).toBeCloseTo(expected.v, 6);
        expect(atPitch.z).toBeCloseTo(0, 6);
      }
  });

  it('starts at the release point and never produces NaN or underground points', () => {
    const p = plan();
    const start = ballAt(p, 0);
    expect(start.u).toBeCloseTo(release.u, 9);
    expect(start.v).toBeCloseTo(release.v, 9);
    expect(start.z).toBeCloseTo(release.z, 9);
    for (let t = 0; t <= p.duration + 0.5; t += 0.01) {
      const b = ballAt(p, t);
      for (const n of [b.u, b.v, b.z]) expect(Number.isFinite(n)).toBe(true);
      expect(b.z).toBeGreaterThanOrEqual(0);
    }
  });

  it('a faster ball arrives sooner than a spinner, with the same pace ratio preserved', () => {
    const fast = plan(makeDelivery({ speedMs: 40, speedKmh: 144 }));
    const medium = plan(makeDelivery({ speedMs: 30, speedKmh: 108 }));
    const spin = plan(makeDelivery({ speedMs: 18, speedKmh: 64.8 }));
    expect(fast.flightTime).toBeLessThan(medium.flightTime);
    expect(medium.flightTime).toBeLessThan(spin.flightTime);
    expect(spin.flightTime / fast.flightTime).toBeGreaterThan(1.5);
  });

  it('swings away for outswing and into the batter for inswing, mirrored by handedness', () => {
    // the late sideways velocity of the ball just before it lands, relative to a ball that does not swing
    const lateCurl = (swing: number, hand: 'right' | 'left') => {
      const p = plan(
        makeDelivery({ movement: { swing, seam: 0, spin: 0 } }),
        makeShot(),
        makeOutcome(),
        hand,
      );
      const straight = plan(
        makeDelivery({ movement: { swing: 0, seam: 0, spin: 0 } }),
        makeShot(),
        makeOutcome(),
        hand,
      );
      const a = p.pitchTime * 0.9;
      const b = p.pitchTime * 0.999;
      return (
        ballAt(p, b).u -
        ballAt(p, a).u -
        (ballAt(straight, b).u - ballAt(straight, a).u)
      );
    };
    const outRight = lateCurl(-0.3, 'right');
    const inRight = lateCurl(0.3, 'right');
    const outLeft = lateCurl(-0.3, 'left');
    // a right-hander's off side is the viewer's left (negative), a left-hander's is the right
    expect(outRight).toBeLessThan(0);
    expect(inRight).toBeGreaterThan(0);
    expect(outLeft).toBeGreaterThan(0);
    expect(lateCurl(0, 'right')).toBeCloseTo(0, 9);
    // and swing never changes where the ball pitches
    const swung = plan(
      makeDelivery({ movement: { swing: -0.3, seam: 0, spin: 0 } }),
    );
    const straight = plan(
      makeDelivery({ movement: { swing: 0, seam: 0, spin: 0 } }),
    );
    expect(swung.pitchPoint).toEqual(straight.pitchPoint);
  });

  it('shows seam and spin deviation after the bounce, larger spin turning more', () => {
    const stock = plan(
      makeDelivery({ movement: { swing: 0, seam: 0, spin: 0 } }),
    );
    const small = plan(
      makeDelivery({ movement: { swing: 0, seam: 0, spin: 0.1 } }),
    );
    const large = plan(
      makeDelivery({ movement: { swing: 0, seam: 0, spin: 0.4 } }),
    );
    const dev = (p: ReturnType<typeof plan>) =>
      Math.abs(p.arrival.u - p.pitchPoint.u);
    expect(dev(stock)).toBe(0);
    expect(dev(large)).toBeGreaterThan(dev(small));
    expect(dev(large)).toBeLessThanOrEqual(0.9 + 1e-9);
  });

  it('bounces higher on a Hard pitch value and from shorter lengths', () => {
    const low = plan(makeDelivery({ bounce: 0.2 }));
    const high = plan(makeDelivery({ bounce: 0.9 }));
    expect(high.arrival.z).toBeGreaterThan(low.arrival.z);
    const peak = (p: ReturnType<typeof plan>) => {
      let max = 0;
      for (let t = p.pitchTime; t <= p.flightTime; t += 0.005)
        max = Math.max(max, ballAt(p, t).z);
      return max;
    };
    expect(peak(high)).toBeGreaterThan(peak(low));
  });

  it('a yorker lands at the batter’s toes and a bouncer well short of them', () => {
    const yorker = plan(
      makeDelivery({
        actual: { ...makeDelivery().actual, target: { x: 0.5, y: 0.04 } },
      }),
    );
    const bouncer = plan(
      makeDelivery({
        actual: { ...makeDelivery().actual, target: { x: 0.5, y: 0.95 } },
      }),
    );
    expect(PITCH.contactV - yorker.pitchPoint.v).toBeLessThan(1);
    expect(PITCH.contactV - bouncer.pitchPoint.v).toBeGreaterThan(8);
  });

  it('ends at the stumps for bowled, at the pads for lbw, and visibly passes the bat for a miss', () => {
    const bowled = plan(
      makeDelivery(),
      makeShot({ contactQuality: 'miss' }),
      makeOutcome({
        runsOffBat: 0,
        totalRuns: 0,
        wicketType: 'bowled',
        headline: 'WICKET',
      }),
    );
    expect(bowled.kind).toBe('bowled');
    expect(bowled.arrival.v).toBeCloseTo(PITCH.length, 9);
    expect(Math.abs(bowled.arrival.u)).toBeLessThan(0.25);
    const lbw = plan(
      makeDelivery(),
      makeShot({ contactQuality: 'miss' }),
      makeOutcome({
        runsOffBat: 0,
        totalRuns: 0,
        wicketType: 'lbw',
        headline: 'WICKET',
      }),
    );
    expect(lbw.kind).toBe('lbw');
    expect(lbw.arrival.v).toBeCloseTo(PITCH.contactV + 0.05, 9);
    const miss = plan(
      makeDelivery(),
      makeShot({ contactQuality: 'miss' }),
      makeOutcome({ runsOffBat: 0, totalRuns: 0, headline: 'DOT BALL' }),
    );
    expect(miss.kind).toBe('miss');
    const end = ballAt(miss, miss.duration);
    expect(end.v).toBeGreaterThan(PITCH.contactV);
  });

  it('classifies every outcome, and a six leaves the ground while a four stays on it', () => {
    const six = plan(
      makeDelivery(),
      makeShot({ category: 'lofted' }),
      makeOutcome({
        runsOffBat: 6,
        totalRuns: 6,
        headline: 'SIX',
        distanceClass: 'six',
      }),
    );
    const four = plan(
      makeDelivery(),
      makeShot(),
      makeOutcome({
        runsOffBat: 4,
        totalRuns: 4,
        headline: 'FOUR',
        distanceClass: 'boundary',
      }),
    );
    expect(six.kind).toBe('six');
    expect(four.kind).toBe('boundary');
    const maxZ = (p: ReturnType<typeof plan>) => {
      let m = 0;
      for (let t = p.flightTime; t <= p.duration; t += 0.01)
        m = Math.max(m, ballAt(p, t).z);
      return m;
    };
    expect(maxZ(six)).toBeGreaterThan(5);
    expect(maxZ(four)).toBeLessThan(1.5);
    expect(
      classifyOutcome(
        makeShot(),
        makeOutcome({
          extraType: 'wide',
          extras: 1,
          runsOffBat: 0,
          totalRuns: 1,
          legal: false,
        }),
      ),
    ).toBe('wide');
    expect(
      classifyOutcome(makeShot({ contactQuality: 'edge' }), makeOutcome()),
    ).toBe('edge');
    expect(
      classifyOutcome(
        makeShot({ category: 'defensive' }),
        makeOutcome({ runsOffBat: 0 }),
      ),
    ).toBe('defence');
    expect(
      classifyOutcome(makeShot(), makeOutcome({ wicketType: 'caught' })),
    ).toBe('caught');
  });

  it('is reproducible: the same inputs give the same path', () => {
    const a = plan();
    const b = plan();
    expect(a.events).toEqual(b.events);
    expect(a.duration).toBe(b.duration);
    for (let t = 0; t <= a.duration; t += 0.05)
      expect(ballAt(a, t)).toEqual(ballAt(b, t));
  });
});

describe('bowling animations and the release marker', () => {
  const play = (
    kind: 'fast' | 'medium' | 'spin',
    arm: 'right' | 'left',
    holdUntil = 0,
  ) => {
    const animator = new BowlingAnimator(timelineFor(kind, arm, 0.68));
    const events: AnimatorEvent[] = [];
    let polls = 0;
    animator.on((e) => {
      events.push(e);
      if (e.type === 'BALL_RELEASE') {
        polls++;
        return polls > holdUntil;
      }
      return undefined;
    });
    animator.start();
    let t = 0;
    while (animator.isActive && t < 10) {
      animator.update(1 / 60);
      t += 1 / 60;
    }
    return { animator, events, t };
  };

  it('releases exactly once, at the marker, from the bowling hand', () => {
    const { events } = play('fast', 'right');
    const releases = events.filter((e) => e.type === 'BALL_RELEASE');
    expect(releases).toHaveLength(1);
    const hand = (
      releases[0] as Extract<AnimatorEvent, { type: 'BALL_RELEASE' }>
    ).hand;
    // above the head, over the bowler's shoulder, at the crease: not the chest, not behind the player
    expect(hand.z).toBeGreaterThan(1.9);
    expect(hand.z).toBeLessThan(2.45);
    expect(hand.v).toBeGreaterThan(-0.5);
    expect(hand.v).toBeLessThan(1.2);
    expect(hand.u).toBeGreaterThan(0);
    expect(events.at(-1)!.type).toBe('ANIMATION_COMPLETE');
    expect(events[0]!.type).toBe('RUN_UP_STARTED');
    expect(
      events.map((e) => e.type).indexOf('FOLLOW_THROUGH_STARTED'),
    ).toBeGreaterThan(events.map((e) => e.type).indexOf('BALL_RELEASE'));
  });

  it('a left-arm bowler releases from the left, on the other side of the stumps', () => {
    const right = play('fast', 'right').events.find(
      (e) => e.type === 'BALL_RELEASE',
    ) as Extract<AnimatorEvent, { type: 'BALL_RELEASE' }>;
    const left = play('fast', 'left').events.find(
      (e) => e.type === 'BALL_RELEASE',
    ) as Extract<AnimatorEvent, { type: 'BALL_RELEASE' }>;
    expect(right.hand.u).toBeGreaterThan(0);
    expect(left.hand.u).toBeLessThan(0);
    expect(left.hand.u).toBeCloseTo(-right.hand.u, 1);
  });

  it('holds at the release marker until the listener says the server has replied, then carries on', () => {
    const { events, animator } = play('fast', 'right', 30);
    const releases = events.filter((e) => e.type === 'BALL_RELEASE');
    expect(releases.length).toBe(31);
    expect(animator.isActive).toBe(false);
    expect(events.at(-1)!.type).toBe('ANIMATION_COMPLETE');
  });

  it('can be cancelled before release without ever releasing the ball', () => {
    const animator = new BowlingAnimator(timelineFor('fast', 'right', 0.68));
    const events: AnimatorEvent[] = [];
    animator.on((e) => void events.push(e));
    animator.start();
    animator.update(0.4);
    animator.cancel();
    animator.update(5);
    expect(events.some((e) => e.type === 'BALL_RELEASE')).toBe(false);
    expect(events.at(-1)!.type).toBe('ANIMATION_CANCELLED');
    expect(animator.isActive).toBe(false);
  });

  it('gives a fast bowler a longer run-up than a spinner, and the spinner a shorter action', () => {
    const fast = timelineFor('fast', 'right', 0.68);
    const spin = timelineFor('spin', 'right', 0.6);
    expect(fast.runUpDistance).toBeGreaterThan(spin.runUpDistance);
    expect(fast.runUpSeconds).toBeGreaterThan(spin.runUpSeconds);
    // he waits at the crease while the player aims, then walks back to his mark
    expect(bowlerFrameAt(fast, 0).pose.pelvis.v).toBeCloseTo(-0.4, 1);
    expect(bowlerFrameAt(fast, fast.walkBackSeconds).pose.pelvis.v).toBeCloseTo(
      -fast.runUpDistance,
      1,
    );
    expect(bowlerFrameAt(fast, fast.walkBackSeconds / 2).phase).toBe(
      'walk_back',
    );
  });

  it('feet do not slide: the bowler ends the run-up at the crease, not far past it', () => {
    const tl = timelineFor('fast', 'right', 0.68);
    const atRunEnd = bowlerFrameAt(
      tl,
      tl.walkBackSeconds + tl.runUpSeconds - 0.001,
    );
    expect(Math.abs(atRunEnd.pose.pelvis.v)).toBeLessThan(0.4);
  });

  it('maps every bowling style to an animation, and falls back safely when an asset is missing', () => {
    for (const style of [
      'right_arm_fast',
      'left_arm_fast',
      'right_arm_medium',
      'left_arm_medium',
      'off_spin',
      'leg_spin',
      'left_arm_orthodox',
      'left_arm_wrist_spin',
    ]) {
      const resolved = resolveBowlingAnimation(style);
      expect(resolved.fallback).toBe(false);
      expect(resolved.definition.releaseMarker).toBeGreaterThan(0);
      expect(resolved.definition.releaseMarker).toBeLessThan(1);
    }
    const missing = resolveBowlingAnimation(
      'left_arm_fast',
      new Set(['bowler.fast.left.delivery']),
    );
    expect(missing.fallback).toBe(true);
    expect(missing.clip.arm).toBe('left');
    const unknown = resolveBowlingAnimation('underarm_lob');
    expect(unknown.fallback).toBe(true);
    expect(unknown.clip).toBeDefined();
  });
});

describe('batter presentation', () => {
  const arrival = vec(0.1, PITCH.contactV, 0.8);
  it('maps every engine shot to a clip, and reports unknown shots as fallbacks', () => {
    for (const id of [
      'shot.forward_defensive',
      'shot.cover_drive',
      'shot.pull',
      'shot.hook',
      'shot.cut',
      'shot.flick',
      'shot.lofted_straight',
      'shot.lofted_off_side',
      'shot.lofted_leg_side',
      'shot.on_drive',
      'shot.straight_drive',
      'shot.back_foot_defensive',
    ])
      expect(clipForShot(id, 'drive').fallback).toBe(false);
    expect(clipForShot('shot.reverse_sweep', 'cross_bat')).toEqual({
      clip: 'pull',
      fallback: true,
    });
    expect(
      new Set(
        [
          'shot.cover_drive',
          'shot.pull',
          'shot.lofted_straight',
          'shot.forward_defensive',
        ].map((s) => clipForShot(s, 'x').clip),
      ).size,
    ).toBe(4);
  });
  it('makes contact for good shots, an edge for an edge, and shows daylight for a miss', () => {
    const hit = resolveContactPresentation(
      makeShot({ contactQuality: 'perfect' }),
      arrival,
      'ground',
      'right',
    );
    expect(hit.contactMade).toBe(true);
    expect(hit.separation).toBeLessThan(0.03);
    const edge = resolveContactPresentation(
      makeShot({ contactQuality: 'edge' }),
      arrival,
      'edge',
      'right',
    );
    expect(edge.contactMade).toBe(true);
    expect(Math.abs(edge.tilt)).toBeGreaterThan(0.2);
    expect(edge.separation).toBeGreaterThan(hit.separation);
    const miss = resolveContactPresentation(
      makeShot({ contactQuality: 'miss' }),
      arrival,
      'miss',
      'right',
    );
    expect(miss.contactMade).toBe(false);
    expect(miss.separation).toBeGreaterThanOrEqual(0.4);
    expect(miss.batContact).not.toEqual(arrival);
  });
  it('the bat tip reaches the contact point at the moment of contact', () => {
    const p = resolveContactPresentation(
      makeShot({ contactQuality: 'perfect' }),
      arrival,
      'ground',
      'right',
    );
    const frame = batterFrameAt({ hand: 'right' }, p, 0);
    expect(frame.batTip.v).toBeCloseTo(p.batContact.v, 6);
    expect(frame.batTip.z).toBeCloseTo(p.batContact.z, 6);
    for (const n of Object.values(
      batterFrameAt({ hand: 'left' }, p, 0.2).joints,
    ).flatMap((j) => [j.u, j.v, j.z]))
      expect(Number.isFinite(n)).toBe(true);
  });
  it('stands in a stance when there is no shot, and mirrors for a left-hander', () => {
    const r = batterFrameAt({ hand: 'right' }, null, 0);
    const l = batterFrameAt({ hand: 'left' }, null, 0);
    expect(r.swinging).toBe(false);
    expect(Math.sign(r.batGrip.u - r.joints.pelvis.u)).toBe(
      -Math.sign(l.batGrip.u - l.joints.pelvis.u),
    );
  });
});

describe('visual events and camera', () => {
  const plan = () =>
    planTrajectory({
      delivery: makeDelivery(),
      shot: makeShot(),
      outcome: makeOutcome(),
      release,
      hand: 'right',
    });
  it('fires each event once, in order, and the score update never comes before the ball reaches the bat', () => {
    const p = plan();
    const events = scheduleSequence(p, { lead: 0.34 });
    const times = Object.fromEntries(events.map((e) => [e.type, e.time]));
    expect(times.SCORE_UPDATE).toBeGreaterThanOrEqual(times.BALL_NEAR_BATTER!);
    expect(times.RESULT).toBeGreaterThanOrEqual(times.CONTACT_PRESENTATION!);
    expect(times.BALL_PITCH).toBeLessThan(times.BALL_NEAR_BATTER!);
    expect(times.SEQUENCE_COMPLETE).toBeGreaterThan(times.SCORE_UPDATE!);
    expect(events.map((e) => e.time)).toEqual(
      [...events.map((e) => e.time)].sort((a, b) => a - b),
    );
    const queue = new VisualEventQueue();
    queue.schedule(events);
    const seen: string[] = [];
    for (let i = 0; i < 1000 && !queue.empty; i++)
      seen.push(...queue.advance(0.02).map((e) => e.type));
    expect(seen).toHaveLength(events.length);
    expect(new Set(seen).size).toBe(events.length);
  });
  it('skipping flushes the remaining events exactly once and never repeats them', () => {
    const queue = new VisualEventQueue();
    queue.schedule(scheduleSequence(plan(), { lead: 0.34 }));
    const first = queue.advance(0.01).map((e) => e.type);
    const flushed = queue.flush().map((e) => e.type);
    expect(queue.flush()).toEqual([]);
    expect(queue.advance(100)).toEqual([]);
    expect(new Set([...first, ...flushed]).size).toBe(
      [...first, ...flushed].length,
    );
    expect(flushed.at(-1)).toBe('SEQUENCE_COMPLETE');
  });
  it('states the result as text for every kind of ball', () => {
    expect(
      resultBanner(
        makeOutcome({ runsOffBat: 4, totalRuns: 4, headline: 'FOUR' }),
      ).tone,
    ).toBe('boundary');
    expect(
      resultBanner(
        makeOutcome({ runsOffBat: 6, totalRuns: 6, headline: 'SIX' }),
      ).tone,
    ).toBe('six');
    expect(
      resultBanner(
        makeOutcome({ runsOffBat: 0, totalRuns: 0, headline: 'DOT BALL' }),
      ).tone,
    ).toBe('dot');
    const w = resultBanner(
      makeOutcome({
        runsOffBat: 0,
        totalRuns: 0,
        wicketType: 'bowled',
        headline: 'WICKET',
        detail: 'Bowled - Cover Drive, a miss',
      }),
    );
    expect(w.tone).toBe('wicket');
    expect(w.announcement).toContain('WICKET');
    expect(w.announcement).toContain('Bowled');
    expect(
      resultBanner(
        makeOutcome({
          runsOffBat: 0,
          extras: 1,
          totalRuns: 1,
          extraType: 'wide',
          legal: false,
          headline: 'WIDE',
        }),
      ).tone,
    ).toBe('extra');
  });
  it('keeps what matters inside the frame in every camera state at every supported size', () => {
    const fast = timelineFor('fast', 'right', 0.68);
    const spin = timelineFor('spin', 'left', 0.6);
    const at = (tl: typeof fast, t: number) => bowlerFrameAt(tl, t);
    const releaseAt = (tl: typeof fast) =>
      tl.walkBackSeconds +
      tl.runUpSeconds +
      tl.deliverySeconds * tl.releaseMarker;
    const batterHead = vec(0, 19.35, 1.85);
    const farEnd = vec(0, PITCH.length, 0);
    const targets = [
      targetToWorld({ x: 0, y: 1 }, 'right'),
      targetToWorld({ x: 1, y: 1 }, 'right'),
      targetToWorld({ x: 0, y: 0 }, 'right'),
      targetToWorld({ x: 1, y: 0 }, 'right'),
    ];
    for (const viewport of VIEWPORTS) {
      const name = viewport.name;
      // aiming: bowler at his crease, every targetable corner, the batter
      expect(
        framesAll(
          [
            at(fast, 0).pose.head,
            at(fast, 0).pose.footLeft,
            batterHead,
            farEnd,
            ...targets,
          ],
          CAMERA_PRESETS.PreDelivery,
          viewport,
          0,
        ),
        `aim ${name}`,
      ).toBe(true);
      // run-up: the bowler at his mark and in full stride, then the release hand
      for (const tl of [fast, spin]) {
        const pts = [
          at(tl, tl.walkBackSeconds).pose.head,
          at(tl, tl.walkBackSeconds).pose.footLeft,
          at(tl, tl.walkBackSeconds + tl.runUpSeconds * 0.5).pose.head,
          at(tl, releaseAt(tl)).hand,
          at(tl, releaseAt(tl)).pose.head,
          batterHead,
        ];
        expect(
          framesAll(pts, CAMERA_PRESETS.RunUp, viewport, 0),
          `run-up ${tl.kind} ${name}`,
        ).toBe(true);
        expect(
          framesAll(
            [
              at(tl, releaseAt(tl)).hand,
              at(tl, releaseAt(tl)).pose.footRight,
              batterHead,
            ],
            CAMERA_PRESETS.Release,
            viewport,
            0,
          ),
          `release ${tl.kind} ${name}`,
        ).toBe(true);
      }
      // batter and result shots keep the stumps and the batter in view
      expect(
        framesAll(
          [batterHead, vec(0, PITCH.length, 0.4)],
          CAMERA_PRESETS.Batter,
          viewport,
          0,
        ),
        `batter ${name}`,
      ).toBe(true);
      expect(
        framesAll(
          [batterHead, farEnd, at(fast, 0).pose.head],
          CAMERA_PRESETS.Result,
          viewport,
          0,
        ),
        `result ${name}`,
      ).toBe(true);
    }
  });
  it('blends between states and, with reduced motion, never moves', () => {
    const cam = new MatchCameraController(false);
    cam.snapTo('PreDelivery');
    cam.setState('Batter');
    const v0 = cam.update(0.01).camV;
    const v1 = cam.update(2).camV;
    expect(v0).not.toBe(v1);
    expect(v1).toBeCloseTo(CAMERA_PRESETS.Batter.camV, 6);
    const still = new MatchCameraController(true);
    still.snapTo('PreDelivery');
    still.setState('Batter');
    expect(still.update(2).camV).toBeCloseTo(
      CAMERA_PRESETS.PreDelivery.camV,
      6,
    );
  });
});
