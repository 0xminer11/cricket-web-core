import { expect, it } from 'vitest';
import { PITCHES, SHOTS } from '../../packages/game-core/src/index';
import {
  createTestMatch,
  createTestTeamSnapshot,
  simulateDeliveries,
  MatchRandom,
  calculateEffectiveMatchAttributes,
  contactQuality,
  shotSuitability,
} from '../../packages/match-engine/src/index';
import { resolveDelivery } from '../../packages/match-engine/src/bowling/resolve';
import { resolveShot } from '../../packages/match-engine/src/batting/resolve';
import { resolveOutcome } from '../../packages/match-engine/src/outcomes/resolve';
const player = (rating: number) =>
  createTestTeamSnapshot(`team.${rating}`, rating).players[1]!;
it('skill and timing improve distributions; equipment stays smaller than skill', () => {
  const input = createTestMatch();
  const equal = simulateDeliveries(10000, input, {
    batter: player(55),
    bowler: player(55),
  });
  const weak = simulateDeliveries(10000, input, {
    batter: player(25),
    bowler: player(85),
  });
  const strong = simulateDeliveries(10000, input, {
    batter: player(85),
    bowler: player(25),
  });
  expect(strong.runsPerBall).toBeGreaterThan(equal.runsPerBall);
  expect(equal.runsPerBall).toBeGreaterThan(weak.runsPerBall);
  const timed = simulateDeliveries(10000, input, { timingInput: 0 });
  const late = simulateDeliveries(10000, input, { timingInput: 1 });
  expect(timed.runsPerBall).toBeGreaterThan(late.runsPerBall);
  const geared = simulateDeliveries(10000, input, {
    batter: {
      ...player(55),
      equipmentModifiers: { 'batting.timing': 8, 'batting.power': 8 },
    },
    bowler: player(55),
  });
  expect(geared.runsPerBall).toBeGreaterThan(equal.runsPerBall);
  expect(geared.runsPerBall - equal.runsPerBall).toBeLessThan(
    strong.runsPerBall - equal.runsPerBall,
  );
});
it('modifiers stay bounded and leave base attributes untouched', () => {
  const original = player(55);
  const base = JSON.stringify(original);
  const fresh = calculateEffectiveMatchAttributes(original);
  const tired = calculateEffectiveMatchAttributes({
    ...original,
    fatigue: 100,
  });
  const form = calculateEffectiveMatchAttributes({ ...original, form: 100 });
  expect(tired.batting.timing).toBeLessThan(fresh.batting.timing);
  expect(form.batting.timing / fresh.batting.timing).toBeLessThan(1.07);
  expect(JSON.stringify(original)).toBe(base);
  expect(
    calculateEffectiveMatchAttributes({
      ...player(100),
      equipmentModifiers: { 'batting.power': 100 },
    }).batting.power,
  ).toBeLessThanOrEqual(100);
});
it('pitch movement respects eligible styles and Module 0 direction', () => {
  const fast = player(60);
  const spin = { ...fast, bowlingStyle: 'off_spin' as const };
  const sample = (pitchId: string, spinner: boolean) =>
    resolveDelivery(
      {
        variationId: spinner
          ? 'delivery.spin.stock_off'
          : 'delivery.fast.stock',
        line: 'off_stump',
        length: 'good',
      },
      spinner ? spin : fast,
      PITCHES.find((p) => p.id === pitchId)!,
      new MatchRandom('pitch'),
    );
  expect(sample('pitch.green', false).seam).toBeGreaterThan(
    sample('pitch.dry', false).seam,
  );
  expect(sample('pitch.hard', false).speed).toBeGreaterThan(
    sample('pitch.dry', false).speed,
  );
  expect(sample('pitch.dry', true).spin).toBeGreaterThan(
    sample('pitch.green', true).spin,
  );
  expect(sample('pitch.dry', false).spin).toBe(0);
});
it('cover/full and pull/short beat mismatches and poor shots remain risky', () => {
  const cover = SHOTS.find((s) => s.id === 'shot.cover_drive')!;
  const pull = SHOTS.find((s) => s.id === 'shot.pull')!;
  expect(shotSuitability(cover, 'outside_off', 'full')).toBeGreaterThan(
    shotSuitability(cover, 'outside_off', 'bouncer'),
  );
  expect(shotSuitability(pull, 'middle', 'short')).toBeGreaterThan(
    shotSuitability(pull, 'middle', 'yorker'),
  );
  const d = resolveDelivery(
    { variationId: 'delivery.fast.stock', line: 'outside_off', length: 'full' },
    player(55),
    PITCHES[1]!,
    new MatchRandom('matchup'),
  );
  const good = resolveShot(
    { shotId: cover.id, timingInput: 0 },
    player(55),
    d,
    PITCHES[1]!,
    new MatchRandom('shot'),
  );
  const bad = resolveShot(
    { shotId: pull.id, timingInput: 0 },
    player(55),
    d,
    PITCHES[1]!,
    new MatchRandom('shot'),
  );
  expect(good.contactScore).toBeGreaterThan(bad.contactScore);
});
it('all bands are reachable; edges can survive and produce runs', () => {
  expect([0.9, 0.8, 0.6, 0.5, 0.3, 0.1].map(contactQuality)).toEqual([
    'perfect',
    'good',
    'okay',
    'poor',
    'edge',
    'miss',
  ]);
  const d = resolveDelivery(
    { variationId: 'delivery.fast.stock', line: 'middle', length: 'good' },
    player(1),
    PITCHES[1]!,
    new MatchRandom('contact'),
  );
  const perfect = resolveShot(
    { shotId: 'shot.lofted_straight', timingInput: 0 },
    { ...player(100), form: 100 },
    { ...d, actualLine: 'middle', actualLength: 'good' },
    PITCHES[1]!,
    new MatchRandom('shot'),
  );
  expect(perfect.contactQuality).toBe('perfect');
  const miss = resolveShot(
    { shotId: 'shot.cover_drive', timingInput: 1 },
    player(1),
    { ...d, actualLength: 'bouncer', actualLine: 'leg', executionQuality: 1 },
    PITCHES[1]!,
    new MatchRandom('shot'),
  );
  expect(miss.contactQuality).toBe('miss');
  const results = Array.from({ length: 1000 }, (_, n) =>
    resolveOutcome(
      { ...d, noBall: false },
      { ...perfect, contactQuality: 'edge' },
      player(55),
      new MatchRandom(String(n)),
    ),
  );
  expect(results.some((o) => o.wicketType)).toBe(true);
  expect(results.some((o) => o.runsOffBat === 4)).toBe(true);
  expect(results.filter((o) => o.wicketType).length).toBeLessThan(500);
});
it('loft trades higher boundaries for more wickets than defence', () => {
  const input = createTestMatch();
  const defend = simulateDeliveries(10000, input, {
    shotId: 'shot.forward_defensive',
  });
  const loft = simulateDeliveries(10000, input, {
    shotId: 'shot.lofted_straight',
  });
  expect(loft.distribution['6']).toBeGreaterThan(defend.distribution['6']!);
  expect(loft.distribution.wicket).toBeGreaterThan(defend.distribution.wicket!);
});
it('fixed-seed aggregate has broad non-flaky guardrails', () => {
  const r = simulateDeliveries(10000, createTestMatch());
  expect(r.runsPerBall).toBeGreaterThan(1);
  expect(r.runsPerBall).toBeLessThan(2.5);
  expect(r.percentages.wicket).toBeGreaterThan(2);
  expect(r.percentages.wicket).toBeLessThan(13);
  expect(Object.values(r.distribution).reduce((a, b) => a + b, 0)).toBe(10000);
});

it('shot matchups hold over fixed-seed delivery distributions', () => {
  const input = createTestMatch();
  const sample = (
    shotId: 'shot.cover_drive' | 'shot.pull',
    line: 'outside_off' | 'middle',
    length: 'full' | 'bouncer' | 'short' | 'yorker',
  ) =>
    simulateDeliveries(3000, input, {
      shotId,
      deliveryIntent: { variationId: 'delivery.fast.stock', line, length },
    });
  const cover = sample('shot.cover_drive', 'outside_off', 'full');
  const coverBad = sample('shot.cover_drive', 'outside_off', 'bouncer');
  const pull = sample('shot.pull', 'middle', 'short');
  const pullBad = sample('shot.pull', 'middle', 'yorker');
  expect(cover.runsPerBall).toBeGreaterThan(coverBad.runsPerBall);
  expect(pull.runsPerBall).toBeGreaterThan(pullBad.runsPerBall);
  expect(cover.distribution.wicket).toBeLessThan(coverBad.distribution.wicket!);
  expect(pull.distribution.wicket).toBeLessThan(pullBad.distribution.wicket!);
});
