/** Module 8 balance constants. All qualities use 0..1, speeds use m/s. */
export const ENGINE_BALANCE = {
  lineCenters: { wide_off: 0.04, outside_off: 0.27, off_stump: 0.43, middle: 0.55, leg: 0.69, wide_leg: 0.96 },
  lineEdges: [0.12, 0.36, 0.49, 0.62, 0.85],
  lengthCenters: { yorker: 0.06, full: 0.24, good: 0.48, short: 0.72, bouncer: 0.93 },
  lengthEdges: [0.13, 0.34, 0.62, 0.84],
  execution: {
    accuracy: 0.4, control: 0.35, consistency: 0.25, variance: 0.2, error: 0.25, difficulty: 0.25, variationShare: 0.1,
    // Module 9: optional human execution timing (0..1, 0.5 neutral). Skill-based but bounded: perfect timing shrinks the
    // error radius by `inputRadius` and lifts quality by `inputQuality`; it can never replace Accuracy/Control.
    inputQuality: 0.12, inputRadius: 0.35,
  },
  speed: { fast: [28, 16], medium: [23, 12], spin: [17, 9], slower: 0.76, executionFloor: 0.92 },
  extras: { noBallBase: 0.009, noBallError: 0.025, bye: 0.09, legBye: 0.04 },
  contact: { skillTiming: 0.4, technique: 0.35, consistency: 0.25, timingFloor: 0.22, timingSpread: 0.9, reflexAssist: 0.12, mismatchRecovery: 0.22, challengeMovement: 0.45, challengePace: 0.2, difficultyTiming: 0.18 },
  outcome: {
    // Conditional run weights; wickets are sampled first. Order: dot, 1, 2, 3, 4, 6.
    runs: [0, 1, 2, 3, 4, 6],
    perfect: [10, 22, 12, 2, 31, 23], good: [22, 30, 12, 2, 22, 12],
    okay: [35, 34, 12, 2, 13, 4], poor: [52, 30, 9, 1, 7, 1],
    edge: [54, 27, 8, 0, 11, 0], miss: [100, 0, 0, 0, 0, 0],
    wicket: { perfect: 0.006, good: 0.02, okay: 0.055, poor: 0.12, edge: 0.22, miss: 0.24 },
    riskBase: 0.45, riskScale: 2.3, defensiveWicket: 0.45, loftBoundary: 2.1,
    powerFloor: 0.5, powerScale: 1.0, defensiveBoundary: 0.015,
    bowledShare: 0.65, aggressionRisk: 0.4, aggressionPower: 0.2, movementWicket: 1.2, movementBoundary: 0.8, strengthShare: 0.08, defenceShare: 0.2, placementShare: 0.12,
    fieldCoverage: { straight: 1, cover: 0.97, point: 0.95, third_man: 1.05, mid_wicket: 1.02, square_leg: 0.98, fine_leg: 1.05 },
    directionSpread: 20, exitSpeedBase: 10, exitSpeedPower: 30, loftAngle: 38, groundAngle: 8,
  },
  // Module 10: the AI bowler used when a human bats. It varies line, length and delivery but gets no hidden skill.
  ai: {
    bowler: {
      lineWeights: { wide_off: 0.02, outside_off: 0.36, off_stump: 0.26, middle: 0.2, leg: 0.14, wide_leg: 0.02 },
      lengthVariety: 0.32,
      jitter: 0.06,
      easyBias: 2,
    },
  },
  fatiguePerDelivery: 0.045,
  superOver: { overs: 1, wickets: 2, rounds: 1 },
  simulation: { maxDeliveries: 10000, loftProbability: 0.35, defensiveProbability: 0.1, decisionNoise: 0.14, chaseLoftBoost: 0.9, chaseParRate: 1.5, chaseRateSpan: 3 },
  rating: { base: 2, contribution: 5, rate: 1.2, survival: 0.5, win: 0.5, wicket: 1.5, economy: 3, dots: 2, parRunsPerOver: 10 },
} as const;
