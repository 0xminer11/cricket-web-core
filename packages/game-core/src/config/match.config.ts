import type { MatchFormat } from '../types/match.types';
export const MATCH_FORMATS: readonly MatchFormat[] = [
  { id: 'format.2_over', displayName: '2 Overs', inningsPerTeam: 1, oversPerInnings: 2, maxWickets: 5, ballsPerOver: 6, powerplayOvers: 1, maxOversPerBowler: 1, tieRule: 'super_over', superOverEnabled: true, rewardMultiplier: 1, aiAggressionModifier: 1.12 },
  { id: 'format.5_over', displayName: '5 Overs', inningsPerTeam: 1, oversPerInnings: 5, maxWickets: 7, ballsPerOver: 6, powerplayOvers: 1, maxOversPerBowler: 2, tieRule: 'super_over', superOverEnabled: true, rewardMultiplier: 1.65, aiAggressionModifier: 1.04 },
];
