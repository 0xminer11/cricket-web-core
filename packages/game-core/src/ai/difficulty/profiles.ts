import { AI_DIFFICULTY } from '../../config/ai.config';
import { AI_TUNING } from '../config/tuning';
import type { AIDifficultyId, AIDifficultyProfile, AIProfile } from '../types';

/**
 * The four difficulty profiles. Module 0 (docs/game-design/12-ai-design.md) names the difficulty axes: decision noise, risk
 * discipline and tactical memory feed this table directly. Module 0 also lists `executionVariance`, which this module
 * deliberately does NOT use: letting difficulty shrink or grow how accurately a delivery or a shot is executed would be a hidden
 * stat change, and Module 12's rule is that difficulty changes decisions only. (`tests/ai/fairness` asserts the field is read
 * nowhere in the AI.)
 */
const DETAIL: Record<
  AIDifficultyId,
  Omit<
    AIDifficultyProfile,
    'id' | 'label' | 'decisionNoise' | 'riskAwareness' | 'memoryWindow'
  >
> = {
  rookie: {
    temperature: 0.34,
    planningDepth: 0,
    adaptationStrength: 0.25,
    matchupAwareness: 0.35,
    memoryAccuracy: 0.45,
    perceptionAccuracy: 0.55,
    mistakeRate: 0.11,
  },
  amateur: {
    temperature: 0.22,
    planningDepth: 1,
    adaptationStrength: 0.5,
    matchupAwareness: 0.6,
    memoryAccuracy: 0.65,
    perceptionAccuracy: 0.72,
    mistakeRate: 0.06,
  },
  pro: {
    temperature: 0.14,
    planningDepth: 2,
    adaptationStrength: 0.75,
    matchupAwareness: 0.8,
    memoryAccuracy: 0.85,
    perceptionAccuracy: 0.86,
    mistakeRate: 0.025,
  },
  elite: {
    temperature: 0.08,
    planningDepth: 3,
    adaptationStrength: 0.92,
    matchupAwareness: 0.95,
    memoryAccuracy: 0.97,
    perceptionAccuracy: 0.95,
    mistakeRate: 0.008,
  },
};

const LABELS: Record<AIDifficultyId, string> = {
  rookie: 'Rookie',
  amateur: 'Amateur',
  pro: 'Pro',
  elite: 'Elite',
};

export const AI_DIFFICULTY_IDS = ['rookie', 'amateur', 'pro', 'elite'] as const;

export const AI_DIFFICULTY_PROFILES: Readonly<
  Record<AIDifficultyId, AIDifficultyProfile>
> = Object.fromEntries(
  AI_DIFFICULTY_IDS.map((id) => [
    id,
    {
      id,
      label: LABELS[id],
      decisionNoise: AI_DIFFICULTY[id].decisionNoise,
      riskAwareness: AI_DIFFICULTY[id].riskDiscipline,
      memoryWindow: AI_DIFFICULTY[id].tacticalMemory,
      ...DETAIL[id],
    },
  ]),
) as Record<AIDifficultyId, AIDifficultyProfile>;

/**
 * Static AI profiles: a difficulty plus small stylistic tilts. Personality comes from each PLAYER (it is never copied here);
 * the profile only says how sophisticated the decision system is. Profiles may be overridden per team later.
 */
export const AI_PROFILES: Readonly<Record<AIDifficultyId, AIProfile>> = {
  rookie: {
    id: 'rookie',
    difficulty: AI_DIFFICULTY_PROFILES.rookie,
    aggressionBias: 0.02,
    patienceBias: 0,
    variationPreference: 0.3,
    adaptationRate: 0.3,
  },
  amateur: {
    id: 'amateur',
    difficulty: AI_DIFFICULTY_PROFILES.amateur,
    aggressionBias: 0,
    patienceBias: 0,
    variationPreference: 0.5,
    adaptationRate: 0.55,
  },
  pro: {
    id: 'pro',
    difficulty: AI_DIFFICULTY_PROFILES.pro,
    aggressionBias: 0,
    patienceBias: 0,
    variationPreference: 0.65,
    adaptationRate: 0.75,
  },
  elite: {
    id: 'elite',
    difficulty: AI_DIFFICULTY_PROFILES.elite,
    aggressionBias: 0,
    patienceBias: 0,
    variationPreference: 0.8,
    adaptationRate: 0.9,
  },
};

export const isDifficultyId = (id: unknown): id is AIDifficultyId =>
  typeof id === 'string' && (AI_DIFFICULTY_IDS as readonly string[]).includes(id);

export const profileFor = (id: unknown): AIProfile =>
  AI_PROFILES[isDifficultyId(id) ? id : AI_TUNING.defaultDifficulty];

/** The difficulty the opposition plays at in a career tier (Module 0: difficulty rises with the tier). */
export const difficultyForTier = (tierId: string): AIDifficultyId => {
  const id = AI_TUNING.tierDifficulty[tierId];
  return isDifficultyId(id) ? id : AI_TUNING.defaultDifficulty;
};
