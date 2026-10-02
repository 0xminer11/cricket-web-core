import { describe, expect, it } from 'vitest';
import { BATTING_INPUT, SHOTS } from '../../packages/game-core/src/index';
import {
  aiBowlerIntent,
  createMatchEngine,
  createTestMatch,
  createTestTeamSnapshot,
  humanShotIntent,
  simulateHumanBatting,
  timingForgiveness,
  timingLabel,
} from '../../packages/match-engine/src/index';
import type { MatchPlayerSnapshot } from '../../packages/match-engine/src/index';

const players = (bat: number, bowl: number, style = 'right_arm_fast') => {
  const batter = createTestTeamSnapshot('bat', bat).players[0]!;
  const bowler = createTestTeamSnapshot('bowl', bowl).players[0]!;
  bowler.bowlingStyle = style as MatchPlayerSnapshot['bowlingStyle'];
  return { batter, bowler };
};
const sim = (
  options: Partial<Parameters<typeof simulateHumanBatting>[0]> & {
    bat?: number;
    bowl?: number;
    pitch?: string;
    style?: string;
  } = {},
) =>
  simulateHumanBatting({
    count: 2000,
    ...players(options.bat ?? 55, options.bowl ?? 55, options.style),
    pitchId: `pitch.${options.pitch ?? 'hard'}`,
    seed: 'module10-test',
    timing: 'average',
    shots: 'appropriate',
    ...options,
  });

