import { describe, expect, it } from 'vitest';
import {
  DELIVERIES,
  PITCHES,
  classifyLength,
  classifyLine,
  metersPerSecondToKmh,
} from '../../packages/game-core/src/index';
import {
  MatchRandom,
  aiShotIntent,
  bowlingArm,
  createMatchEngine,
  createTestMatch,
  createTestPlayerSnapshot,
  lateralDirection,
  resolveDelivery,
  signedMovement,
  stepSimulation,
} from '../../packages/match-engine/src/index';
import type { MatchPlayerSnapshot } from '../../packages/match-engine/src/index';

const pitch = PITCHES.find((p) => p.id === 'pitch.hard')!;

function bowler(
  rating: number,
  style: MatchPlayerSnapshot['bowlingStyle'] = 'right_arm_fast',
) {
  const player = createTestPlayerSnapshot({ bowlingStyle: style, fatigue: 0 });
  for (const group of ['batting', 'bowling', 'physical'] as const)
    for (const key of Object.keys(player[group]))
      (player[group] as unknown as Record<string, number>)[key] = rating;
  return player;
}

/** Mean distance between where the bowler aimed and where the ball actually landed. */
function meanError(
  rating: number,
  executionInput: number | undefined,
  variationId = 'delivery.fast.stock',
  n = 4000,
) {
  const player = bowler(rating);
  const target = { x: 0.3, y: 0.5 };
  let total = 0;
  let quality = 0;
  for (let i = 0; i < n; i++) {
    const d = resolveDelivery(
      {
        variationId: variationId as 'delivery.fast.stock',
        line: classifyLine(target.x),
        length: classifyLength(target.y),
        target,
        ...(executionInput === undefined ? {} : { executionInput }),
      },
      player,
      pitch,
      new MatchRandom(`err:${rating}:${i}`),
    );
    total += Math.hypot(
      d.actualTarget.x - target.x,
      d.actualTarget.y - target.y,
    );
    quality += d.executionQuality;
  }
  return { error: total / n, quality: quality / n };
}

describe('bowling execution input (engine extension, Module 9)', () => {
  it('absent input is exactly the same as before: neutral 0.5 changes nothing', () => {
    const a = meanError(60, undefined, 'delivery.fast.stock', 500);
    const b = meanError(60, 0.5, 'delivery.fast.stock', 500);
    expect(b).toEqual(a);
  });

  it('good timing tightens the landing spot, poor timing loosens it, monotonically', () => {
    const poor = meanError(60, 0).error;
    const neutral = meanError(60, 0.5).error;
    const perfect = meanError(60, 1).error;
    expect(perfect).toBeLessThan(neutral);
    expect(neutral).toBeLessThan(poor);
    // bounded: perfect timing helps by at most the configured 35%, it is not a laser
    expect(perfect / neutral).toBeGreaterThan(0.6);
    expect(poor / neutral).toBeLessThan(1.4);
  });

  it('player skill still matters: perfect timing on Accuracy 30 is far less accurate than neutral timing on Accuracy 90', () => {
    const novicePerfect = meanError(30, 1).error;
    const expertNeutral = meanError(90, 0.5).error;
    const expertPerfect = meanError(90, 1).error;
    expect(novicePerfect).toBeGreaterThan(expertNeutral * 3);
    expect(expertPerfect).toBeLessThan(expertNeutral);
    expect(meanError(90, 1).quality).toBeGreaterThan(meanError(30, 1).quality);
  });

  it('fatigue enlarges the miss even with perfect timing', () => {
    const fresh = bowler(70);
    const tired = { ...bowler(70), fatigue: 90 };
    const run = (p: MatchPlayerSnapshot) => {
      let total = 0;
      for (let i = 0; i < 2000; i++) {
        const d = resolveDelivery(
          {
            variationId: 'delivery.fast.stock',
            line: 'outside_off',
            length: 'good',
            target: { x: 0.3, y: 0.5 },
            executionInput: 1,
          },
          p,
          pitch,
          new MatchRandom(`fatigue:${i}`),
        );
        total += Math.hypot(d.actualTarget.x - 0.3, d.actualTarget.y - 0.5);
      }
      return total / 2000;
    };
    expect(run(tired)).toBeGreaterThan(run(fresh));
  });

  it('the engine rejects out-of-range or non-numeric execution input', () => {
    const input = createTestMatch();
    for (const bad of [1.2, -0.1, Number.NaN, Infinity]) {
      const engine = createMatchEngine();
      engine.startMatch(input);
      engine.selectBowler(engine.eligibleBowlers()[0]!);
      expect(() =>
        engine.resolveBall({
          actionId: `bad-${String(bad)}`,
          expectedSequence: 1,
          deliveryIntent: {
            variationId: 'delivery.fast.stock',
            line: 'off_stump',
            length: 'good',
            executionInput: bad,
          },
          battingIntent: { shotId: 'shot.forward_defensive' },
        }),
      ).toThrow();
    }
  });

  it('execution input is replayable: the same input gives the same ball, a different input a different one', () => {
    const play = (executionInput: number) => {
      const input = createTestMatch();
      const engine = createMatchEngine();
      engine.startMatch(input);
      engine.selectBowler(engine.eligibleBowlers()[0]!);
      return engine.resolveBall({
        actionId: 'x1',
        expectedSequence: 1,
        deliveryIntent: {
          variationId: 'delivery.fast.stock',
          line: 'off_stump',
          length: 'good',
          target: { x: 0.45, y: 0.5 },
          executionInput,
        },
        battingIntent: { shotId: 'shot.forward_defensive' },
      });
    };
    expect(play(0.9)).toEqual(play(0.9));
    expect(play(0.9).delivery.actualTarget).not.toEqual(
      play(0.1).delivery.actualTarget,
    );
  });
});

