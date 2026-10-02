import { describe, expect, it } from 'vitest';
import {
  BATTING_INPUT,
  SHOTS,
  lineCenter,
} from '../../packages/game-core/src/index';
import {
  BATTING_ANIMATIONS,
  BATTING_ANIMATION_BY_SHOT,
  CONTACT_ASSIST,
  CONTACT_FORWARD,
  timeToContact,
} from '../../apps/web/src/features/match/config/batting-animations';
import {
  NO_ADJUST,
  adjustWeight,
  contactSweetSpotRel,
  relToWorld,
  stanceFrame,
  swingFrame,
  swingTotalSeconds,
  worldToRel,
} from '../../apps/web/src/features/match/core/batting-rig';
import {
  presentContact,
  withinLimits,
} from '../../apps/web/src/features/match/core/contact-assist';
import type { ContactQuality } from '../../apps/web/src/features/match/core/contact-assist';
import {
  MANUAL_SHOTS,
  selectShot,
  shotHint,
  suggestedAction,
} from '../../apps/web/src/features/match/core/batting-shot-selector';
import {
  BattingTimingPredictor,
  timingCategory,
} from '../../apps/web/src/features/match/core/batting-timing';
import {
  BattingStateMachine,
  InvalidBattingTransition,
} from '../../apps/web/src/features/match/core/batting-state-machine';
import { BattingInputController } from '../../apps/web/src/features/match/core/batting-input-controller';
import { BallPath } from '../../apps/web/src/features/match/core/ball-path';
import { cuesForResult } from '../../apps/web/src/features/match/core/match-sound';
import {
  planExit,
  planIncoming,
} from '../../apps/web/src/features/match/core/trajectory';
import { vec } from '../../apps/web/src/features/match/core/vec';
import { makeDelivery, makeOutcome, makeShot } from '../match-visual/support';

const HANDS = ['right', 'left'] as const;
const HEIGHTS: Record<string, number[]> = {
  yorker: [0.2, 0.3],
  full: [0.3, 0.45],
  good: [0.6, 0.8],
  short: [0.95, 1.15],
  bouncer: [1.25, 1.45],
};
const offOf = (x: number) => -(x - 0.5) * 3.2;

describe('batting animation metadata', () => {
  it('defines every Module 0 shot, with a real contact frame and a recovery', () => {
    expect(BATTING_ANIMATIONS).toHaveLength(SHOTS.length);
    for (const shot of SHOTS) {
      const def = BATTING_ANIMATION_BY_SHOT.get(shot.id)!;
      expect(def, shot.id).toBeDefined();
      expect(def.contactNormalizedTime).toBeGreaterThan(0.2);
      expect(def.contactNormalizedTime).toBeLessThan(0.7);
      expect(def.duration).toBeGreaterThan(0.6);
      expect(def.recoveryTime).toBeGreaterThan(0.1);
      expect(def.animationId).toMatch(/^bat\./);
      expect(def.compatibleLines).toEqual(shot.idealLines);
      expect(def.compatibleLengths).toEqual(shot.idealLengths);
      // the swing is short enough that the bounce can still be read before committing
      expect(timeToContact(def)).toBeLessThan(0.6);
    }
  });
});

