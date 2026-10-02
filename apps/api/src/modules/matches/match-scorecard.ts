import { MATCH_FORMATS, PITCH_BY_ID } from '@the-cricketer/game-core';
import { legalBallsToOvers } from '@the-cricketer/match-engine';
import type {
  CreateMatchInput,
  EngineBallResult,
  EngineInnings,
  EngineMatchState,
} from '@the-cricketer/match-engine';
import type {
  ScorecardDto,
  ScorecardInningsDto,
} from '@the-cricketer/shared-types';
import {
  ballLabel,
  findPlayer,
  resultText,
  round,
} from './match-play.presenter';

const surname = (name: string): string => name.split(' ').at(-1) ?? name;

/** "b Khan", "caught b Khan", "lbw b Singh". The fielder is not modelled, so none is ever named. */
export function dismissalText(
  type: string | null,
  bowlerName: string | null,
): string | null {
  if (!type) return null;
  const by = bowlerName ? ` ${surname(bowlerName)}` : '';
  switch (type) {
    case 'bowled':
      return `b${by}`;
    case 'caught':
      return `caught b${by}`;
    case 'lbw':
      return `lbw b${by}`;
    case 'stumped':
      return `stumped b${by}`;
    case 'hit_wicket':
      return `hit wicket b${by}`;
    case 'run_out':
      return 'run out';
    default:
      return type;
  }
}

const allBalls = (innings: EngineInnings): EngineBallResult[] =>
  innings.overs.flatMap((o) => o.balls);

function inningsCard(
  input: CreateMatchInput,
  state: EngineMatchState,
  innings: EngineInnings,
  youPlayerId: string,
  perOver: number,
): ScorecardInningsDto {
  const name = (id: string) => findPlayer(input, id)!.player.displayName;
  const team =
    input.teamA.teamId === innings.battingTeamId ? input.teamA : input.teamB;
  const balls = allBalls(innings);
  const inProgress =
    !innings.completed &&
    state.innings.at(-1) === innings &&
    state.status === 'in_progress';
  const dismissedBy = new Map<string, string>();
  for (const ball of balls)
    if (ball.wicketType) dismissedBy.set(ball.strikerId, ball.bowlerId);

  const came = (b: EngineInnings['batting'][number], index: number) =>
    index < innings.nextBatterIndex || b.balls > 0 || b.dismissal !== null;
  const batting = innings.batting
    .map((b, index) => ({ b, index }))
    .filter(({ b, index }) => came(b, index))
    .map(({ b }) => {
      const atCrease =
        inProgress &&
        (innings.strikerId === b.playerId ||
          innings.nonStrikerId === b.playerId);
      const bowlerId = dismissedBy.get(b.playerId);
      return {
        playerId: b.playerId,
        name: name(b.playerId),
        isYou: b.playerId === youPlayerId,
        dismissal: b.dismissal
          ? dismissalText(b.dismissal, bowlerId ? name(bowlerId) : null)
          : 'not out',
        notOut: b.dismissal === null,
        batting: atCrease,
        runs: b.runs,
        balls: b.balls,
        fours: b.fours,
        sixes: b.sixes,
        strikeRate: b.balls > 0 ? round((b.runs * 100) / b.balls, 1) : null,
      };
    });
  const didNotBat = innings.batting
    .filter((b, index) => !came(b, index))
    .map((b) => name(b.playerId));

  // fall of wickets: the running score at each wicket, over text from the legal balls bowled so far
  const fallOfWickets: ScorecardInningsDto['fallOfWickets'] = [];
  let legal = 0;
  for (const ball of balls) {
    if (ball.legalDelivery) legal++;
    if (ball.wicketType)
      fallOfWickets.push({
        wicket: ball.wicketsAfter,
        score: ball.scoreAfter,
        batter: name(ball.strikerId),
        over: legalBallsToOvers(legal, perOver),
      });
  }
  const extra = (type: EngineBallResult['extraType']) =>
    balls.filter((b) => b.extraType === type).reduce((n, b) => n + b.extras, 0);
  const oversText = legalBallsToOvers(innings.legalBalls, perOver);
  return {
    number: innings.inningsNumber,
    teamName: team.displayName,
    isSuperOver: innings.isSuperOver,
    inProgress,
    score: `${innings.runs}/${innings.wickets}`,
    runs: innings.runs,
    wickets: innings.wickets,
    oversText,
    total: `${innings.runs}/${innings.wickets} (${oversText} Overs)`,
    runRate:
      innings.legalBalls > 0
        ? round((innings.runs * perOver) / innings.legalBalls, 2)
        : null,
    target: innings.target,
    extras: {
      total: innings.extras,
      wides: extra('wide'),
      noBalls: extra('no_ball'),
      byes: extra('bye'),
      legByes: extra('leg_bye'),
    },
    batting,
    didNotBat,
    bowling: innings.bowling
      .filter(
        (b) =>
          b.legalBalls > 0 ||
          b.runs > 0 ||
          innings.currentBowlerId === b.playerId,
      )
      .map((b) => ({
        playerId: b.playerId,
        name: name(b.playerId),
        isYou: b.playerId === youPlayerId,
        oversText: legalBallsToOvers(b.legalBalls, perOver),
        maidens: b.maidens,
        runs: b.runs,
        wickets: b.wickets,
        economy:
          b.legalBalls > 0 ? round((b.runs * perOver) / b.legalBalls, 2) : null,
      })),
    fallOfWickets,
  };
}

export function buildScorecard(input: {
  readonly matchId: string;
  readonly state: EngineMatchState;
  readonly createInput: CreateMatchInput;
  readonly youPlayerId: string;
  readonly timeline: boolean;
  readonly tossText: string | null;
}): ScorecardDto {
  const { state, createInput } = input;
  const format = MATCH_FORMATS.find((f) => f.id === state.formatId)!;
  const perOver = format.ballsPerOver;
  const innings = state.innings.map((i) =>
    inningsCard(createInput, state, i, input.youPlayerId, perOver),
  );
  const name = (id: string) => findPlayer(createInput, id)!.player.displayName;
  return {
    matchId: input.matchId,
    status:
      state.status === 'completed'
        ? 'completed'
        : state.status === 'abandoned'
          ? 'abandoned'
          : state.status === 'innings_break'
            ? 'innings_break'
            : 'in_progress',
    format: format.displayName,
    pitch:
      PITCH_BY_ID.get(state.pitchId as never)?.displayName ?? state.pitchId,
    tossText: input.tossText,
    resultText: resultText(state, createInput),
    innings,
    timeline: input.timeline
      ? state.innings.flatMap((i) =>
          i.overs.map((o) => ({
            inningsNumber: i.inningsNumber,
            over: o.overNumber,
            bowler: name(o.bowlerId),
            runs: o.balls.reduce((n, b) => n + b.runsOffBat + b.extras, 0),
            wickets: o.balls.filter((b) => b.wicketType !== null).length,
            balls: o.balls.map((b) => {
              const { label, runs } = ballLabel(b);
              return {
                label,
                runs,
                wicket: b.wicketType !== null,
                legal: b.legalDelivery,
              };
            }),
          })),
        )
      : null,
  };
}