describe('movement direction is cricket-relative', () => {
  it('swing is relative to the batter’s body, whichever arm bowls and whichever hand bats', () => {
    for (const style of ['right_arm_fast', 'left_arm_fast'] as const)
      for (const hand of ['right', 'left'] as const) {
        expect(lateralDirection('swing_out', style, hand, 0.3)).toBe(-1);
        expect(lateralDirection('swing_in', style, hand, 0.3)).toBe(1);
      }
  });
  it('spin turns the opposite way for a left-hander, and left-arm bowlers turn the other way again', () => {
    expect(lateralDirection('off_break', 'off_spin', 'right', 0.5)).toBe(1);
    expect(lateralDirection('off_break', 'off_spin', 'left', 0.5)).toBe(-1);
    expect(
      lateralDirection('off_break', 'left_arm_orthodox', 'right', 0.5),
    ).toBe(-1);
    expect(lateralDirection('leg_break', 'leg_spin', 'right', 0.5)).toBe(-1);
    expect(
      lateralDirection('leg_break', 'left_arm_wrist_spin', 'right', 0.5),
    ).toBe(1);
    expect(lateralDirection('googly', 'leg_spin', 'right', 0.5)).toBe(1);
    expect(
      lateralDirection('googly', 'left_arm_wrist_spin', 'right', 0.5),
    ).toBe(-1);
    expect(lateralDirection('top_spin', 'leg_spin', 'right', 0.5)).toBe(0);
  });
  it('seam nips back from the off side and moves away from the leg side', () => {
    expect(lateralDirection('seam', 'right_arm_fast', 'right', 0.2)).toBe(1);
    expect(lateralDirection('seam', 'right_arm_fast', 'right', 0.8)).toBe(-1);
  });
  it('knows which arm each style uses', () => {
    expect(bowlingArm('right_arm_fast')).toBe('right');
    expect(bowlingArm('left_arm_medium')).toBe('left');
    expect(bowlingArm('left_arm_orthodox')).toBe('left');
    expect(bowlingArm('off_spin')).toBe('right');
  });
  it('signs the engine’s movement magnitudes by the profile of the delivery that was bowled', () => {
    const player = bowler(80);
    const out = resolveDelivery(
      {
        variationId: 'delivery.fast.outswing',
        line: 'outside_off',
        length: 'good',
        target: { x: 0.3, y: 0.5 },
      },
      player,
      pitch,
      new MatchRandom('swing'),
    );
    const signed = signedMovement(out, 'right_arm_fast', 'right');
    expect(out.swing).toBeGreaterThan(0);
    expect(signed.swing).toBe(-out.swing);
    expect(signed.spin).toBe(0);
    expect(
      DELIVERIES.find((d) => d.id === out.deliveryDefinitionId)!
        .movementProfile,
    ).toBe('swing_out');
    expect(metersPerSecondToKmh(39.4)).toBeCloseTo(141.84, 2);
  });
});

describe('AI batter for human bowling', () => {
  const input = createTestMatch();
  const batter = input.teamA.players[0]!;
  const intent = {
    variationId: 'delivery.fast.stock' as const,
    line: 'outside_off' as const,
    length: 'good' as const,
  };

  it('is deterministic for the same seed, sequence and intent', () => {
    for (let n = 1; n < 30; n++)
      expect(aiShotIntent('seed-a', batter, intent, n)).toEqual(
        aiShotIntent('seed-a', batter, intent, n),
      );
  });
  it('varies its shots across different deliveries instead of playing one stroke to everything', () => {
    const shots = new Set<string>();
    const lines = [
      'wide_off',
      'outside_off',
      'off_stump',
      'middle',
      'leg',
    ] as const;
    const lengths = ['yorker', 'full', 'good', 'short', 'bouncer'] as const;
    for (let n = 1; n <= 300; n++)
      shots.add(
        aiShotIntent(
          'seed-b',
          batter,
          {
            ...intent,
            line: lines[n % lines.length]!,
            length: lengths[n % lengths.length]!,
          },
          n,
        ).shotId,
      );
    expect(shots.size).toBeGreaterThanOrEqual(7);
  });
  it('plays suitable shots to suitable balls (a short ball is not driven as often as a full one)', () => {
    const count = (length: 'full' | 'short', shot: string) => {
      let c = 0;
      for (let n = 1; n <= 600; n++)
        c += Number(
          aiShotIntent('seed-c', batter, { ...intent, length }, n).shotId ===
            shot,
        );
      return c;
    };
    expect(count('short', 'shot.pull')).toBeGreaterThan(
      count('full', 'shot.pull'),
    );
  });
  it('goes harder in a chase that is slipping away than when it is cruising', () => {
    const loft = (ctx: { runsNeeded: number; ballsRemaining: number }) => {
      let c = 0;
      for (let n = 1; n <= 1000; n++)
        c += Number(
          aiShotIntent('seed-d', batter, intent, n, ctx).shotId.includes(
            'lofted',
          ),
        );
      return c;
    };
    expect(loft({ runsNeeded: 40, ballsRemaining: 12 })).toBeGreaterThan(
      loft({ runsNeeded: 6, ballsRemaining: 24 }),
    );
  });
  it('never sees the resolved delivery or the outcome: only the declared variation, line and length', () => {
    // the function takes no resolved delivery, no RNG stream of the engine and no result
    expect(aiShotIntent.length).toBeLessThanOrEqual(5);
    const engine = createMatchEngine();
    const match = createTestMatch();
    engine.startMatch(match);
    // a normal AI-vs-AI step still works and stays valid after the extension
    const ball = stepSimulation(engine, match);
    expect(ball.sequenceNumber).toBe(1);
  });
});
