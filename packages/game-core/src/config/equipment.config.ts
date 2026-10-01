export const EQUIPMENT_CONFIG = {
  performanceSlots: ['bat', 'helmet', 'gloves', 'pads', 'shoes'] as const,
  cosmeticSlots: [
    'jersey',
    'pants',
    'wristband',
    'arm_guard',
    'glasses',
    'chain',
    'bat_grip',
    'bat_sticker',
  ] as const,
  maxUpgradeLevel: 10,
  upgradeFailureEnabled: false,
  duplicateItemsAllowed: true,
  inventorySlotLimit: null,
  maxCombinedEffectiveSkillBonusPct: 0.12,
} as const;
