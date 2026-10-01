import type { PitchDefinition } from '../types/match.types';
export const PITCHES: readonly PitchDefinition[] = [
  {
    id: 'pitch.green',
    displayName: 'Green',
    paceMultiplier: 1.01,
    bounceMultiplier: 1.0,
    swingMultiplier: 1.05,
    seamMultiplier: 1.08,
    spinMultiplier: 0.96,
    battingDifficultyMultiplier: 1.04,
  },
  {
    id: 'pitch.hard',
    displayName: 'Hard',
    paceMultiplier: 1.04,
    bounceMultiplier: 1.07,
    swingMultiplier: 0.99,
    seamMultiplier: 0.98,
    spinMultiplier: 0.97,
    battingDifficultyMultiplier: 1.02,
  },
  {
    id: 'pitch.dry',
    displayName: 'Dry',
    paceMultiplier: 0.98,
    bounceMultiplier: 0.97,
    swingMultiplier: 0.96,
    seamMultiplier: 0.95,
    spinMultiplier: 1.09,
    battingDifficultyMultiplier: 1.03,
  },
];
