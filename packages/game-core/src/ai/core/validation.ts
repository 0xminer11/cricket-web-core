import { AIError } from '../types';
import type { MatchSituation } from '../types';

/** Reject corrupt observations before they can produce non-finite utilities. */
export function validateSituation(s: MatchSituation): void {
  if (![s.maxBalls, s.maxWickets, s.legalBalls, s.wickets, s.runs, s.ballsPerOver, s.inningsNumber].every(Number.isSafeInteger) ||
    s.maxBalls <= 0 || s.maxWickets <= 0 || s.ballsPerOver <= 0 || s.inningsNumber < 1 ||
    s.legalBalls < 0 || s.legalBalls >= s.maxBalls || s.wickets < 0 || s.wickets >= s.maxWickets || s.runs < 0 ||
    !Number.isFinite(s.formatAggression) || s.formatAggression <= 0 ||
    (s.target !== null && (!Number.isSafeInteger(s.target) || s.target <= s.runs)))
    throw new AIError('AI_INVALID_MATCH_STATE', 'The innings is invalid or already finished.');
}

export function validateRatings(value: object, kind: 'AI_INVALID_BATTER' | 'AI_INVALID_BOWLER'): void {
  if (!Object.values(value).every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100))
    throw new AIError(kind, 'Player ratings must be finite and within 0..100.');
}
