import { CAREER_TIERS } from '../config/career.config';
import { ECONOMY_CONFIG } from '../config/economy.config';
import { MATCH_FORMATS } from '../config/match.config';
import { REWARD_CONFIG } from '../config/rewards.config';
import { MATCH_PROGRESSION as P } from './config';

export type MatchResultForPlayer = 'win' | 'loss' | 'tie';

export interface MatchRewardInput {
  readonly formatId: string;
  readonly tierId: string;
  readonly result: MatchResultForPlayer;
  /** 0..10 performance rating, or null when the player neither batted nor bowled. */
  readonly rating: number | null;
  /** Matches against this same opponent among the player's last few: see anti-farm. */
  readonly recentSameOpponentMatches: number;
  /** Current fans, used to cap a per-match loss. */
  readonly fans: number;
  readonly form: number;
}

export interface MatchRewardBreakdown {
  readonly coins: number;
  readonly playerXp: number;
  readonly fans: number;
  readonly reputation: number;
  readonly selectorInterest: number;
  /** Where the coins came from (before the multipliers). */
  readonly parts: {
    readonly participationCoins: number;
    readonly resultCoins: number;
    readonly performanceCoins: number;
    readonly participationXp: number;
    readonly resultXp: number;
    readonly performanceXp: number;
  };
  readonly multipliers: {
    readonly result: number;
    readonly tier: number;
    readonly format: number;
    readonly antiFarm: number;
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The multiplier on the whole base for how the match ended (Module 0: a loss pays about 0.75, never zero). */
export const resultMultiplier = (result: MatchResultForPlayer): number =>
  result === 'win'
    ? REWARD_CONFIG.winResultMultiplier
    : result === 'tie'
      ? P.tieResultMultiplier
      : REWARD_CONFIG.lossResultMultiplier;

/**
 * Repeated fixtures against the same opponent in the recent window pay less, down to the configured floor.
 * The first meeting in the window, and the second, pay in full.
 */
export function antiFarmMultiplier(recentSameOpponentMatches: number): number {
  const repeats = Math.max(0, recentSameOpponentMatches - 1);
  return clamp(
    1 - P.antiFarmStep * repeats,
    REWARD_CONFIG.antiFarm.repeatedOpponentRewardFloor,
    1,
  );
}

/**
 * Pure: the rewards a finished match earns one player. No database, no randomness, and the same input
 * always gives the same output. The server applies the result exactly once (reward_grants gate); the
 * browser never supplies any number here.
 *
 *   coins = round((participation + resultBonus + performance) x result x tier x antiFarm)
 *   xp    = round((participation + resultXp + rating x 12 x format) x result x tier x antiFarm)
 */
export function calculateMatchRewards(
  input: MatchRewardInput,
): MatchRewardBreakdown {
  const format = MATCH_FORMATS.find((f) => f.id === input.formatId);
  const tier = CAREER_TIERS.find((t) => t.id === input.tierId);
  if (!format || !tier) throw new Error('Unknown format or tier');
  const economy =
    format.id === 'format.5_over'
      ? ECONOMY_CONFIG.matches.fiveOver
      : ECONOMY_CONFIG.matches.twoOver;
  const key = format.id as keyof typeof P.xp.participation;
  const rating = input.rating;
  const resultMult = resultMultiplier(input.result);
  const antiFarm = antiFarmMultiplier(input.recentSameOpponentMatches);

  const participationCoins = economy.participation;
  const resultCoins =
    input.result === 'win'
      ? economy.winBonus
      : input.result === 'tie'
        ? Math.round(economy.winBonus / 2)
        : 0;
  // Module 0: performance coins are `rating x 18`, capped by the format. The 5-over cap (180) is exactly rating 10
  // x 18; scaling the cap by rating/10 gives the 2-over format (cap 100) the same shape instead of saturating at 5.6.
  const performanceCoins =
    rating === null
      ? 0
      : Math.min(
          economy.performanceMax,
          Math.round((economy.performanceMax * rating) / 10),
        );
  const coins = Math.round(
    (participationCoins + resultCoins + performanceCoins) *
      resultMult *
      tier.rewardMultiplier *
      antiFarm,
  );

  const participationXp = P.xp.participation[key];
  const resultXp =
    input.result === 'win'
      ? P.xp.win[key]
      : input.result === 'tie'
        ? P.xp.tie[key]
        : 0;
  const performanceXp =
    rating === null
      ? 0
      : Math.round(
          rating * REWARD_CONFIG.performanceXpFactor * format.rewardMultiplier,
        );
  const playerXp = Math.round(
    (participationXp + resultXp + performanceXp) *
      resultMult *
      tier.rewardMultiplier *
      antiFarm,
  );

  // Fans: a routine match earns tens, a good one more; only a sustained poor stretch can lose a few.
  const fans =
    rating === null
      ? Math.round(P.fans.participation * 0.5 * tier.fanMultiplier)
      : rating < P.fans.poorRating && input.form < P.fans.poorFormThreshold
        ? -Math.min(
            Math.round(input.fans * P.fans.poorLossShare),
            Math.floor(input.fans * REWARD_CONFIG.maxSingleMatchFanLossPct),
          )
        : Math.round(
            (P.fans.participation +
              Math.max(0, rating - P.fans.ratingNeutral) *
                P.fans.perRatingPoint) *
              tier.fanMultiplier,
          );

  // Reputation: the player's own performance, a little for a win; capped both ways by the config.
  let reputation = 0;
  if (rating !== null)
    reputation = clamp(
      Math.round(
        (rating - P.reputation.ratingNeutral) * P.reputation.perRatingPoint +
          (input.result === 'win' ? P.reputation.winBonus : 0),
      ),
      -REWARD_CONFIG.maxSingleMatchReputationLoss,
      REWARD_CONFIG.maxSingleMatchReputationGain,
    );

  const selectorInterest =
    rating !== null && rating > P.selectorInterest.ratingThreshold
      ? Math.min(
          P.selectorInterest.max,
          Math.round(
            (rating - P.selectorInterest.ratingThreshold) *
              P.selectorInterest.perRatingPoint *
              tier.selectorVisibility *
              2,
          ),
        )
      : 0;

  return {
    coins: Math.max(0, coins),
    playerXp: Math.max(0, playerXp),
    fans,
    reputation,
    selectorInterest,
    parts: {
      participationCoins,
      resultCoins,
      performanceCoins,
      participationXp,
      resultXp,
      performanceXp,
    },
    multipliers: {
      result: resultMult,
      tier: tier.rewardMultiplier,
      format: format.rewardMultiplier,
      antiFarm,
    },
  };
}
