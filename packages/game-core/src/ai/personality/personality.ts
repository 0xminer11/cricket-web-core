import { AI_TUNING } from '../config/tuning';
import { clamp01 } from '../core/math';
import type { AIBatterView, AIBowlerView } from '../types';

/**
 * What a player's personality (Module 0: Confidence, Discipline, Risk Appetite) means for HOW they choose. Personality is read
 * from the player's own snapshot (it develops over a career); it is never copied into an AI profile, and it only shifts
 * preferences and noise: it never changes an attribute.
 */
export interface BattingTemperament {
  /** -1 (cautious) .. +1 (risk-taking), from Risk Appetite. */
  readonly riskTilt: number;
  /** -1 .. +1, from Confidence. */
  readonly confidenceTilt: number;
  /** Multiplies the penalty for playing a shot that does not suit the ball (Discipline). */
  readonly mismatchMultiplier: number;
  /** Multiplies the softmax temperature (a disciplined batter is steadier). */
  readonly temperatureMultiplier: number;
  /** Multiplies the chance of a tactical lapse. */
  readonly mistakeMultiplier: number;
}

const tilt = (v: number): number => Math.max(-1, Math.min(1, (v - 50) / 50));

export function battingTemperament(
  batter: Pick<AIBatterView, 'personality'>,
  pressure: number,
): BattingTemperament {
  const p = batter.personality;
  const discipline = clamp01(p.discipline / 100);
  const composure = clamp01((p.confidence + p.discipline) / 200);
  // pressure bends decisions only for batters who are neither confident nor disciplined, and only modestly
  const wobble = clamp01(pressure * (1 - composure) * 0.8);
  return {
    riskTilt: tilt(p.riskAppetite),
    confidenceTilt: tilt(p.confidence),
    mismatchMultiplier: 0.6 + 0.8 * discipline,
    temperatureMultiplier: (1.3 - 0.6 * discipline) * (1 + wobble * 0.5),
    mistakeMultiplier: (1.5 - 1.0 * discipline) * (1 + wobble),
  };
}

export interface BowlingTemperament {
  /** 0..1 how much the bowler leans to the wicket-taking ball. */
  readonly wicketSeeking: number;
  /** 0..1 how consistent the line and length choices are (Discipline). */
  readonly steadiness: number;
  /** 0..1 willingness to try the difficult variations (Confidence). */
  readonly variationNerve: number;
  readonly temperatureMultiplier: number;
  readonly mistakeMultiplier: number;
}

export function bowlingTemperament(
  bowler: Pick<AIBowlerView, 'personality'>,
  pressure: number,
): BowlingTemperament {
  const p = bowler.personality;
  const discipline = clamp01(p.discipline / 100);
  const composure = clamp01((p.confidence + p.discipline) / 200);
  const wobble = clamp01(pressure * (1 - composure) * 0.8);
  return {
    wicketSeeking: clamp01(0.5 + tilt(p.riskAppetite) * 0.5),
    steadiness: discipline,
    variationNerve: clamp01(0.5 + tilt(p.confidence) * 0.5),
    temperatureMultiplier: (1.25 - 0.5 * discipline) * (1 + wobble * 0.5),
    mistakeMultiplier: (1.4 - 0.8 * discipline) * (1 + wobble),
  };
}

export const isTailender = (role: string): boolean =>
  AI_TUNING.batting.tailenderRoles.includes(role);