describe('batting rig', () => {
  it.each(HANDS)(
    'puts the sweet spot exactly on the ideal contact point at the contact frame (%s-hander)',
    (hand) => {
      for (const def of BATTING_ANIMATIONS) {
        const frame = swingFrame(
          {
            shotId: def.shotId,
            hand,
            adjust: NO_ADJUST,
            speed: 1,
            contactShift: { off: 0, fwd: 0, z: 0 },
          },
          timeToContact(def),
          hand,
        );
        const rel = worldToRel(frame.sweetSpot, hand);
        expect(rel.off, def.shotId).toBeCloseTo(def.idealContact.off, 6);
        expect(rel.z, def.shotId).toBeCloseTo(def.idealContact.height, 6);
        expect(rel.fwd, def.shotId).toBeCloseTo(CONTACT_FORWARD, 6);
      }
    },
  );

  it('a left-hander is an exact mirror of a right-hander for every shot and every moment', () => {
    for (const def of BATTING_ANIMATIONS)
      for (const t of [
        0,
        0.15,
        timeToContact(def),
        def.duration * 0.8,
        def.duration + 0.1,
      ]) {
        const spec = (hand: 'right' | 'left') => ({
          shotId: def.shotId,
          hand,
          adjust: {
            ...NO_ADJUST,
            rootOff: 0.05,
            shoulderYaw: 0.05,
            batRotation: 0.05,
          },
          speed: 1,
          contactShift: { off: 0.04, fwd: 0, z: 0.02 },
        });
        const r = swingFrame(spec('right'), t, 'right');
        const l = swingFrame(spec('left'), t, 'left');
        for (const [name, joint] of Object.entries(r.joints)) {
          const other = l.joints[name as keyof typeof l.joints];
          expect(other.u, `${def.shotId} ${name}`).toBeCloseTo(-joint.u, 9);
          expect(other.v).toBeCloseTo(joint.v, 9);
          expect(other.z).toBeCloseTo(joint.z, 9);
        }
        expect(l.sweetSpot.u).toBeCloseTo(-r.sweetSpot.u, 9);
      }
  });

  it('starts in the stance and returns to exactly the stance, leaving no correction behind', () => {
    for (const hand of HANDS)
      for (const def of BATTING_ANIMATIONS) {
        const spec = {
          shotId: def.shotId,
          hand,
          adjust: {
            rootOff: 0.1,
            rootFwd: 0.1,
            rootDown: 0.1,
            hipYaw: 0.12,
            shoulderYaw: 0.12,
            upperBodyPitch: 0.1,
            batRotation: 0.15,
          },
          speed: 1.08,
          contactShift: { off: 0.2, fwd: 0, z: -0.3 },
        };
        const stance = stanceFrame(hand);
        const before = swingFrame(spec, -0.2, hand);
        const after = swingFrame(
          spec,
          swingTotalSeconds(def.shotId, 1.08) + 0.05,
          hand,
        );
        for (const key of Object.keys(
          stance.joints,
        ) as (keyof typeof stance.joints)[]) {
          for (const axis of ['u', 'v', 'z'] as const) {
            expect(before.joints[key][axis]).toBeCloseTo(
              stance.joints[key][axis],
              9,
            );
            expect(after.joints[key][axis], `${def.shotId} ${key}`).toBeCloseTo(
              stance.joints[key][axis],
              9,
            );
          }
        }
        // the additive weight is zero until the backlift is done and zero again at the end of the clip
        expect(adjustWeight(def, 0)).toBe(0);
        expect(adjustWeight(def, def.contactNormalizedTime * 0.45)).toBe(0);
        expect(adjustWeight(def, def.contactNormalizedTime)).toBe(1);
        expect(adjustWeight(def, 1)).toBe(0);
      }
  });

  it('100 shots in a row never move the batter off the crease (no cumulative drift)', () => {
    let worst = 0;
    const origin = stanceFrame('right').joints.pelvis;
    for (let n = 0; n < 120; n++) {
      const def = BATTING_ANIMATIONS[n % BATTING_ANIMATIONS.length]!;
      const spec = {
        shotId: def.shotId,
        hand: 'right' as const,
        adjust: { ...NO_ADJUST, rootOff: 0.12, rootFwd: 0.12 },
        speed: 1,
        contactShift: { off: 0, fwd: 0, z: 0 },
      };
      swingFrame(spec, def.duration * 0.5, 'right');
      const rest = swingFrame(
        spec,
        swingTotalSeconds(def.shotId) + 0.01,
        'right',
      ).joints.pelvis;
      worst = Math.max(
        worst,
        Math.hypot(rest.u - origin.u, rest.v - origin.v, rest.z - origin.z),
      );
    }
    expect(worst).toBeLessThan(1e-9);
  });
});

