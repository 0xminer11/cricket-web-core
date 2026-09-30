export const BOWLING_STYLE_WEIGHTS = {
  right_arm_fast: { pace: .30, accuracy: .20, seam: .14, swing: .10, control: .12, variation: .08, consistency: .06, spin: 0 },
  left_arm_fast: { pace: .28, accuracy: .20, seam: .13, swing: .13, control: .12, variation: .08, consistency: .06, spin: 0 },
  right_arm_medium: { pace: .12, accuracy: .22, seam: .15, swing: .18, control: .16, variation: .10, consistency: .07, spin: 0 },
  left_arm_medium: { pace: .10, accuracy: .22, seam: .13, swing: .20, control: .16, variation: .11, consistency: .08, spin: 0 },
  off_spin: { pace: 0, accuracy: .20, seam: 0, swing: 0, control: .20, variation: .16, consistency: .12, spin: .32 },
  leg_spin: { pace: 0, accuracy: .16, seam: 0, swing: 0, control: .18, variation: .20, consistency: .12, spin: .34 },
  left_arm_orthodox: { pace: 0, accuracy: .20, seam: 0, swing: 0, control: .20, variation: .15, consistency: .13, spin: .32 },
  left_arm_wrist_spin: { pace: 0, accuracy: .15, seam: 0, swing: 0, control: .17, variation: .22, consistency: .12, spin: .34 },
} as const;
