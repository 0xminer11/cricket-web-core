import { describe, expect, it } from 'vitest';
import {
  createMatchEngine,
  createTestMatch,
  legalBallsToOvers,
  strikeRate,
  requiredRate,
  economyRate,
} from '../../packages/match-engine/src/index';
import {
  applyScore,
  validateOutcome,
} from '../../packages/match-engine/src/rules/scoring';
import type {
  EngineBallResult,
  Outcome,
} from '../../packages/match-engine/src/state/types';
function fixture() {
  const input = createTestMatch({
    toss: { winnerTeamId: 'team.a', decision: 'bat' },
  });
  const engine = createMatchEngine();
  engine.startMatch(input);
  engine.selectBowler(engine.eligibleBowlers()[0]!);
  return { inning: engine.snapshot().innings[0]!, team: input.teamA };
}
const base: Outcome = {
  runsOffBat: 0,
  extras: 0,
  extraType: null,
  wicketType: null,
  legalDelivery: true,
  completedRuns: 0,
  distanceClass: 'infield',
};
function ball(
  inning: ReturnType<typeof fixture>['inning'],
  overrides: Partial<Outcome> = {},
) {
  // Scoring tests intentionally bypass random outcome production at the internal rules boundary.
  return {
    ...base,
    ...overrides,
    strikerId: inning.strikerId!,
    nonStrikerId: inning.nonStrikerId!,
    bowlerId: inning.currentBowlerId!,
  } as EngineBallResult;
}
describe('cricket scoring rules', () => {
  it.each([
    [0, '0.0'],
    [5, '0.5'],
    [6, '1.0'],
    [11, '1.5'],
    [12, '2.0'],
  ])('formats %s legal balls', (n, expected) =>
    expect(legalBallsToOvers(n as number)).toBe(expected),
  );
  it('rates handle no balls remaining without NaN/Infinity', () => {
    expect(strikeRate(0, 0)).toBe(0);
    expect(economyRate(0, 0)).toBe(0);
    expect(requiredRate(3, 0)).toBeNull();
    expect(requiredRate(0, 0)).toBe(0);
  });
  it.each([1, 2, 3])('rotates only odd runs (%s)', (runs) => {
    const { inning, team } = fixture();
    const striker = inning.strikerId;
    const non = inning.nonStrikerId;
    applyScore(
      inning,
      ball(inning, { runsOffBat: runs, completedRuns: runs }),
      team,
      6,
    );
    expect(inning.strikerId).toBe(runs % 2 ? non : striker);
  });
  it('combines odd runs with end-of-over swap', () => {
    const { inning, team } = fixture();
    const striker = inning.strikerId;
    for (let n = 0; n < 5; n++) applyScore(inning, ball(inning), team, 6);
    applyScore(
      inning,
      ball(inning, { runsOffBat: 1, completedRuns: 1 }),
      team,
      6,
    );
    expect(inning.strikerId).toBe(striker);
    expect(inning.currentBowlerId).toBeNull();
    expect(inning.overs[0]!.completed).toBe(true);
  });
  it('wide and no-ball do not count; no-ball bat runs count separately', () => {
    const { inning, team } = fixture();
    applyScore(
      inning,
      ball(inning, { extras: 1, extraType: 'wide', legalDelivery: false }),
      team,
      6,
    );
    applyScore(
      inning,
      ball(inning, {
        extras: 1,
        extraType: 'no_ball',
        legalDelivery: false,
        runsOffBat: 6,
      }),
      team,
      6,
    );
    expect(inning).toMatchObject({ runs: 8, extras: 2, legalBalls: 0 });
    expect(inning.batting[0]).toMatchObject({ runs: 6, balls: 1, sixes: 1 });
    for (let n = 0; n < 6; n++) applyScore(inning, ball(inning), team, 6);
    expect(inning.overs[0]!.completed).toBe(true);
    expect(inning.bowling.find((b) => b.runs === 8)?.legalBalls).toBe(6);
  });
  it.each(['bye', 'leg_bye'] as const)(
    'excludes %s from bowler and batter; records a maiden',
    (extraType) => {
      const { inning, team } = fixture();
      for (let n = 0; n < 6; n++)
        applyScore(
          inning,
          ball(inning, { extras: 1, extraType, completedRuns: 1 }),
          team,
          6,
        );
      expect(inning.runs).toBe(6);
      expect(inning.batting.reduce((s, b) => s + b.runs, 0)).toBe(0);
      expect(inning.bowling.reduce((s, b) => s + b.runs, 0)).toBe(0);
      expect(inning.bowling.reduce((s, b) => s + b.maidens, 0)).toBe(1);
    },
  );
  it('replaces wicket on last ball, then swaps strike', () => {
    const { inning, team } = fixture();
    const non = inning.nonStrikerId;
    for (let n = 0; n < 5; n++) applyScore(inning, ball(inning), team, 6);
    applyScore(inning, ball(inning, { wicketType: 'caught' }), team, 6);
    expect(inning.strikerId).toBe(non);
    expect(inning.nonStrikerId).toBe(team.battingOrder[2]);
    expect(inning.wickets).toBe(1);
  });
  it('stops all-out without inserting a dismissed batter', () => {
    const { inning, team } = fixture();
    for (let n = 0; n < 5; n++)
      applyScore(inning, ball(inning, { wicketType: 'bowled' }), team, 6);
    expect(inning.completed).toBe(true);
    expect(inning.wickets).toBe(5);
    expect(inning.strikerId).toBeNull();
  });
  it('stops when chase target is reached', () => {
    const { inning, team } = fixture();
    inning.target = 2;
    applyScore(inning, ball(inning, { runsOffBat: 4 }), team, 6);
    expect(inning.completed).toBe(true);
    expect(inning.legalBalls).toBe(1);
  });
  it('rejects impossible wicket and wide combinations', () => {
    expect(() =>
      validateOutcome({
        ...base,
        extras: 1,
        extraType: 'no_ball',
        legalDelivery: false,
        wicketType: 'caught',
      }),
    ).toThrow();
    expect(() =>
      validateOutcome({
        ...base,
        extras: 1,
        extraType: 'wide',
        legalDelivery: false,
        runsOffBat: 4,
      }),
    ).toThrow();
  });
});