describe('contact presentation (the bat meets the ball, small and believable)', () => {
  const ballFor = (off: number, z: number, hand: 'right' | 'left') =>
    relToWorld({ off, fwd: CONTACT_FORWARD, z }, hand);

  it.each(HANDS)(
    'a forced Perfect contact is met by the bat for every shot against every delivery it is meant for (%s)',
    (hand) => {
      let checked = 0;
      let supported = 0;
      for (const def of BATTING_ANIMATIONS)
        for (const line of def.compatibleLines.filter(
          (l) => !l.startsWith('wide'),
        ))
          for (const length of def.compatibleLengths)
            for (const z of HEIGHTS[length]!) {
              const ball = ballFor(offOf(lineCenter(line)), z, hand);
              const plan = presentContact({
                shotId: def.shotId,
                hand,
                ballPoint: ball,
                quality: 'perfect',
                footwork: 55,
                secondsToBall: timeToContact(def),
              });
              checked++;
              const where = `${def.shotId} ${line}/${length} z=${z}`;
              expect(withinLimits(plan.adjust), where).toBe(true);
              expect(plan.ballShift, where).toBeLessThanOrEqual(
                CONTACT_ASSIST.maxBallShiftReach + 1e-9,
              );
              // within the shot's nominal reach it needs only the normal tolerance and meets the bat
              const rel = worldToRel(ball, hand);
              const near =
                Math.abs(rel.off - def.idealContact.off) <= 0.3 &&
                Math.abs(rel.z - def.idealContact.height) <= 0.25;
              if (near) {
                supported++;
                expect(plan.exceeded, where).toBe(false);
                expect(plan.residual, where).toBeLessThan(0.02);
              }
              // the body was NOT twisted into a different shot
              expect(Math.abs(plan.adjust.hipYaw)).toBeLessThanOrEqual(
                CONTACT_ASSIST.maxHipYaw + 1e-9,
              );
              expect(plan.timingWarp).toBeGreaterThanOrEqual(
                1 - CONTACT_ASSIST.maxTimingWarp - 1e-9,
              );
              expect(plan.timingWarp).toBeLessThanOrEqual(
                1 + CONTACT_ASSIST.maxTimingWarp + 1e-9,
              );
            }
      expect(checked).toBeGreaterThan(80);
      expect(supported / checked).toBeGreaterThan(0.5);
    },
  );

  it('the plan for a left-hander is the plan for a right-hander (the batter-frame numbers match)', () => {
    for (const def of BATTING_ANIMATIONS) {
      const off = def.idealContact.off + 0.08;
      const r = presentContact({
        shotId: def.shotId,
        hand: 'right',
        ballPoint: ballFor(off, def.idealContact.height, 'right'),
        quality: 'good',
        secondsToBall: 0.4,
      });
      const l = presentContact({
        shotId: def.shotId,
        hand: 'left',
        ballPoint: ballFor(off, def.idealContact.height, 'left'),
        quality: 'good',
        secondsToBall: 0.4,
      });
      expect(l.adjust).toEqual(r.adjust);
      expect(l.residual).toBeCloseTo(r.residual, 9);
      expect(l.ballPoint.u).toBeCloseTo(-r.ballPoint.u, 9);
    }
  });

  it('is stronger for better contact: Perfect and Good align, Okay and Poor are visibly less clean, an Edge meets the edge', () => {
    const def = BATTING_ANIMATION_BY_SHOT.get('shot.cover_drive')!;
    const ball = ballFor(
      def.idealContact.off + 0.18,
      def.idealContact.height + 0.06,
      'right',
    );
    const plan = (quality: ContactQuality) =>
      presentContact({
        shotId: def.shotId,
        hand: 'right',
        ballPoint: ball,
        quality,
        footwork: 55,
        secondsToBall: 0.42,
      });
    expect(plan('perfect').residual).toBeLessThan(0.005);
    expect(plan('good').residual).toBeLessThan(0.02);
    // every real contact meets the bat; Okay and Poor meet it visibly off-centre
    const offCentre = (q: ContactQuality) => {
      const p = plan(q);
      const sweet = contactSweetSpotRel(def, p.adjust);
      const b = worldToRel(p.ballPoint, 'right');
      return Math.hypot(sweet.off - b.off, sweet.fwd - b.fwd, sweet.z - b.z);
    };
    expect(offCentre('perfect')).toBeLessThan(0.01);
    expect(offCentre('good')).toBeLessThan(0.03);
    expect(offCentre('okay')).toBeGreaterThan(0.03);
    expect(offCentre('poor')).toBeGreaterThan(offCentre('okay'));
    expect(offCentre('poor')).toBeLessThan(0.12);
    // an edge: the ball meets the edge socket, half a blade-width from the middle
    const edge = plan('edge');
    expect(edge.edge).not.toBeNull();
    expect(edge.contactMade).toBe(true);
  });

  it('a miss gets NO correction and shows daylight between bat and ball', () => {
    for (const def of BATTING_ANIMATIONS) {
      const ball = ballFor(
        def.idealContact.off,
        def.idealContact.height + 0.4,
        'right',
      );
      const plan = presentContact({
        shotId: def.shotId,
        hand: 'right',
        ballPoint: ball,
        quality: 'miss',
        secondsToBall: 0.42,
      });
      expect(plan.contactMade).toBe(false);
      expect(plan.adjust).toEqual(NO_ADJUST);
      expect(plan.timingWarp).toBe(1);
      expect(plan.ballShift).toBe(0);
      expect(plan.ballPoint).toEqual(ball);
      expect(plan.missMode).not.toBeNull();
      const gap = Math.hypot(plan.contactShift.off, plan.contactShift.z);
      expect(gap).toBeGreaterThan(0.2);
    }
  });

  it('refuses to distort the body for an unreachable ball: limits hold and the plan says it exceeded', () => {
    const def = BATTING_ANIMATION_BY_SHOT.get('shot.cover_drive')!;
    const wide = ballFor(
      def.idealContact.off + 1.9,
      def.idealContact.height,
      'right',
    );
    const plan = presentContact({
      shotId: def.shotId,
      hand: 'right',
      ballPoint: wide,
      quality: 'perfect',
      footwork: 100,
      secondsToBall: 0.4,
    });
    expect(withinLimits(plan.adjust)).toBe(true);
    expect(plan.exceeded).toBe(true);
    expect(plan.ballShift).toBeLessThanOrEqual(
      CONTACT_ASSIST.maxBallShiftReach + 1e-9,
    );
    expect(plan.residual).toBeGreaterThan(0.1);
  });

  it('better Footwork stretches the correction a little, never past the limit', () => {
    const def = BATTING_ANIMATION_BY_SHOT.get('shot.cover_drive')!;
    const ball = ballFor(
      def.idealContact.off + 0.7,
      def.idealContact.height + 0.2,
      'right',
    );
    const run = (footwork: number) =>
      presentContact({
        shotId: def.shotId,
        hand: 'right',
        ballPoint: ball,
        quality: 'perfect',
        footwork,
        secondsToBall: 0.4,
      });
    expect(run(100).residual).toBeLessThanOrEqual(run(10).residual);
    expect(withinLimits(run(100).adjust)).toBe(true);
  });

  it('narrows playback speed to land the contact frame on the ball, within the warp limit', () => {
    const def = BATTING_ANIMATION_BY_SHOT.get('shot.straight_drive')!;
    const ball = ballFor(0.03, 0.45, 'right');
    const at = (seconds: number) =>
      presentContact({
        shotId: def.shotId,
        hand: 'right',
        ballPoint: ball,
        quality: 'good',
        secondsToBall: seconds,
      }).timingWarp;
    expect(at(timeToContact(def))).toBeCloseTo(1, 6);
    expect(at(timeToContact(def) * 1.05)).toBeLessThan(1);
    expect(at(timeToContact(def) * 0.95)).toBeGreaterThan(1);
    expect(at(timeToContact(def) * 3)).toBeCloseTo(
      1 - CONTACT_ASSIST.maxTimingWarp,
      6,
    );
    expect(at(timeToContact(def) * 0.2)).toBeCloseTo(
      1 + CONTACT_ASSIST.maxTimingWarp,
      6,
    );
  });
});

