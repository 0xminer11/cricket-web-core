import { randomUUID } from 'node:crypto';
import { isUuid } from '@the-cricketer/database';
import type { Database } from '@the-cricketer/database';
import {
  GAME_BALANCE_VERSION,
  MATCH_ENGINE_VERSION,
  MATCH_FORMATS,
  battingSlot,
  difficultyForTier,
  AI_TUNING,
  coinFromRoll,
  TEAMS,
  VENUE_BY_TEAM,
} from '@the-cricketer/game-core';
import {
  createMatchEngine,
  createAiSnapshot,
  createTeamSnapshot,
  replayMatch,
  MatchRandom,
  RNG_ALGORITHM_VERSION,
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
import { completeMatchIfFinished, persistBall } from './match-persistence';
const missing = () =>
  new AppError('MATCH_NOT_FOUND', 'Match or fixture not found.', 404);

/**
 * Which AI player the human replaces: the first with the same role, else the first of the same family
 * (batter, bowler, all-rounder), else the opener. Names and attributes of the others are untouched.
 */
function replacedIndex(
  team: { players: { role: string }[] },
  role: string,
): number {
  const family = (r: string) =>
    ['fast_bowler', 'swing_bowler', 'spin_bowler'].includes(r)
      ? 'bowler'
      : r.endsWith('all_rounder')
        ? 'all_rounder'
        : 'batter';
  const exact = team.players.findIndex((p) => p.role === role);
  if (exact >= 0) return exact;
  const same = team.players.findIndex((p) => family(p.role) === family(role));
  return same >= 0 ? same : 0;
}
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
        // the Cricketer takes the place of the AI player whose role is closest to theirs, so the side stays balanced
        const index = replacedIndex(mine, human.role);
        const replaced = mine.players[index]!.playerId;
        mine.players[index] = human;
        // two people on a team sheet never share a name: an AI player who happens to is given a middle initial
        for (const team of [teamA, teamB])
          for (const [i, p] of team.players.entries()) {
            if (
              p.playerId === human.playerId ||
              p.displayName !== human.displayName
            )
              continue;
            const [first, ...rest] = p.displayName.split(' ');
            p.displayName =
              `${first} ${String.fromCharCode(65 + ((i + 7) % 26))}. ${rest.join(' ')}`.trim();
          }
        // the Cricketer bats where their role says (openers open, finishers wait), never beyond the
        // wickets the format allows, so they always get a turn
        const maxWickets = MATCH_FORMATS.find(
          (f) => f.id === fixture.matchFormatId,
        )!.maxWickets;
        mine.battingOrder = mine.battingOrder.filter((id) => id !== replaced);
        mine.battingOrder.splice(
          battingSlot(human.role, maxWickets),
          0,
          human.playerId,
        );
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
          ai: createAiSnapshot(Object.fromEntries([teamA, teamB].map((team) => [team.teamId, team.teamId === dashboard.career.currentTeamId ? AI_TUNING.teammateDifficulty : difficultyForTier(dashboard.career.currentTier)]))),
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
        // The match is created and snapshotted here; the toss happens next, from the team-sheet screen
        // (MatchFlowService), so the engine is created but NOT started: the first innings does not exist yet.
        const engine = createMatchEngine();
        engine.createMatch({
          matchId: summary.match.id,
          formatId: fixture.matchFormatId,
          pitchId,
          teamA,
          teamB,
          rngSeed: seed,
          ai: createAiSnapshot(Object.fromEntries([teamA, teamB].map((team) => [team.teamId, team.teamId === dashboard.career.currentTeamId ? AI_TUNING.teammateDifficulty : difficultyForTier(dashboard.career.currentTier)]))),
          balanceVersion: GAME_BALANCE_VERSION,
          matchEngineVersion: MATCH_ENGINE_VERSION,
        });
        engine.markReady();
        await repos.matches.markReady(summary.match.id);
        await repos.teams.transitionFixture(fixtureId, 'in_progress');
        await repos.matches.createEngineSession({
          matchId: summary.match.id,
          replay: engine.replay(),
          state: engine.snapshot(),
          participantMap,
          // the away side calls; the coin and an AI caller's call come from the seed and are fixed from now on
          flow: {
            toss: {
              callerTeamId: teamB.teamId,
              aiCall: coinFromRoll(new MatchRandom(`${seed}:toss:call`).next()),
            },
          },
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
        await persistBall(repos, state, ball, session.participantMap);
        await completeMatchIfFinished(
          repos,
          state,
          replay.input,
          session.participantMap,
          summary.match.fixtureId,
        );
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
}
