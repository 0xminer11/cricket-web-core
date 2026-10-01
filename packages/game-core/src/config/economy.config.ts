export const ECONOMY_CONFIG = {
  starter: { coins: 2500, gems: 50 },
  matches: {
    twoOver: { participation: 120, winBonus: 80, performanceMax: 100 },
    fiveOver: { participation: 240, winBonus: 150, performanceMax: 180 },
  },
  training: { basic: 60, advanced: 140 },
  equipmentPriceBands: {
    common: [300, 700],
    uncommon: [700, 1400],
    rare: [1400, 3000],
    epic: [3000, 6500],
    legendary: [6500, 12000],
  },
  equipmentUpgradeCostMultiplierByLevel: [
    0, 0.2, 0.3, 0.42, 0.56, 0.72, 0.9, 1.1, 1.32, 1.56, 1.82,
  ],
  maxEquipmentContributionToEffectiveSkill: 0.12,
} as const;