describe('simplified shot controls', () => {
  const ball = { line: 'outside_off', length: 'full' } as const;
  it('turns intent + direction + the ball into a Module 0 shot, the same for either hand', () => {
    expect(
      selectShot({ action: 'drive', direction: 0.8, ...ball }).shotId,
    ).toBe('shot.cover_drive');
    expect(selectShot({ action: 'drive', direction: 0, ...ball }).shotId).toBe(
      'shot.straight_drive',
    );
    expect(
      selectShot({ action: 'drive', direction: -0.8, ...ball }).shotId,
    ).toBe('shot.on_drive');
    expect(selectShot({ action: 'loft', direction: 0.8, ...ball }).shotId).toBe(
      'shot.lofted_off_side',
    );
    expect(selectShot({ action: 'loft', direction: 0, ...ball }).shotId).toBe(
      'shot.lofted_straight',
    );
    expect(
      selectShot({ action: 'loft', direction: -0.8, ...ball }).shotId,
    ).toBe('shot.lofted_leg_side');
    expect(
      selectShot({
        action: 'defend',
        direction: 0,
        line: 'middle',
        length: 'good',
      }).shotId,
    ).toBe('shot.forward_defensive');
    expect(
      selectShot({
        action: 'defend',
        direction: 0,
        line: 'middle',
        length: 'short',
      }).shotId,
    ).toBe('shot.back_foot_defensive');
    expect(
      selectShot({
        action: 'leg_side',
        direction: 0,
        line: 'middle',
        length: 'good',
      }).shotId,
    ).toBe('shot.flick');
    expect(
      selectShot({
        action: 'leg_side',
        direction: 0,
        line: 'middle',
        length: 'short',
      }).shotId,
    ).toBe('shot.pull');
    expect(
      selectShot({
        action: 'leg_side',
        direction: 0,
        line: 'middle',
        length: 'bouncer',
      }).shotId,
    ).toBe('shot.hook');
    expect(
      selectShot({
        action: 'back_foot',
        direction: 0,
        line: 'outside_off',
        length: 'short',
      }).shotId,
    ).toBe('shot.cut');
    expect(
      selectShot({
        action: 'back_foot',
        direction: 0,
        line: 'middle',
        length: 'short',
      }).shotId,
    ).toBe('shot.back_foot_defensive');
  });

  it('never "fixes" a bad decision: a drive to a bouncer is still a drive, a loft to a yorker still a loft', () => {
    expect(
      selectShot({
        action: 'drive',
        direction: 0.8,
        line: 'outside_off',
        length: 'bouncer',
      }).shotId,
    ).toBe('shot.cover_drive');
    expect(
      selectShot({
        action: 'loft',
        direction: 0,
        line: 'middle',
        length: 'yorker',
      }).shotId,
    ).toBe('shot.lofted_straight');
  });

  it('only ever returns a real shot, for every combination, and every shot is reachable by hand', () => {
    const ids = new Set<string>(SHOTS.map((s) => s.id));
    for (const action of [
      'defend',
      'drive',
      'leg_side',
      'back_foot',
      'loft',
    ] as const)
      for (const direction of [-1, -0.5, 0, 0.5, 1])
        for (const line of [
          'wide_off',
          'outside_off',
          'off_stump',
          'middle',
          'leg',
          'wide_leg',
        ] as const)
          for (const length of [
            'yorker',
            'full',
            'good',
            'short',
            'bouncer',
          ] as const)
            expect(
              ids.has(selectShot({ action, direction, line, length }).shotId),
            ).toBe(true);
    expect(MANUAL_SHOTS.map((s) => s.shotId).sort()).toEqual([...ids].sort());
  });

  it('gives a subtle hint from the same suitability the engine uses, and a sensible suggestion', () => {
    expect(shotHint('shot.cover_drive', 'outside_off', 'full')).toBe('good');
    expect(shotHint('shot.cover_drive', 'outside_off', 'bouncer')).toBe('okay');
    expect(shotHint('shot.pull', 'off_stump', 'yorker')).toBe('okay');
    expect(shotHint('shot.cover_drive', 'leg', 'bouncer')).toBe('risky');
    expect(suggestedAction('middle', 'yorker')).toBe('defend');
    expect(suggestedAction('middle', 'short')).toBe('leg_side');
    expect(suggestedAction('outside_off', 'full')).toBe('drive');
  });
});

