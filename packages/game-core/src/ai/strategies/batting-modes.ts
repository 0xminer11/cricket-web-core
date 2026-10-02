import { AI_TUNING } from '../config/tuning';
import { clamp01, gaussian } from '../core/math';
import type { MatchContext } from '../match-context/context';
import type { BattingTemperament } from '../personality/personality';
import type { BattingAIObservation, BattingMode } from '../types';
import type { RandomSource } from '../../utils/runtime';

const T = AI_TUNING.batting.risk;

export interface BattingStrategy {
  /** 0..1: how much risk the batter is willing to take now (0 survive .. 1 all-out attack). */
  readonly risk: number;
  readonly mode: BattingMode;
  readonly reasons: readonly string[];
}

export function battingModeOf(risk: number): BattingMode {
  const m = AI_TUNING.batting.modes;
  return risk < m.survive
    ? 'SURVIVE'
    : risk < m.rotate
      ? 'ROTATE'
      : risk < m.attack
        ? 'BALANCED'
        : risk < m.desperate
          ? 'ATTACK'
          : 'DESPERATE';
}

/**
 * The standard risk appetite (Module 12 section 81): a number from 0 to 1 built from the match, the player's personality and
 * role, the format and the difficulty's risk awareness. High = attacking. It is derived from the context every ball, so the
 * mode follows the match (low required rate with wickets down: cautious; high rate with wickets in hand: aggressive;
 * last wicket: survive unless the chase demands otherwise).
 */
export function battingStrategy(
  obs: Pick<
    BattingAIObservation,
    'batter' | 'situation' | 'profile' | 'teamAggression'
  >,
  ctx: MatchContext,
  temperament: BattingTemperament,
  rng: RandomSource,
): BattingStrategy {
  const reasons: string[] = [];
  let risk: number = T.base;
  const phaseShift = T.phase[ctx.phase];
  risk += phaseShift;
  if (ctx.phase === 'death') reasons.push('death overs');
  else if (ctx.phase === 'early') reasons.push('early innings');

  if (ctx.chasing) {
    const shift = (ctx.chaseDifficulty - 0.35) * T.chase;
    risk += shift;
    if (ctx.chaseDifficulty > 0.6) reasons.push('high required rate');
    else if (ctx.chaseDifficulty < 0.2) reasons.push('low required rate');
  } else {
    // batting first: a modest push to keep up with par as the innings runs out
    risk += ctx.progress * 0.05;
  }

  risk += (ctx.resources - 0.6) * T.resources;
  if (ctx.lastWicket) {
    risk += T.lastWicket * (1 - ctx.chaseDifficulty);
    reasons.push('last wicket');
  }
  risk += temperament.riskTilt * T.personality;
  risk += temperament.confidenceTilt * T.confidence;
  risk += (obs.situation.formatAggression - 1) * T.format;
  if (obs.teamAggression !== null)
    risk += ((obs.teamAggression - 50) / 50) * T.team;
  const role = AI_TUNING.roleBatting[obs.batter.role];
  if (role) risk += role.base + (ctx.phase === 'death' ? role.death : 0);
  risk += obs.profile.aggressionBias - obs.profile.patienceBias;
  // how well the AI reads the situation: lower risk awareness mismanages the rate a little (seeded)
  risk += gaussian(rng) * (1 - obs.profile.difficulty.riskAwareness) * 0.12;
  risk = clamp01(risk);
  return { risk, mode: battingModeOf(risk), reasons };
}
