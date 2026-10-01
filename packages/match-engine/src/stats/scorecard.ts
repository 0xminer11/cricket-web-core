import { ENGINE_BALANCE as B } from '@the-cricketer/game-core';
import type { EngineMatchState, CreateMatchInput } from '../state/types';
import { clamp } from '../modifiers/effective';
export const legalBallsToOvers = (balls: number, perOver = 6): string =>
  `${Math.floor(balls / perOver)}.${balls % perOver}`;
export const strikeRate = (runs: number, balls: number): number =>
  balls > 0 ? (runs * 100) / balls : 0;
export const economyRate = (
  runs: number,
  balls: number,
  perOver = 6,
): number => (balls > 0 ? (runs * perOver) / balls : 0);
export const currentRunRate = economyRate;
export const requiredRate = (
  needed: number,
  remaining: number,
  perOver = 6,
): number | null =>
  needed <= 0 ? 0 : remaining <= 0 ? null : (needed * perOver) / remaining;
export const formatScore = (runs: number, wickets: number): string =>
  `${runs}/${wickets}`;
export function playerPerformances(
  state: EngineMatchState,
  input: CreateMatchInput,
  perOver = 6,
) {
  return [input.teamA, input.teamB].flatMap((team) =>
    team.players.map((player) => {
      const batting = state.innings
        .filter((i) => !i.isSuperOver && i.battingTeamId === team.teamId)
        .flatMap((i) => i.batting)
        .find((b) => b.playerId === player.playerId);
      const bowling = state.innings
        .filter((i) => !i.isSuperOver && i.bowlingTeamId === team.teamId)
        .flatMap((i) => i.bowling)
        .find((b) => b.playerId === player.playerId);
      const innings = state.innings.find(
        (i) => i.battingTeamId === team.teamId,
      )!;
      const won = state.result?.winnerTeamId === team.teamId;
      const batBalls = batting?.balls ?? 0;
      const bowlBalls = bowling?.legalBalls ?? 0;
      const sr = strikeRate(batting?.runs ?? 0, batBalls);
      const economy = economyRate(bowling?.runs ?? 0, bowlBalls, perOver);
      const batRating =
        B.rating.base +
        (B.rating.contribution * (batting?.runs ?? 0)) /
          Math.max(1, innings?.target ?? innings?.runs ?? 1) +
        B.rating.rate * clamp(sr / 200) * (won ? 1 : 0.5) +
        (!batting?.dismissal && batBalls ? B.rating.survival : 0);
      const bowlRating =
        B.rating.base +
        (bowling?.wickets ?? 0) * B.rating.wicket +
        B.rating.economy * clamp(1 - economy / B.rating.parRunsPerOver) +
        (B.rating.dots * (bowling?.dots ?? 0)) / Math.max(1, bowlBalls);
      const rating =
        batBalls + bowlBalls
          ? clamp(
              (batRating * batBalls + bowlRating * bowlBalls) /
                (batBalls + bowlBalls) +
                (won ? B.rating.win : 0),
              0,
              10,
            )
          : 0;
      return {
        playerId: player.playerId,
        batting: batting
          ? { ...batting, strikeRate: sr, notOut: batting.dismissal === null }
          : null,
        bowling: bowling ? { ...bowling, economy } : null,
        rating: Math.round(rating * 10) / 10,
      };
    }),
  );
}
export function matchSummary(
  state: EngineMatchState,
  input: CreateMatchInput,
  perOver = 6,
) {
  return {
    matchId: state.matchId,
    status: state.status,
    innings: state.innings.map((i) => ({
      ...i,
      oversDisplay: legalBallsToOvers(i.legalBalls, perOver),
      runRate: currentRunRate(i.runs, i.legalBalls, perOver),
      requiredRate:
        i.target === null
          ? null
          : requiredRate(i.target - i.runs, i.maxBalls - i.legalBalls, perOver),
    })),
    result: state.result,
    playerPerformance: playerPerformances(state, input, perOver),
  };
}
