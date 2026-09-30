export const REWARD_CONFIG = {
  lossResultMultiplier: .75,
  winResultMultiplier: 1.0,
  performanceRatingRange: [0, 10],
  performanceCoinFactor: 18,
  performanceXpFactor: 12,
  maxSingleMatchReputationGain: 18,
  maxSingleMatchReputationLoss: 6,
  maxSingleMatchFanLossPct: .015,
  antiFarm: {
    repeatedOpponentRewardFloor: .55,
    repeatedMatchWindow: 6,
    suspiciousCompletionTimeMultiplier: .10,
  },
} as const;