describe('timing prediction', () => {
  const timeline = { pitchTime: 0.7, contactTime: 1.1, speedKmh: 130 };
  const predictor = new BattingTimingPredictor(timeline);
  it('ideal press = contact time minus the shot’s own time to contact; pressing then is "perfect"', () => {
    for (const def of BATTING_ANIMATIONS) {
      const ideal = predictor.idealTapTime(def.shotId);
      expect(ideal).toBeCloseTo(timeline.contactTime - timeToContact(def), 9);
      expect(predictor.normalized(ideal, def.shotId)).toBe(0);
      expect(timingCategory(predictor.normalized(ideal, def.shotId))).toBe(
        'perfect',
      );
    }
  });
  it('measures early and late as signed fractions of the window, clamped to -1..1', () => {
    const id = 'shot.cover_drive';
    const ideal = predictor.idealTapTime(id);
    expect(predictor.normalized(ideal - 0.15, id)).toBeCloseTo(-0.5, 3);
    expect(predictor.normalized(ideal + 0.15, id)).toBeCloseTo(0.5, 3);
    expect(predictor.normalized(ideal - 5, id)).toBe(-1);
    expect(predictor.normalized(ideal + 5, id)).toBe(1);
    expect(timingCategory(-0.3)).toBe('early');
    expect(timingCategory(-0.9)).toBe('very_early');
    expect(timingCategory(0.3)).toBe('late');
    expect(timingCategory(0.9)).toBe('very_late');
    expect(BATTING_INPUT.windowSeconds).toBeGreaterThan(0.1);
  });
  it('a faster ball leaves less time to react than a slower one (the ideal press is earlier in the flight)', () => {
    const fast = new BattingTimingPredictor({
      pitchTime: 0.5,
      contactTime: 0.85,
      speedKmh: 145,
    });
    const slow = new BattingTimingPredictor({
      pitchTime: 1.2,
      contactTime: 2.0,
      speedKmh: 70,
    });
    expect(fast.idealTapTime('shot.cover_drive')).toBeLessThan(
      slow.idealTapTime('shot.cover_drive'),
    );
    expect(fast.timeline.contactTime).toBeLessThan(slow.timeline.contactTime);
  });
  it('the cue rises to the ideal moment and falls after it', () => {
    const id = 'shot.straight_drive';
    const ideal = predictor.idealTapTime(id);
    expect(predictor.cue(ideal - 0.7, id)).toBe(0);
    expect(predictor.cue(ideal, id)).toBe(1);
    expect(predictor.cue(ideal - 0.3, id)).toBeGreaterThan(0);
    expect(predictor.cue(ideal + 0.3, id)).toBeLessThan(1);
    expect(predictor.cue(ideal + 2, id)).toBe(0);
  });
});

