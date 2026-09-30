import type { CareerTierConfig } from '../types/config.types';

export const CAREER_TIERS: readonly CareerTierConfig[] = [
  { id: 'academy', minReputation: 0, recommendedOverall: [28,45], difficultyMultiplier: .82, rewardMultiplier: .75, fanMultiplier: .55, selectorVisibility: .20, contractValueMultiplier: .45, matchesPerSeason: 8 },
  { id: 'club', minReputation: 80, recommendedOverall: [38,55], difficultyMultiplier: .90, rewardMultiplier: .90, fanMultiplier: .70, selectorVisibility: .35, contractValueMultiplier: .65, matchesPerSeason: 10 },
  { id: 'district', minReputation: 200, recommendedOverall: [47,64], difficultyMultiplier: .98, rewardMultiplier: 1.00, fanMultiplier: .90, selectorVisibility: .50, contractValueMultiplier: .85, matchesPerSeason: 12 },
  { id: 'domestic', minReputation: 380, recommendedOverall: [56,74], difficultyMultiplier: 1.06, rewardMultiplier: 1.20, fanMultiplier: 1.20, selectorVisibility: .68, contractValueMultiplier: 1.15, matchesPerSeason: 14 },
  { id: 'franchise', minReputation: 620, recommendedOverall: [66,84], difficultyMultiplier: 1.14, rewardMultiplier: 1.50, fanMultiplier: 1.65, selectorVisibility: .82, contractValueMultiplier: 1.55, matchesPerSeason: 16 },
  { id: 'international', minReputation: 820, recommendedOverall: [76,95], difficultyMultiplier: 1.22, rewardMultiplier: 1.90, fanMultiplier: 2.20, selectorVisibility: .95, contractValueMultiplier: 2.20, matchesPerSeason: 18 },
];
