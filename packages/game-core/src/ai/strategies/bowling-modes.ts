import { AI_TUNING } from '../config/tuning';
import type { MatchContext } from '../match-context/context';
import type { BowlingTemperament } from '../personality/personality';
import type { AIBatterView, BowlingMode, MatchSituation } from '../types';

export interface BowlingStrategy {
  readonly mode: BowlingMode;
  readonly reasons: readonly string[];
}

/**
 * The bowling mode (Module 12 section 240), derived from the match every ball. Death overs are always DEATH. Defending a total:
 * a comfortable chase asks for wickets, a hard one for control. Bowling first: a set batter is contained, early overs build
 * pressure, a side that has lost wickets is kept quiet, otherwise wickets are attacked. A wicket-hungry bowler attacks a little
 * sooner.
 */
export function bowlingStrategy(
  situation: MatchSituation,
  ctx: MatchContext,
  batter: Pick<AIBatterView, 'runs' | 'balls'>,
  temperament: BowlingTemperament,
): BowlingStrategy {
  const reasons: string[] = [];
  const hunger = (temperament.wicketSeeking - 0.5) * 0.2;
  if (ctx.phase === 'death') {
    reasons.push('death overs');
    return { mode: 'DEATH', reasons };
  }
  if (ctx.chasing) {
    reasons.push('defending a total');
    if (ctx.chaseDifficulty > 0.7 - hunger) {
      reasons.push('the chase is steep');
      return { mode: 'CONTROL', reasons };
    }
    if (ctx.chaseDifficulty < 0.25 + hunger) {
      reasons.push('the chase is comfortable: wickets are needed');
      return { mode: 'ATTACK_WICKET', reasons };
    }
    return { mode: 'BUILD_PRESSURE', reasons };
  }
  const setBatter = batter.balls >= 4 && batter.runs / Math.max(1, batter.balls) >= 1.5;
  if (setBatter) {
    reasons.push('the batter is set');
    return { mode: 'DEFEND_BOUNDARY', reasons };
  }
  if (ctx.phase === 'early') {
    reasons.push('early innings');
    return { mode: 'BUILD_PRESSURE', reasons };
  }
  const lost = situation.wickets / Math.max(1, situation.maxWickets);
  if (lost >= AI_TUNING.bowling.modes.attackWicketRisk + 0.3 - hunger) {
    reasons.push('wickets have fallen');
    return { mode: 'CONTROL', reasons };
  }
  return { mode: 'ATTACK_WICKET', reasons };
}
