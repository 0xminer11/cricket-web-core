import type { CurrencyCode, TrainingId } from './common.types';

export type TrainingCategory = 'batting' | 'bowling' | 'physical';
/** A normal drill trains skills; a recovery action only lowers fatigue (Module 7). */
export type TrainingKind = 'drill' | 'recovery';
export type TrainingDifficulty = 'easy' | 'medium' | 'hard' | 'elite';

export interface TrainingSkillGrant {
  readonly statKey: string;
  readonly skillXp: number;
}
/**
 * Static, versioned drill definition (Module 0, extended in Module 7 with the display and
 * classification fields the Training Hub needs). Never copied into the database: sessions store
 * the definition id plus a snapshot of what actually happened.
 */
export interface TrainingDefinition {
  readonly id: TrainingId;
  readonly displayName: string;
  readonly description: string;
  readonly category: TrainingCategory;
  /** Defaults to 'drill'. */
  readonly kind?: TrainingKind;
  readonly difficulty: TrainingDifficulty;
  /** The first grant is the primary skill; the rest are secondary. */
  readonly grants: readonly TrainingSkillGrant[];
  readonly playerXp: number;
  readonly fatigueGain: number;
  readonly cost: { readonly currency: CurrencyCode; readonly amount: number };
  /** In career matches (Module 8). Every current drill is 0. */
  readonly cooldownMatches: number;
  /** When set, only these roles can use the drill (none configured today: role guides, never gates). */
  readonly requiredRoles?: readonly string[];
  /** Currently `playerLevel>=N` only; anything else makes the drill unavailable. */
  readonly prerequisites: readonly string[];
  /** Bump when the drill's numbers change so history stays explainable. */
  readonly version: number;
  readonly iconAssetId?: `asset.${string}`;
}
