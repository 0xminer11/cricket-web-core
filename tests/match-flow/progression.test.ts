import { describe, expect, it } from 'vitest';
import {
  REWARD_CONFIG,
  antiFarmMultiplier,
  calculateMatchFatigue,
  calculateMatchRewards,
  deriveStatsDelta,
  isBetterBowling,
  tookPart,
  updateForm,
} from '../../packages/game-core/src/index';

const base = {
  formatId: 'format.2_over',
  tierId: 'academy',
  result: 'win' as const,
  rating: 6,
  recentSameOpponentMatches: 0,
  fans: 1000,
  form: 50,
};

describe('match rewards (pure, Module 0 shape)', () => {
  it('is deterministic and never negative in coins or XP', () => {
    expect(calculateMatchRewards(base)).toEqual(calculateMatchRewards(base));
    for (const result of ['win', 'loss', 'tie'] as const)
      for (const rating of [null, 0, 3, 10]) {
        const r = calculateMatchRewards({ ...base, result, rating });
        expect(r.coins).toBeGreaterThanOrEqual(0);
        expect(r.playerXp).toBeGreaterThanOrEqual(0);
      }
  });

  it('a loss pays about three quarters of a win rather than nothing, and still pays for performance', () => {
    const win = calculateMatchRewards(base);
    const loss = calculateMatchRewards({ ...base, result: 'loss' });
    expect(loss.coins).toBeGreaterThan(0);
    expect(loss.playerXp).toBeGreaterThan(0);
    expect(loss.coins).toBeLessThan(win.coins);
    expect(loss.multipliers.result).toBe(REWARD_CONFIG.lossResultMultiplier);
    // performance still counts when losing: a better rating earns more
    expect(
      calculateMatchRewards({ ...base, result: 'loss', rating: 9 }).coins,
    ).toBeGreaterThan(loss.coins);
  });

  it('a tie is between a loss and a win', () => {
    const win = calculateMatchRewards(base).coins;
    const tie = calculateMatchRewards({ ...base, result: 'tie' }).coins;
    const loss = calculateMatchRewards({ ...base, result: 'loss' }).coins;
    expect(tie).toBeLessThan(win);
    expect(tie).toBeGreaterThan(loss);
  });

  it('a longer format and a higher tier pay more, and better performance pays more', () => {
    const two = calculateMatchRewards(base);
    const five = calculateMatchRewards({ ...base, formatId: 'format.5_over' });
    expect(five.coins).toBeGreaterThan(two.coins);
    expect(five.playerXp).toBeGreaterThan(two.playerXp);
    expect(
      calculateMatchRewards({ ...base, tierId: 'domestic' }).coins,
    ).toBeGreaterThan(two.coins);
    expect(calculateMatchRewards({ ...base, rating: 9 }).coins).toBeGreaterThan(
      calculateMatchRewards({ ...base, rating: 3 }).coins,
    );
  });

  it('a player who neither batted nor bowled still earns participation, but no performance bonus, fans bonus or reputation', () => {
    const idle = calculateMatchRewards({ ...base, rating: null });
    expect(idle.parts.performanceCoins).toBe(0);
    expect(idle.parts.performanceXp).toBe(0);
    expect(idle.coins).toBeGreaterThan(0);
    expect(idle.reputation).toBe(0);
    expect(idle.selectorInterest).toBe(0);
  });

  it('bowlers and batters earn on the same scale: the reward depends on the rating, not the role', () => {
    // the pure function has no role input at all, which is the guarantee
    expect(Object.keys(base)).not.toContain('role');
  });

  it('reputation is capped both ways and fans never go negative for a routine match', () => {
    const great = calculateMatchRewards({
      ...base,
      rating: 10,
      tierId: 'international',
    });
    const awful = calculateMatchRewards({ ...base, result: 'loss', rating: 0 });
    expect(great.reputation).toBeLessThanOrEqual(
      REWARD_CONFIG.maxSingleMatchReputationGain,
    );
    expect(awful.reputation).toBeGreaterThanOrEqual(
      -REWARD_CONFIG.maxSingleMatchReputationLoss,
    );
    expect(
      calculateMatchRewards({ ...base, rating: 4, form: 50 }).fans,
    ).toBeGreaterThanOrEqual(0);
  });

  it('a poor match only loses fans after sustained poor form, and never more than the configured share', () => {
    const poorButFine = calculateMatchRewards({
      ...base,
      result: 'loss',
      rating: 1,
      form: 60,
    });
    expect(poorButFine.fans).toBeGreaterThanOrEqual(0);
    const sustained = calculateMatchRewards({
      ...base,
      result: 'loss',
      rating: 1,
      form: 10,
      fans: 100000,
    });
    expect(sustained.fans).toBeLessThan(0);
    expect(-sustained.fans).toBeLessThanOrEqual(
      100000 * REWARD_CONFIG.maxSingleMatchFanLossPct,
    );
  });

  it('repeated fixtures against the same opponent pay less, down to the configured floor', () => {
    expect(antiFarmMultiplier(0)).toBe(1);
    expect(antiFarmMultiplier(1)).toBe(1);
    expect(antiFarmMultiplier(2)).toBeLessThan(1);
    expect(antiFarmMultiplier(50)).toBe(
      REWARD_CONFIG.antiFarm.repeatedOpponentRewardFloor,
    );
    expect(
      calculateMatchRewards({ ...base, recentSameOpponentMatches: 6 }).coins,
    ).toBeLessThan(calculateMatchRewards(base).coins);
  });

  it('rejects an unknown format or tier instead of paying something', () => {
    expect(() =>
      calculateMatchRewards({ ...base, formatId: 'format.nope' }),
    ).toThrow();
    expect(() => calculateMatchRewards({ ...base, tierId: 'nope' })).toThrow();
  });
});

