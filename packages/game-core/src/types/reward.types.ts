import type { CurrencyCode } from './common.types';

export interface CurrencyBalance {
  readonly coins: number;
  readonly gems: number;
}

export interface RewardDefinition {
  readonly coins: number;
  readonly playerXp: number;
  readonly skillXpGrants: readonly { readonly statKey: string; readonly amount: number }[];
  readonly fans: number;
  readonly reputation: number;
  readonly premiumCurrency?: { readonly currency: Extract<CurrencyCode, 'gems'>; readonly amount: number };
}

export interface MatchRewards extends RewardDefinition {
  readonly participationCoins: number;
  readonly resultCoins: number;
  readonly performanceCoins: number;
  readonly tierMultiplier: number;
  readonly formatMultiplier: number;
}

export interface Achievement {
  readonly id: `achievement.${string}`;
  readonly category: 'batting' | 'bowling' | 'career' | 'training' | 'collection' | 'social';
  readonly name: string;
  readonly description: string;
  readonly condition: { readonly metric: string; readonly operator: 'gte' | 'eq'; readonly value: number };
  readonly reward: RewardDefinition;
}