describe('batting state machine and input', () => {
  it('only allows the legal transitions', () => {
    const m = new BattingStateMachine();
    expect(() => m.transition('SWING_STARTED')).toThrow(
      InvalidBattingTransition,
    );
    for (const s of [
      'BOWLER_APPROACH',
      'BALL_RELEASED',
      'READING_DELIVERY',
      'SHOT_ARMED',
      'SWING_STARTED',
      'CONTACT_WINDOW',
      'RESULT_RESOLVED',
      'BALL_OUTCOME',
      'RESETTING',
      'WAITING',
    ] as const)
      m.transition(s);
    expect(m.state).toBe('WAITING');
    expect(m.tryTransition('CONTACT_WINDOW')).toBe(false);
  });

  const ready = () => {
    const input = new BattingInputController();
    input.beginDelivery('outside_off', 'full');
    input.machine.transition('BOWLER_APPROACH');
    input.machine.transition('BALL_RELEASED');
    input.setTimeline(
      new BattingTimingPredictor({
        pitchTime: 0.7,
        contactTime: 1.1,
        speedKmh: 130,
      }),
    );
    input.machine.transition('READING_DELIVERY');
    return input;
  };

  it('records the timing against the ball, and sends only a shot, a direction and a timing', () => {
    const input = ready();
    input.setAction('drive');
    input.setDirection(0.6);
    const swing = input.commit(0.75)!;
    expect(Object.keys(swing.intent).sort()).toEqual([
      'assist',
      'direction',
      'shotId',
      'timingInput',
    ]);
    expect(swing.intent.shotId).toBe('shot.cover_drive');
    expect(swing.intent.direction).toBe(0.6);
    expect(swing.intent.timingInput).toBeGreaterThanOrEqual(-1);
    expect(swing.intent.timingInput).toBeLessThanOrEqual(1);
    expect(swing.errorSeconds).toBeCloseTo(
      0.75 +
        timeToContact(BATTING_ANIMATION_BY_SHOT.get('shot.cover_drive')!) -
        1.1,
      9,
    );
  });

  it('locks the shot once committed and turns repeated taps into nothing', () => {
    const input = ready();
    expect(input.commit(0.7)).not.toBeNull();
    expect(input.commit(0.71)).toBeNull();
    expect(input.commit(0.72)).toBeNull();
    expect(input.setAction('loft')).toBe(false);
    expect(input.setDirection(-1)).toBe(false);
    expect(input.setManualShot('shot.pull')).toBe(false);
    expect(input.machine.state).toBe('SWING_STARTED');
  });

  it('can change its mind freely before committing, and a manual shot overrides the simple controls', () => {
    const input = ready();
    input.setAction('defend');
    expect(input.machine.state).toBe('SHOT_ARMED');
    input.setAction('loft');
    input.setDirection(-0.9);
    expect(input.currentShot()!.shotId).toBe('shot.lofted_leg_side');
    input.setManualShot('shot.hook');
    expect(input.currentShot()!.shotId).toBe('shot.hook');
    input.setManualShot(null);
    expect(input.currentShot()!.shotId).toBe('shot.lofted_leg_side');
  });

  it('remembers a tap made just before the ball is released, but not a stale one', () => {
    const input = new BattingInputController();
    input.beginDelivery('middle', 'good');
    input.machine.transition('BOWLER_APPROACH');
    expect(input.commit(-0.05)).toBeNull();
    expect(input.takeBuffered(0.05)).toBe(-0.05);
    expect(input.takeBuffered(0.06)).toBeNull();
    expect(input.commit(-1)).toBeNull();
    expect(input.takeBuffered(0.5)).toBeNull();
  });

  it('sends no timing when the system times it for the player (auto assist)', () => {
    const input = ready();
    input.setAssist('auto');
    expect(input.commit(0.2)!.intent.timingInput).toBe(0);
    expect(input.snapshot().hint).not.toBeNull();
  });

  it('shows hints only when assisted', () => {
    const input = ready();
    expect(input.snapshot().hint).toBeNull();
    input.setAssist('normal');
    expect(input.snapshot().hint).not.toBeNull();
    expect(input.snapshot().suggested).toBe('drive');
  });
});

