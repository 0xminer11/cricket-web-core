/**
 * Module 11: what a finished match does to a career. Module 0 (docs/game-design/11-rewards.md and
 * 15-progression.md) fixes the SHAPE of these rules (participation + result + performance, tier and
 * format multipliers, a loss pays about 0.75 rather than zero, form is an exponentially weighted mean
 * of the last 8 ratings smoothed 75/25, per-match reputation and fan caps) and the headline numbers in
 * `REWARD_CONFIG` and `ECONOMY_CONFIG`. It does not give numbers for Player XP per match, fatigue per
 * match, fans per match or selector interest, so the values below are Module 11's documented
 * interpretations. They are configuration, never hard-coded in a service, and are versioned with the
 * game balance version.
 */
export const MATCH_PROGRESSION = {
  /** Player XP: `participation + result`, plus `rating x REWARD_CONFIG.performanceXpFactor`, then multipliers. */
  xp: {
    participation: { 'format.2_over': 40, 'format.5_over': 70 },
    win: { 'format.2_over': 30, 'format.5_over': 55 },
    tie: { 'format.2_over': 15, 'format.5_over': 27 },
  },
  /** A tie pays this share of the result multiplier between a win (1) and a loss (REWARD_CONFIG.loss). */
  tieResultMultiplier: 0.9,
  /** Several matches in a row against the same side pay less (REWARD_CONFIG.antiFarm sets the floor and window). */
  antiFarmStep: 0.15,
  /** Fatigue after a match (0..100 scale, same as training): participation + per-ball work, eased by Stamina. */
  fatigue: {
    participation: { 'format.2_over': 4, 'format.5_over': 8 },
    perBallFaced: 0.12,
    perLegalBallBowled: 0.25,
    /** Stamina 100 removes this share of the gain. */
    staminaRelief: 0.35,
    max: 25,
  },
  /** Form: 0..100, EWMA of the last 8 ratings (newest first), then smoothed. */
  form: { window: 8, decay: 0.8, retain: 0.75 },
  /** Fans and reputation (per-match caps are REWARD_CONFIG). */
  fans: {
    participation: 20,
    perRatingPoint: 14,
    ratingNeutral: 5,
    /** Match fans scale with the tier's fanMultiplier; a poor stretch loses a share, never more than the config cap. */
    poorRating: 3,
    poorFormThreshold: 30,
    poorLossShare: 0.005,
  },
  reputation: { perRatingPoint: 1.6, ratingNeutral: 5, winBonus: 1 },
  selectorInterest: { ratingThreshold: 6.5, perRatingPoint: 1.2, max: 3 },
  /** A player counts as having taken part in the play (and has a rating) once they have faced or bowled a ball. */
  involvementMinBalls: 1,
} as const;
