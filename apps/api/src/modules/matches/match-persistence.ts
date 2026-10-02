import type { Repositories } from '@the-cricketer/database';
import { playerPerformances } from '@the-cricketer/match-engine';
import type {
  CreateMatchInput,
  EngineBallResult,
  EngineMatchState,
} from '@the-cricketer/match-engine';

/** Writes one authoritative ball (innings, over and ball rows) inside the caller's transaction. */
export async function persistBall(
  repos: Repositories,
  state: EngineMatchState,
  ball: EngineBallResult,
  participants: Record<string, string>,
): Promise<void> {
  const domain = state.innings[ball.inningsNumber - 1]!;
  const stored = await repos.matches.getMatchSummary(state.matchId);
  let innings = stored.innings.find(
    (i) => i.inningsNumber === ball.inningsNumber,
  );
  innings ??= await repos.matches.createInnings({
    matchId: state.matchId,
    inningsNumber: ball.inningsNumber,
    battingTeamId: domain.battingTeamId,
    bowlingTeamId: domain.bowlingTeamId,
    isSuperOver: domain.isSuperOver,
    ...(domain.target !== null ? { target: domain.target } : {}),
  });
  const overs = await repos.matches.listOvers(innings.id);
  const over =
    overs.find((o) => o.overNumber === ball.overNumber) ??
    (await repos.matches.startOver({
      inningsId: innings.id,
      overNumber: ball.overNumber,
      bowlerParticipantId: participants[ball.bowlerId]!,
    }));
  await repos.matches.recordBall({
    overId: over.id,
    sequenceNumber: ball.inningsSequence,
    ballInOver: ball.ballInOver,
    strikerParticipantId: participants[ball.strikerId]!,
    nonStrikerParticipantId: participants[ball.nonStrikerId]!,
    bowlerParticipantId: participants[ball.bowlerId]!,
    deliveryDefinitionId: ball.delivery.deliveryDefinitionId,
    shotDefinitionId: ball.shot.shotId,
    line: ball.delivery.actualLine,
    length: ball.delivery.actualLength,
    runsOffBat: ball.runsOffBat,
    extras: ball.extras,
    ...(ball.extraType ? { extraType: ball.extraType } : {}),
    ...(ball.wicketType
      ? {
          wicketType: ball.wicketType,
          dismissedParticipantId: participants[ball.strikerId]!,
        }
      : {}),
    legalDelivery: ball.legalDelivery,
    contactQuality: ball.shot.contactQuality,
    ballSpeed: ball.delivery.speed * 3.6,
  });
  if (domain.overs[ball.overNumber - 1]!.completed || domain.completed)
    await repos.matches.completeOver(over.id);
  if (domain.completed) await repos.matches.completeInnings(innings.id);
}

/** Records the result exactly once, when the engine reports the match complete. */
export async function completeMatchIfFinished(
  repos: Repositories,
  state: EngineMatchState,
  input: CreateMatchInput,
  participants: Record<string, string>,
  fixtureId: string | null,
): Promise<void> {
  if (state.status !== 'completed') return;
  const result = state.result!;
  await repos.matches.completeMatch({
    matchId: state.matchId,
    resultType: result.type,
    ...(result.winnerTeamId ? { winnerTeamId: result.winnerTeamId } : {}),
    resultSummary:
      result.type === 'tie'
        ? 'Match tied'
        : `Won by ${result.margin} ${result.marginType}`,
  });
  // Only players who faced or bowled a ball have a rating: someone who did not take part must not drag their
  // form down with a zero.
  await repos.matches.setPerformanceRatings(
    state.matchId,
    playerPerformances(state, input)
      .filter((p) => (p.batting?.balls ?? 0) + (p.bowling?.legalBalls ?? 0) > 0)
      .map((p) => ({
        participantId: participants[p.playerId]!,
        rating: p.rating,
      })),
  );
  if (fixtureId) await repos.teams.transitionFixture(fixtureId, 'completed');
}