describe('the ball path: one ball, incoming then outgoing', () => {
  const delivery = makeDelivery();
  const incoming = planIncoming({
    delivery,
    release: vec(0.2, 0.3, 2.1),
    hand: 'right',
  });
  const shot = makeShot();
  const outcome = makeOutcome({
    runsOffBat: 4,
    totalRuns: 4,
    headline: 'FOUR',
    distanceClass: 'boundary',
  });
  const exit = (from: ReturnType<typeof vec>) =>
    planExit('boundary', from, shot, outcome, 'right', delivery);

  it('follows the incoming flight until the result is known, and keeps going past the bat if it never comes', () => {
    const path = new BallPath(incoming);
    expect(path.positionAt(0)).toEqual(incoming.at(0));
    expect(path.positionAt(incoming.flightTime * 0.5)).toEqual(
      incoming.at(incoming.flightTime * 0.5),
    );
    const a = path.positionAt(incoming.flightTime + 0.05);
    const b = path.positionAt(incoming.flightTime + 0.2);
    expect(b.v).toBeGreaterThan(a.v - 1e-9);
    expect(Number.isFinite(a.u + a.v + a.z + b.u + b.v + b.z)).toBe(true);
    // it is moving, not frozen
    expect(Math.hypot(b.u - a.u, b.v - a.v, b.z - a.z)).toBeGreaterThan(0.01);
  });

  it('switches to the exit at exactly the visual contact point, with no jump', () => {
    const path = new BallPath(incoming);
    const contact = vec(
      incoming.arrival.u + 0.06,
      incoming.arrival.v,
      incoming.arrival.z + 0.04,
    );
    path.resolve({ contact, now: incoming.flightTime - 0.4, exitFrom: exit });
    const before = path.positionAt(path.contactTime - 1e-4);
    const at = path.positionAt(path.contactTime);
    const after = path.positionAt(path.contactTime + 1e-4);
    for (const [p, q] of [
      [before, contact],
      [at, contact],
      [after, contact],
    ] as const)
      expect(Math.hypot(p.u - q.u, p.v - q.v, p.z - q.z)).toBeLessThan(0.01);
    // continuous across the switch: consecutive samples never leap
    let last = path.positionAt(0);
    for (let t = 0.01; t < path.duration; t += 0.01) {
      const p = path.positionAt(t);
      expect(
        Math.hypot(p.u - last.u, p.v - last.v, p.z - last.z),
        `t=${t}`,
      ).toBeLessThan(2.5);
      last = p;
    }
  });

  it('the nudge grows from nothing when the result arrives, so there is no pop mid-flight', () => {
    const path = new BallPath(incoming);
    const switchAt = incoming.flightTime - 0.3;
    const contact = vec(
      incoming.arrival.u + 0.1,
      incoming.arrival.v,
      incoming.arrival.z,
    );
    path.resolve({ contact, now: switchAt, exitFrom: exit });
    const a = path.positionAt(switchAt);
    const plain = incoming.at(switchAt);
    expect(
      Math.hypot(a.u - plain.u, a.v - plain.v, a.z - plain.z),
    ).toBeLessThan(1e-9);
  });

  it('a result that arrives after the ball has passed takes it up from where it has got to', () => {
    const path = new BallPath(incoming);
    const now = incoming.flightTime + 0.25;
    const where = path.positionAt(now);
    path.resolve({ contact: incoming.arrival, now, exitFrom: exit });
    const start = path.positionAt(now);
    expect(
      Math.hypot(start.u - where.u, start.v - where.v, start.z - where.z),
    ).toBeLessThan(0.01);
    expect(path.duration).toBeGreaterThan(now);
  });
});

