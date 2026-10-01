export const REWARD_CONFIG = {
  lossResultMultiplier: 0.75,
  winResultMultiplier: 1.0,
  performanceRatingRange: [0, 10],
  performanceCoinFactor: 18,
  performanceXpFactor: 12,
  maxSingleMatchReputationGain: 18,
  maxSingleMatchReputationLoss: 6,
  maxSingleMatchFanLossPct: 0.015,
  antiFarm: {
    repeatedOpponentRewardFloor: 0.55,
    repeatedMatchWindow: 6,
    suspiciousCompletionTimeMultiplier: 0.1,
  },
} as const;
