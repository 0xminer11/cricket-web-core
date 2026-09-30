import type { CurrencyCode, TrainingId } from './common.types';

export type TrainingCategory = 'batting' | 'bowling' | 'physical';
export interface TrainingSkillGrant {
  readonly statKey: string;
  readonly skillXp: number;
}
export interface TrainingDefinition {
  readonly id: TrainingId;
  readonly displayName: string;
  readonly category: TrainingCategory;
  readonly grants: readonly TrainingSkillGrant[];
  readonly playerXp: number;
  readonly fatigueGain: number;
  readonly cost: { readonly currency: CurrencyCode; readonly amount: number };
  readonly cooldownMatches: number;
  readonly prerequisites: readonly string[];
}
