import type { PitchDefinition } from '../types/match.types';
export const PITCHES: readonly PitchDefinition[] = [
  { id: 'pitch.green', displayName: 'Green', paceMultiplier: 1.01, bounceMultiplier: 1.00, swingMultiplier: 1.05, seamMultiplier: 1.08, spinMultiplier: .96, battingDifficultyMultiplier: 1.04 },
  { id: 'pitch.hard', displayName: 'Hard', paceMultiplier: 1.04, bounceMultiplier: 1.07, swingMultiplier: .99, seamMultiplier: .98, spinMultiplier: .97, battingDifficultyMultiplier: 1.02 },
  { id: 'pitch.dry', displayName: 'Dry', paceMultiplier: .98, bounceMultiplier: .97, swingMultiplier: .96, seamMultiplier: .95, spinMultiplier: 1.09, battingDifficultyMultiplier: 1.03 },
];
