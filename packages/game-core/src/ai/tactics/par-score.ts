import { PITCHES } from '../../config/pitch.config';
import { parRunsPerBall } from '../match-context/context';

/**
 * The AI's idea of a par first-innings score (Module 12 sections 117-119): runs per ball for the format scaled a little by how
 * hard the pitch is to bat on. It is used only for strategy (is the chase steep? are we ahead of the rate?); it is never an input to
 * how the engine resolves a ball.
 */
export function parScore(
  formatId: string,
  maxBalls: number,
  pitchId: string,
): number {
  const pitch = PITCHES.find((p) => p.id === pitchId);
  const difficulty = pitch?.battingDifficultyMultiplier ?? 1;
  return Math.round((parRunsPerBall(formatId) * maxBalls) / difficulty);
}
