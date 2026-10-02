/**
 * Module 11 toss rules (pure; the server supplies the seeded random numbers, the browser supplies at most its call).
 *
 * The away side calls, the coin is fixed by the match seed, the winner chooses to bat or bowl, and an AI winner
 * chooses with a simple strategy. Nothing here can be influenced by the browser except the call itself, and the
 * call can be made once.
 */
export type TossCall = 'heads' | 'tails';
export type TossDecisionChoice = 'bat' | 'bowl';

export const otherCall = (call: TossCall): TossCall =>
  call === 'heads' ? 'tails' : 'heads';

/** `roll` is a number in [0, 1) from the seeded stream. */
export const coinFromRoll = (roll: number): TossCall =>
  roll < 0.5 ? 'heads' : 'tails';

export interface TossOutcome {
  readonly coin: TossCall;
  readonly winnerTeamId: string;
  readonly loserTeamId: string;
}

/** The caller wins when their call matches the coin. */
export function resolveToss(input: {
  readonly callerTeamId: string;
  readonly otherTeamId: string;
  readonly call: TossCall;
  readonly coin: TossCall;
}): TossOutcome {
  const callerWins = input.call === input.coin;
  return {
    coin: input.coin,
    winnerTeamId: callerWins ? input.callerTeamId : input.otherTeamId,
    loserTeamId: callerWins ? input.otherTeamId : input.callerTeamId,
  };
}

export interface AiTossInput {
  readonly pitchId: string;
  readonly formatId: string;
  /** The AI side's own strengths (Module 0 team definition). */
  readonly battingStrength: number;
  readonly bowlingStrength: number;
}

/**
 * The AI's choice: lean on its own strengths, and on the pitch. A green pitch helps seam early (bowl first), a hard
 * pitch is true for batting first, a dry pitch is best used before it wears (bat first). Deliberately simple.
 */
export function aiTossDecision(input: AiTossInput): TossDecisionChoice {
  const pitchLean =
    input.pitchId === 'pitch.green'
      ? -6
      : input.pitchId === 'pitch.dry'
        ? 4
        : 2;
  const shortFormatChaseLean = input.formatId === 'format.2_over' ? -1 : 0;
  const balance = input.battingStrength - input.bowlingStrength;
  return balance + pitchLean + shortFormatChaseLean >= 0 ? 'bat' : 'bowl';
}

export const tossSummary = (input: {
  readonly winnerName: string;
  readonly decision: TossDecisionChoice;
}): string =>
  `${input.winnerName} won the toss and chose to ${input.decision === 'bat' ? 'bat' : 'bowl'} first.`;
