import { PLAYER_CONFIG } from '../config/player.config';
import { MATCH_PROGRESSION as P } from './config';

/**
 * Module 0 form: `target = clamp(EWMA(last 8 ratings, newest weighted highest) / 10 x 100)`,
 * `new = 0.75 x old + 0.25 x target`. The match rating never replaces form directly. Pure; `ratingsNewestFirst`
 * must already include the match just played. With no ratings the form is unchanged.
 */
export function updateForm(
  previousForm: number,
  ratingsNewestFirst: readonly number[],
): number {
  const ratings = ratingsNewestFirst.slice(0, P.form.window);
  if (ratings.length === 0) return clampForm(previousForm);
  let weighted = 0;
  let total = 0;
  ratings.forEach((rating, i) => {
    const weight = P.form.decay ** i;
    weighted += rating * weight;
    total += weight;
  });
  const target = clampForm((weighted / total / 10) * 100);
  return clampForm(
    Math.round(P.form.retain * previousForm + (1 - P.form.retain) * target),
  );
}
const clampForm = (v: number): number =>
  Math.min(PLAYER_CONFIG.form.max, Math.max(PLAYER_CONFIG.form.min, v));

export interface MatchFatigueInput {
  readonly formatId: string;
  readonly ballsFaced: number;
  readonly legalBallsBowled: number;
  /** The player's Stamina (1..100): it eases the gain. */
  readonly stamina: number;
}

/**
 * Fatigue (0..100) a match adds: a share for turning up, a little per ball faced, more per legal ball
 * bowled, eased by Stamina and capped. A short format never produces extreme fatigue.
 */
export function calculateMatchFatigue(input: MatchFatigueInput): number {
  const key = input.formatId as keyof typeof P.fatigue.participation;
  const base =
    (P.fatigue.participation[key] ?? 4) +
    input.ballsFaced * P.fatigue.perBallFaced +
    input.legalBallsBowled * P.fatigue.perLegalBallBowled;
  const relief =
    1 -
    (Math.min(100, Math.max(0, input.stamina)) / 100) * P.fatigue.staminaRelief;
  return Math.min(P.fatigue.max, Math.max(0, Math.round(base * relief)));
}
