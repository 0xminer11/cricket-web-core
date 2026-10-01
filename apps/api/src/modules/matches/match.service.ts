import { randomUUID } from 'node:crypto';
import { isUuid } from '@the-cricketer/database';
import type { Database, Repositories } from '@the-cricketer/database';
import {
  GAME_BALANCE_VERSION,
  MATCH_ENGINE_VERSION,
  TEAMS,
  VENUE_BY_TEAM,
} from '@the-cricketer/game-core';
import {
  createMatchEngine,
  createTeamSnapshot,
  replayMatch,
  RNG_ALGORITHM_VERSION,
  playerPerformances,
} from '@the-cricketer/match-engine';
import type {
  MatchReplay,
  BallAction,
  EngineMatchState,
  EngineBallResult,
} from '@the-cricketer/match-engine';
import { AppError } from '@the-cricketer/server-kit';
import type { PlayerScope } from '../player/equipment.service';
import { MatchSnapshotService } from './match-snapshot.service';
const missing = () =>
  new AppError('MATCH_NOT_FOUND', 'Match or fixture not found.', 404);
export class MatchService {
  constructor(private readonly database: Database) {}
  async start(scope: PlayerScope, fixtureId: string) {
    if (!isUuid(fixtureId)) throw missing();
    return this.database.transaction(
      async (tx) => {
        const repos = this.database.repositories(tx);
        await repos.players.getState(scope.playerId, { forUpdate: true });
        const dashboard = await repos.players.getDashboard(scope.playerId);
        const fixture = await repos.teams.getFixture(fixtureId);
        if (
          !dashboard?.career ||
          !fixture ||
          fixture.careerId !== dashboard.career.id ||
          ![fixture.homeTeamId, fixture.awayTeamId].includes(
            dashboard.career.currentTeamId!,
          )
        )
          throw missing();
        await repos.careerHome.lockCareer(dashboard.career.id);
        const existing = await repos.matches.findByFixture(fixtureId);
        if (existing) return { matchId: existing.id };
        if (fixture.status !== 'scheduled')
          throw new AppError(
            'FIXTURE_NOT_READY',
            'Fixture is not scheduled.',
            409,
          );
        const rows = await repos.teams.getByIds([
          fixture.homeTeamId,
          fixture.awayTeamId,
        ]);
        const snapshotTeam = (id: string) => {
          const row = rows.find((r) => r.id === id)!;
          const definition = TEAMS.find((t) => t.teamId === row.definitionId);
          if (!definition)
            throw new AppError(
              'MATCH_TEAM_MISSING',
              'Team is unavailable.',
              409,
            );
          const team = createTeamSnapshot(definition);
          team.teamId = row.id;
          team.displayName = row.nameOverride ?? definition.name;
          return team;
        };
        const teamA = snapshotTeam(fixture.homeTeamId);
        const teamB = snapshotTeam(fixture.awayTeamId);
        const human = await new MatchSnapshotService().player(
          repos,
          scope.playerId,
        );
        const mine =
          teamA.teamId === dashboard.career.currentTeamId ? teamA : teamB;
        const replaced = mine.players[0]!.playerId;
        mine.players[0] = human;
        mine.battingOrder[0] = human.playerId;
        mine.bowlingOrder = mine.bowlingOrder.filter((id) => id !== replaced);
        if (human.bowlingStyle) mine.bowlingOrder.unshift(human.playerId);
        const pitchId =
          VENUE_BY_TEAM.get(
            rows.find((r) => r.id === fixture.homeTeamId)!.definitionId,
          )?.pitchId ?? 'pitch.hard';
        const seed = randomUUID();
        const summary = await repos.matches.createMatch({
          fixtureId,
          matchMode: 'career',
          matchFormatId: fixture.matchFormatId,
          pitchDefinitionId: pitchId,
          homeTeamId: teamA.teamId,
          awayTeamId: teamB.teamId,
          rngSeed: seed,
          rngAlgorithmVersion: RNG_ALGORITHM_VERSION,
          participants: [teamA, teamB].flatMap((t) =>
            t.players.map((p) => ({
              teamId: t.teamId,
              participantType:
                p.playerId === human.playerId
                  ? ('human' as const)
                  : ('ai' as const),
              ...(p.playerId === human.playerId
                ? { playerId: human.playerId }
                : {}),
              battingPosition: t.battingOrder.indexOf(p.playerId) + 1,
              selectedRole: p.role,
              displayName: p.displayName,
            })),
          ),
        });
        const participantMap: Record<string, string> = {};
        for (const t of [teamA, teamB])
          for (const p of t.players)
            participantMap[p.playerId] = summary.participants.find(
              (r) =>
                r.teamId === t.teamId &&
                r.battingPosition === t.battingOrder.indexOf(p.playerId) + 1,
            )!.id;
        const engine = createMatchEngine();
        engine.startMatch({
          matchId: summary.match.id,
          formatId: fixture.matchFormatId,
          pitchId,
          teamA,
          teamB,
          rngSeed: seed,
          balanceVersion: GAME_BALANCE_VERSION,
          matchEngineVersion: MATCH_ENGINE_VERSION,
        });
        await repos.matches.markReady(summary.match.id);
        await repos.matches.startMatch(summary.match.id);
        await repos.teams.transitionFixture(fixtureId, 'in_progress');
        await repos.matches.createEngineSession({
          matchId: summary.match.id,
          replay: engine.replay(),
          state: engine.snapshot(),
          participantMap,
        });
        return { matchId: summary.match.id };
      },
      { operation: 'match.start' },
    );
  }
  async read(scope: PlayerScope, matchId: string) {
    if (!isUuid(matchId)) throw missing();
    const repos = this.database.repositories();
    const header = await repos.matches.getMatch(matchId);
    if (!header) throw missing();
    const summary = await repos.matches.getMatchSummary(matchId);
    if (!summary.participants.some((p) => p.playerId === scope.playerId))
      throw missing();
    const session = await repos.matches.getEngineSession(matchId);
    if (!session) throw missing();
    // Do not expose seed or opponent snapshots through the public read API.
    return { matchId, state: session.state as EngineMatchState };
  }
  /** Internal authority boundary. There is deliberately no browser /ball route. */
  async resolveBall(
    scope: PlayerScope,
    matchId: string,
    action: BallAction,
    bowlerId?: string,
  ): Promise<EngineBallResult> {
    return this.database.transaction(
      async (tx) => {
        const repos = this.database.repositories(tx);
        await repos.matches.lockMatch(matchId);
        const summary = await repos.matches.getMatchForPlayer(
          scope.playerId,
          matchId,
        );
        const session = await repos.matches.getEngineSession(matchId);
        if (!session) throw missing();
        const replay = session.replay as MatchReplay;
        const engine = replayMatch(replay);
        const previous = replay.commands.find(
          (c) => c.type === 'ball' && c.action.actionId === action.actionId,
        );
        if (previous) return engine.resolveBall(action);
        let state = engine.snapshot();
        if (state.status === 'innings_break') {
          engine.startNextInnings();
          state = engine.snapshot();
        }
        if (state.status !== 'in_progress')
          throw new AppError('MATCH_FINISHED', 'Match is complete.', 409);
        const innings = state.innings[state.currentInningsIndex]!;
        if (!innings.currentBowlerId) {
          if (!bowlerId)
            throw new AppError('BOWLER_REQUIRED', 'Select a bowler.', 400);
          engine.selectBowler(bowlerId);
        }
        const ball = engine.resolveBall(action);
        state = engine.snapshot();
        await this.persistBall(repos, state, ball, session.participantMap);
        if (state.status === 'completed') {
          const result = state.result!;
          await repos.matches.completeMatch({
            matchId,
            resultType: result.type,
            ...(result.winnerTeamId
              ? { winnerTeamId: result.winnerTeamId }
              : {}),
            resultSummary:
              result.type === 'tie'
                ? 'Match tied'
                : `Won by ${result.margin} ${result.marginType}`,
          });
          await repos.matches.setPerformanceRatings(
            matchId,
            playerPerformances(state, replay.input).map((p) => ({
              participantId: session.participantMap[p.playerId]!,
              rating: p.rating,
            })),
          );
          if (summary.match.fixtureId)
            await repos.teams.transitionFixture(
              summary.match.fixtureId,
              'completed',
            );
        }
        await repos.matches.saveEngineSession(
          matchId,
          session.revision,
          engine.replay(),
          state,
        );
        return ball;
      },
      { operation: 'match.ball' },
    );
  }
  private async persistBall(
    repos: Repositories,
    state: EngineMatchState,
    ball: EngineBallResult,
    participants: Record<string, string>,
  ) {
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
}
