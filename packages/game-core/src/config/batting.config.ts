export const CONTACT_QUALITY_BANDS = {
  perfect: [0.88, 1.0],
  good: [0.72, 0.8799],
  okay: [0.56, 0.7199],
  poor: [0.4, 0.5599],
  edge: [0.24, 0.3999],
  miss: [0.0, 0.2399],
} as const;

export const CONTACT_WEIGHTS = {
  userTiming: 0.27,
  shotSelection: 0.18,
  lineLengthFit: 0.16,
  battingSkill: 0.16,
  bowlerChallenge: 0.09,
  pitch: 0.04,
  form: 0.04,
  fatigue: 0.04,
  pressure: 0.02,
} as const;

export const BATTING_MODIFIER_LIMITS = {
  form: [0.94, 1.06],
  fitness: [0.92, 1.02],
  equipment: [1.0, 1.12],
  context: [0.94, 1.06],
  finalEffectiveSkill: [1, 100],
} as const;