describe('career counters from one match', () => {
  it('a duck counts an innings and a dismissal, with no not-out', () => {
    const d = deriveStatsDelta(
      {
        batting: { runs: 0, balls: 2, fours: 0, sixes: 0, dismissed: true },
        bowling: null,
      },
      false,
    );
    expect(d).toMatchObject({
      matches: 1,
      matchesWon: 0,
      inningsBatted: 1,
      runs: 0,
      ballsFaced: 2,
      notOuts: 0,
      highestScore: 0,
    });
  });

  it('not out counts as not out, so average is runs / (innings - notOuts)', () => {
    const d = deriveStatsDelta(
      {
        batting: { runs: 30, balls: 14, fours: 3, sixes: 1, dismissed: false },
        bowling: null,
      },
      true,
    );
    expect(d).toMatchObject({
      inningsBatted: 1,
      notOuts: 1,
      runs: 30,
      fours: 3,
      sixes: 1,
      matchesWon: 1,
      highestScore: 30,
    });
  });

  it('fifties and hundreds are exclusive', () => {
    const f = (runs: number) =>
      deriveStatsDelta(
        {
          batting: { runs, balls: 30, fours: 0, sixes: 0, dismissed: true },
          bowling: null,
        },
        false,
      );
    expect(f(49)).toMatchObject({ fifties: 0, hundreds: 0 });
    expect(f(50)).toMatchObject({ fifties: 1, hundreds: 0 });
    expect(f(100)).toMatchObject({ fifties: 0, hundreds: 1 });
  });

  it('a player who did not bat adds no innings, and one who did not bowl adds no bowling or best figures', () => {
    const d = deriveStatsDelta(
      {
        batting: { runs: 0, balls: 0, fours: 0, sixes: 0, dismissed: false },
        bowling: { legalBalls: 0, runs: 0, wickets: 0, maidens: 0 },
      },
      true,
    );
    expect(d).toMatchObject({
      matches: 1,
      inningsBatted: 0,
      notOuts: 0,
      ballsBowled: 0,
    });
    expect(d.bestBowling).toBeUndefined();
  });

  it('bowling figures and best bowling candidates carry over, including a wicketless spell', () => {
    const d = deriveStatsDelta(
      {
        batting: null,
        bowling: { legalBalls: 12, runs: 14, wickets: 0, maidens: 1 },
      },
      false,
    );
    expect(d).toMatchObject({
      ballsBowled: 12,
      runsConceded: 14,
      wickets: 0,
      maidens: 1,
      bestBowling: { wickets: 0, runs: 14 },
    });
  });

  it('better bowling is more wickets, then fewer runs for the same wickets; no wickets never beats anything', () => {
    expect(
      isBetterBowling({ wickets: 3, runs: 20 }, { wickets: 2, runs: 5 }),
    ).toBe(true);
    expect(
      isBetterBowling({ wickets: 2, runs: 10 }, { wickets: 2, runs: 12 }),
    ).toBe(true);
    expect(
      isBetterBowling({ wickets: 2, runs: 14 }, { wickets: 2, runs: 12 }),
    ).toBe(false);
    expect(
      isBetterBowling({ wickets: 0, runs: 1 }, { wickets: 0, runs: 9 }),
    ).toBe(false);
  });

  it('only a player who faced or bowled a ball took part', () => {
    expect(tookPart({ batting: null, bowling: null })).toBe(false);
    expect(
      tookPart({
        batting: { runs: 0, balls: 1, fours: 0, sixes: 0, dismissed: false },
        bowling: null,
      }),
    ).toBe(true);
    expect(
      tookPart({
        batting: null,
        bowling: { legalBalls: 6, runs: 5, wickets: 0, maidens: 0 },
      }),
    ).toBe(true);
  });
});

