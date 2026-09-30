export const CONTACT_QUALITY_BANDS = {
  perfect: [0.88, 1.00],
  good: [0.72, 0.8799],
  okay: [0.56, 0.7199],
  poor: [0.40, 0.5599],
  edge: [0.24, 0.3999],
  miss: [0.00, 0.2399],
} as const;

export const CONTACT_WEIGHTS = {
  userTiming: .27,
  shotSelection: .18,
  lineLengthFit: .16,
  battingSkill: .16,
  bowlerChallenge: .09,
  pitch: .04,
  form: .04,
  fatigue: .04,
  pressure: .02,
} as const;

export const BATTING_MODIFIER_LIMITS = {
  form: [.94, 1.06],
  fitness: [.92, 1.02],
  equipment: [1.00, 1.12],
  context: [.94, 1.06],
  finalEffectiveSkill: [1, 100],
} as const;