describe('human batting input -> engine ShotIntent', () => {
  const { batter } = players(60, 60);
  const delivery = { speed: 36 };

  it('maps the direction onto the chosen shot’s own arc: a cover drive cannot be played behind square', () => {
    const cover = SHOTS.find((s) => s.id === 'shot.cover_drive')!;
    const [min, max] = cover.directionDegrees;
    for (const direction of [-1, -0.5, 0, 0.5, 1]) {
      const intent = humanShotIntent(
        { shotId: cover.id, direction, timing: 0, assist: 'off' },
        batter,
        delivery,
      );
      const degrees =
        min + ((max - min) * ((intent.directionInput ?? 0) + 1)) / 2;
      expect(degrees).toBeGreaterThanOrEqual(min - 1e-9);
      expect(degrees).toBeLessThanOrEqual(max + 1e-9);
    }
    // more off side is never less to the off side
    const at = (d: number) =>
      humanShotIntent(
        { shotId: cover.id, direction: d, timing: 0, assist: 'off' },
        batter,
        delivery,
      ).directionInput!;
    expect(at(1)).toBeGreaterThanOrEqual(at(0));
    expect(at(0)).toBeGreaterThanOrEqual(at(-1));
  });

  it('scales the timing error by the assist level and the batter’s skill, never past +/-1', () => {
    const base = {
      shotId: 'shot.straight_drive',
      direction: 0,
      timing: 0.8,
    } as const;
    const t = (assist: 'off' | 'normal' | 'high') =>
      humanShotIntent({ ...base, assist }, batter, delivery).timingInput!;
    expect(Math.abs(t('high'))).toBeLessThan(Math.abs(t('normal')));
    expect(Math.abs(t('normal'))).toBeLessThan(Math.abs(t('off')));
    for (const timing of [-5, -1, 0, 1, 5])
      expect(
        Math.abs(
          humanShotIntent({ ...base, timing, assist: 'off' }, batter, delivery)
            .timingInput!,
        ),
      ).toBeLessThanOrEqual(1);
    expect(t('off')).toBeLessThan(0.8); // skill always forgives a little
  });

  it('sends NO timing at all with auto assist, so the engine times it like an AI batter', () => {
    const intent = humanShotIntent(
      {
        shotId: 'shot.straight_drive',
        direction: 0,
        timing: 1,
        assist: 'auto',
      },
      batter,
      delivery,
    );
    expect(intent.timingInput).toBeUndefined();
  });

  it('forgives more for better Timing and Reaction, most against pace, and always within 0.4..1', () => {
    const weak = players(20, 50).batter;
    const strong = players(90, 50).batter;
    expect(timingForgiveness(strong, { speed: 40 })).toBeLessThan(
      timingForgiveness(weak, { speed: 40 }),
    );
    expect(timingForgiveness(strong, { speed: 40 })).toBeLessThan(
      timingForgiveness(strong, { speed: 12 }),
    );
    for (const b of [weak, strong]) {
      const v = timingForgiveness(b, { speed: 38 });
      expect(v).toBeGreaterThanOrEqual(0.4);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('labels a raw timing error with the thresholds from the config', () => {
    const { perfect, near } = BATTING_INPUT.timingLabels;
    expect(timingLabel(0)).toBe('perfect');
    expect(timingLabel(perfect)).toBe('perfect');
    expect(timingLabel(-(perfect + 0.01))).toBe('early');
    expect(timingLabel(near + 0.01)).toBe('very_late');
    expect(timingLabel(-(near + 0.01))).toBe('very_early');
  });

  it('refuses an unknown shot', () => {
    expect(() =>
      humanShotIntent(
        { shotId: 'shot.nope', direction: 0, timing: 0, assist: 'off' },
        batter,
        delivery,
      ),
    ).toThrow();
  });
});

describe('the AI bowler', () => {
  const bowler = players(55, 55).bowler;
  it('is deterministic from the seed and the sequence, and knows nothing about the batter', () => {
    for (let n = 1; n <= 20; n++)
      expect(aiBowlerIntent('seed-a', bowler, n)).toEqual(
        aiBowlerIntent('seed-a', bowler, n),
      );
    expect(aiBowlerIntent('seed-a', bowler, 1)).not.toEqual(
      aiBowlerIntent('seed-b', bowler, 1),
    );
    expect(aiBowlerIntent.length).toBe(3); // (seed, bowler, sequence): no batter, no shot
  });

  it('varies the delivery, the line and the length, and only bowls what its style allows', () => {
    const deliveries = new Set<string>();
    const lines = new Set<string>();
    const lengths = new Set<string>();
    for (let n = 1; n <= 300; n++) {
      const intent = aiBowlerIntent('variety', bowler, n);
      deliveries.add(intent.variationId);
      lines.add(intent.line);
      lengths.add(intent.length);
    }
    expect(deliveries.size).toBeGreaterThanOrEqual(3);
    expect(lines.size).toBeGreaterThanOrEqual(4);
    expect(lengths.size).toBeGreaterThanOrEqual(3);
    // the engine accepts every one of them
    const input = createTestMatch({ rngSeed: 'variety' });
    const engine = createMatchEngine();
    engine.startMatch(input);
    engine.selectBowler(engine.eligibleBowlers()[0]!);
    const real = [...input.teamA.players, ...input.teamB.players].find(
      (p) => p.playerId === engine.cursor().bowlerId,
    )!;
    for (let n = 1; n <= 30; n++)
      expect(() =>
        engine.previewDelivery(1, aiBowlerIntent('variety', real, n)),
      ).not.toThrow();
  });

  it('previewDelivery is read-only and is exactly the delivery the ball then has', () => {
    const input = createTestMatch({ rngSeed: 'preview' });
    const engine = createMatchEngine();
    engine.startMatch(input);
    engine.selectBowler(engine.eligibleBowlers()[0]!);
    const bowlerId = engine.cursor().bowlerId!;
    const real = [...input.teamA.players, ...input.teamB.players].find(
      (p) => p.playerId === bowlerId,
    )!;
    const intent = aiBowlerIntent('preview', real, 1);
    const before = JSON.stringify(engine.snapshot());
    const a = engine.previewDelivery(1, intent);
    const b = engine.previewDelivery(1, intent);
    expect(b).toEqual(a);
    expect(JSON.stringify(engine.snapshot())).toBe(before);
    const ball = engine.resolveBall({
      actionId: 'x',
      expectedSequence: 1,
      deliveryIntent: intent,
      battingIntent: humanShotIntent(
        {
          shotId: 'shot.straight_drive',
          direction: 0,
          timing: 0,
          assist: 'off',
        },
        input.teamA.players[0]!,
        a,
      ),
    });
    expect(ball.delivery.actualTarget).toEqual(a.actualTarget);
    expect(ball.delivery.speed).toBe(a.speed);
    expect(ball.delivery.bounce).toBe(a.bounce);
  });
});

describe('batting balance: what skill, timing and choices do (simulated humans, the real resolvers)', () => {
  it('is reproducible', () => {
    expect(sim()).toEqual(sim());
  });

  it('beginner with appropriate shots and reasonable timing still makes frequent contact; skill adds quality, not just contact', () => {
    const beginner = sim({ bat: 30 });
    const elite = sim({ bat: 90 });
    expect(beginner.contactPercent).toBeGreaterThan(85);
    expect(elite.goodOrBetterPercent).toBeGreaterThan(
      beginner.goodOrBetterPercent + 30,
    );
    expect(elite.runsPerBall).toBeGreaterThan(beginner.runsPerBall);
    expect(elite.wicketPercent).toBeLessThan(beginner.wicketPercent);
    // elite is not "automatic sixes"
    expect(elite.boundaryPercent).toBeLessThan(30);
    expect(elite.dotPercent).toBeGreaterThan(20);
  });

  it('better timing gives better contact, but a slightly bad timing with a good shot still makes contact', () => {
    const perfect = sim({ timing: 'perfect' });
    const advanced = sim({ timing: 'advanced' });
    const average = sim({ timing: 'average' });
    const rookie = sim({ timing: 'rookie' });
    expect(perfect.goodOrBetterPercent).toBeGreaterThanOrEqual(
      average.goodOrBetterPercent,
    );
    expect(average.goodOrBetterPercent).toBeGreaterThan(
      rookie.goodOrBetterPercent,
    );
    expect(advanced.goodOrBetterPercent).toBeGreaterThan(
      rookie.goodOrBetterPercent,
    );
    expect(rookie.contactPercent).toBeGreaterThan(85);
  });

  it('perfect timing does not rescue a bad shot, and a bad shot is much worse than a good one', () => {
    const good = sim({ shots: 'appropriate', timing: 'perfect' });
    const bad = sim({ shots: 'poor', timing: 'perfect' });
    expect(bad.goodOrBetterPercent).toBeLessThan(good.goodOrBetterPercent / 4);
    expect(bad.wicketPercent).toBeGreaterThan(good.wicketPercent * 3);
  });

  it('defending survives and scores little; lofting scores more and risks more', () => {
    const defend = sim({ shots: { fixed: 'shot.forward_defensive' } });
    const loft = sim({ shots: { fixed: 'shot.lofted_straight' } });
    expect(defend.boundaryPercent).toBeLessThan(2);
    expect(defend.dotPercent).toBeGreaterThan(loft.dotPercent);
    expect(loft.boundaryPercent).toBeGreaterThan(defend.boundaryPercent + 15);
    expect(loft.wicketPercent).toBeGreaterThan(defend.wicketPercent);
    expect(loft.runsPerBall).toBeGreaterThan(defend.runsPerBall);
  });

  it('a cover drive to a bouncer is clearly worse than to a full ball outside off', () => {
    const run = (variationId: string, y: number) =>
      sim({
        shots: { fixed: 'shot.cover_drive' },
        delivery: { variationId, target: { x: 0.28, y } },
      });
    const full = run('delivery.fast.stock', 0.2);
    const bouncer = run('delivery.fast.stock', 0.95);
    expect(bouncer.goodOrBetterPercent).toBeLessThan(full.goodOrBetterPercent);
    expect(
      bouncer.wicketPercent + (bouncer.percentages.edge ?? 0),
    ).toBeGreaterThan(full.wicketPercent + (full.percentages.edge ?? 0));
  });

  it('green pitch: contact is not catastrophically low (mandatory), hard stays playable, dry spin stays playable', () => {
    const green = sim({ pitch: 'green' });
    const hard = sim({ pitch: 'hard' });
    const dry = sim({ pitch: 'dry' });
    expect(green.contactPercent).toBeGreaterThan(85);
    expect(green.goodOrBetterPercent).toBeGreaterThan(
      hard.goodOrBetterPercent * 0.8,
    );
    expect(hard.contactPercent).toBeGreaterThan(85);
    const spin = sim({ pitch: 'dry', style: 'off_spin' });
    expect(spin.contactPercent).toBeGreaterThan(85);
    expect(spin.runsPerBall).toBeGreaterThan(0.3);
    expect(dry.contactPercent).toBeGreaterThan(85);
  });

  it('assist helps a rookie’s timing in steps, and Auto is a lower ceiling than good manual timing', () => {
    const rookie = (assist: 'off' | 'normal' | 'high' | 'auto') =>
      sim({ timing: 'rookie', assist });
    expect(rookie('normal').goodOrBetterPercent).toBeGreaterThan(
      rookie('off').goodOrBetterPercent,
    );
    expect(rookie('high').goodOrBetterPercent).toBeGreaterThan(
      rookie('normal').goodOrBetterPercent,
    );
    expect(rookie('auto').goodOrBetterPercent).toBeLessThan(
      sim({ timing: 'advanced' }).goodOrBetterPercent,
    );
  });

  it('training Timing in Module 7 makes the next match more forgiving: a higher Timing rating means more good contact at the same human timing', () => {
    const withTiming = (timing: number) => {
      const { batter, bowler } = players(55, 55);
      (batter.batting as unknown as Record<string, number>).timing = timing;
      return simulateHumanBatting({
        count: 3000,
        batter,
        bowler,
        pitchId: 'pitch.hard',
        seed: 'training-link',
        timing: 'rookie',
        shots: 'appropriate',
        assist: 'off',
      });
    };
    const before = withTiming(45);
    const after = withTiming(65);
    expect(after.goodOrBetterPercent).toBeGreaterThan(
      before.goodOrBetterPercent + 5,
    );
    expect(after.runsPerBall).toBeGreaterThanOrEqual(before.runsPerBall);
    // and the tolerance itself is larger (forgiveness is smaller = more of an error is forgiven)
    const { batter: a, bowler } = players(55, 55);
    const { batter: b } = players(55, 55);
    (a.batting as unknown as Record<string, number>).timing = 45;
    (b.batting as unknown as Record<string, number>).timing = 65;
    expect(timingForgiveness(b, { speed: 36 })).toBeLessThan(
      timingForgiveness(a, { speed: 36 }),
    );
    void bowler;
  });

  it('terrible conditions (a weak batter, a strong bowler, a terrible shot, hopelessly late) do produce misses', () => {
    const awful = sim({
      bat: 25,
      bowl: 80,
      timing: 0.5,
      shots: 'poor',
      count: 1500,
    });
    expect(awful.percentages.miss ?? 0).toBeGreaterThan(20);
  });
});