describe('sound follows the engine result', () => {
  const cues = (
    quality: ReturnType<typeof makeShot>['contactQuality'],
    outcome: Partial<ReturnType<typeof makeOutcome>> = {},
  ) =>
    cuesForResult({
      shot: makeShot({ contactQuality: quality }),
      outcome: makeOutcome(outcome),
    }).map((c) => `${c.cue}@${c.at}`);

  it('chooses the bat sound from the contact quality: clean for Perfect, lighter for an Edge, a whoosh for a miss', () => {
    expect(cues('perfect')).toEqual(['bat_clean@contact']);
    expect(cues('good')).toEqual(['bat_solid@contact']);
    expect(cues('poor')).toEqual(['bat_dull@contact']);
    expect(cues('edge')).toEqual(['bat_edge@contact']);
    expect(cues('miss')).toEqual(['whoosh@contact']);
  });

  it('adds the stumps and the crowd from the outcome, and nothing for a wide', () => {
    expect(cues('miss', { wicketType: 'bowled' })).toEqual([
      'whoosh@contact',
      'stumps@contact',
      'crowd_wicket@result',
    ]);
    expect(cues('good', { runsOffBat: 4, totalRuns: 4 })).toContain(
      'crowd_boundary@result',
    );
    expect(cues('perfect', { runsOffBat: 6, totalRuns: 6 })).toContain(
      'crowd_six@result',
    );
    expect(cues('good', { extraType: 'wide', legal: false })).toEqual([]);
  });
});
