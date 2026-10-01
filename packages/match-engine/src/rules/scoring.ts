import type {
  EngineInnings,
  EngineBallResult,
  MatchTeamSnapshot,
  Outcome,
} from '../state/types';
import { assert } from '../validation/validate';
/** Rules boundary accepts only server-resolved outcomes, never a browser score. */
export function validateOutcome(o: Outcome): void {
  assert(
    [0, 1, 2, 3, 4, 6].includes(o.runsOffBat) &&
      Number.isInteger(o.extras) &&
      o.extras >= 0,
    'Invalid outcome runs',
  );
  assert(
    o.legalDelivery === !['wide', 'no_ball'].includes(o.extraType ?? ''),
    'Invalid delivery legality',
  );
  assert((o.extras === 0) === (o.extraType === null), 'Invalid extras');
  assert(
    !o.wicketType || (o.legalDelivery && o.runsOffBat === 0 && o.extras === 0),
    'Invalid wicket combination',
  );
  assert(
    o.extraType !== 'wide' || o.runsOffBat === 0,
    'Wide cannot score bat runs',
  );
}
export function applyScore(
  innings: EngineInnings,
  ball: EngineBallResult,
  team: MatchTeamSnapshot,
  ballsPerOver: number,
): void {
  validateOutcome(ball);
  const over = innings.overs.at(-1)!;
  const batter = innings.batting.find((b) => b.playerId === ball.strikerId)!;
  const bowler = innings.bowling.find((b) => b.playerId === ball.bowlerId)!;
  const total = ball.runsOffBat + ball.extras;
  const conceded =
    ball.runsOffBat +
    (['wide', 'no_ball'].includes(ball.extraType ?? '') ? ball.extras : 0);
  batter.runs += ball.runsOffBat;
  // A no-ball faced counts for the batter; a wide does not.
  batter.balls += Number(ball.extraType !== 'wide');
  batter.fours += Number(ball.runsOffBat === 4);
  batter.sixes += Number(ball.runsOffBat === 6);
  innings.runs += total;
  innings.extras += ball.extras;
  innings.legalBalls += Number(ball.legalDelivery);
  over.runs += total;
  over.conceded += conceded;
  over.legalBalls += Number(ball.legalDelivery);
  bowler.runs += conceded;
  bowler.extras += conceded - ball.runsOffBat;
  bowler.legalBalls += Number(ball.legalDelivery);
  bowler.dots += Number(ball.legalDelivery && total === 0);
  if (ball.wicketType) {
    batter.dismissal = ball.wicketType;
    innings.wickets++;
    over.wickets++;
    bowler.wickets++;
    innings.strikerId =
      innings.wickets < innings.maxWickets
        ? team.battingOrder[innings.nextBatterIndex++]!
        : null;
  }
  if (ball.completedRuns % 2)
    [innings.strikerId, innings.nonStrikerId] = [
      innings.nonStrikerId,
      innings.strikerId,
    ];
  over.completed = over.legalBalls === ballsPerOver;
  if (over.completed) {
    [innings.strikerId, innings.nonStrikerId] = [
      innings.nonStrikerId,
      innings.strikerId,
    ];
    innings.currentBowlerId = null;
    if (over.conceded === 0) bowler.maidens++;
  }
  innings.completed =
    innings.wickets >= innings.maxWickets ||
    innings.legalBalls >= innings.maxBalls ||
    (innings.target !== null && innings.runs >= innings.target);
  ball.scoreAfter = innings.runs;
  ball.wicketsAfter = innings.wickets;
  ball.strikerAfter = innings.strikerId;
  ball.nonStrikerAfter = innings.nonStrikerId;
  over.balls.push(ball);
}