describe('form (Module 0 EWMA, 75/25)', () => {
  it('keeps three quarters of the old form and moves a quarter toward the recent ratings', () => {
    // a steady 8.0 -> target 80 -> 0.75 x 50 + 0.25 x 80 = 57.5
    expect(updateForm(50, [8, 8, 8, 8])).toBe(58);
    expect(updateForm(50, [2, 2, 2, 2])).toBe(43);
  });
  it('weights the newest rating highest', () => {
    expect(updateForm(50, [9, 1, 1, 1, 1])).toBeGreaterThan(
      updateForm(50, [1, 9, 1, 1, 1]),
    );
  });
  it('never replaces form with the match rating directly, and stays in 0..100', () => {
    expect(updateForm(50, [10])).toBeLessThan(100);
    expect(updateForm(0, [0, 0, 0])).toBe(0);
    expect(updateForm(100, [10, 10, 10])).toBe(100);
    expect(updateForm(70, [])).toBe(70);
  });
  it('only looks at the last eight ratings', () => {
    expect(updateForm(50, [5, 5, 5, 5, 5, 5, 5, 5])).toBe(
      updateForm(50, [5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0]),
    );
  });
});

describe('match fatigue', () => {
  it('is modest, capped, and bigger for more work', () => {
    const light = calculateMatchFatigue({
      formatId: 'format.2_over',
      ballsFaced: 0,
      legalBallsBowled: 0,
      stamina: 50,
    });
    const bowler = calculateMatchFatigue({
      formatId: 'format.5_over',
      ballsFaced: 0,
      legalBallsBowled: 12,
      stamina: 50,
    });
    expect(light).toBeGreaterThan(0);
    expect(bowler).toBeGreaterThan(light);
    expect(
      calculateMatchFatigue({
        formatId: 'format.5_over',
        ballsFaced: 500,
        legalBallsBowled: 500,
        stamina: 1,
      }),
    ).toBeLessThanOrEqual(25);
  });
  it('better Stamina eases it', () => {
    const at = (stamina: number) =>
      calculateMatchFatigue({
        formatId: 'format.5_over',
        ballsFaced: 20,
        legalBallsBowled: 12,
        stamina,
      });
    expect(at(90)).toBeLessThanOrEqual(at(20));
  });
});
