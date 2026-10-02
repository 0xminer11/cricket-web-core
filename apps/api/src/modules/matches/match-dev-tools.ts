import type { Database } from '@the-cricketer/database';
import {
  MatchRandom,
  replayMatch,
  stepSimulation,
  stepSimulationAI,
} from '@the-cricketer/match-engine';
import type { MatchReplay } from '@the-cricketer/match-engine';
import { AppError } from '@the-cricketer/server-kit';
import type {
  DevArrangeTossRequest,
  DevForceResultRequest,
  MatchPlayStateDto,
} from '@the-cricketer/shared-types';
import type { PlayerScope } from '../player/equipment.service';
import type { MatchFlowService } from './match-flow.service';
import type { MatchPlayService } from './match-play.service';

class DevToolError extends AppError {}

/**
 * DEVELOPMENT ONLY. This class is constructed only when the API runs with `devTools` (development and test), and its
 * route is registered under the same condition, so a production process has neither. It lets a developer see the
 * result screen for a win, a loss or a tie without playing a match: it re-seeds a match that has had no ball so the real
 * engine ends that way, then plays the match out through the NORMAL pipeline (so stats, rewards and the stored result are
 * produced by the same code a real match uses). It never writes a result, a stat or a reward itself.
 */
export class MatchDevTools {
  constructor(
    private readonly database: Database,
    private readonly play: MatchPlayService,
    private readonly flow: MatchFlowService,
  ) {}

  /** Re-seeds a match that has not been tossed so the coin lands the way the developer wants (the coin is a pure function of the seed). */
  async arrangeToss(
    scope: PlayerScope,
    request: DevArrangeTossRequest,
  ): Promise<{ seed: string }> {
    const view = await this.flow.flow(scope, request.matchId); // authorises
    if (view.stage !== 'toss')
      throw new DevToolError(
        'INVALID_TOSS_STATE',
        'The toss has already been made.',
        409,
      );
    const session = await this.database
      .repositories()
      .matches.getEngineSession(request.matchId);
    const aiCall = (
      session?.flow as { toss?: { aiCall?: 'heads' | 'tails' } } | undefined
    )?.toss?.aiCall;
    const youCall = view.toss.youCall;
    const call = youCall ? 'heads' : (aiCall ?? 'heads');
    for (let n = 0; n < 200; n++) {
      const seed = `dev-toss-${request.matchId.slice(0, 8)}-${n}`;
      const coin =
        new MatchRandom(`${seed}:toss:coin`).next() < 0.5 ? 'heads' : 'tails';
      const callerWins = coin === call;
      if ((youCall ? callerWins : !callerWins) !== request.userWins) continue;
      await this.database.transaction(
        async (tx) => {
          const repos = this.database.repositories(tx);
          await repos.matches.lockMatch(request.matchId);
          await repos.matches.devReseed(request.matchId, seed);
        },
        { operation: 'match.dev.reseed' },
      );
      return { seed };
    }
    throw new DevToolError('DEV_NO_SEED', 'No seed arranged the toss.', 409);
  }

  async forceResult(
    scope: PlayerScope,
    request: DevForceResultRequest,
  ): Promise<{ seed: string; match: MatchPlayStateDto }> {
    // a match that has not been tossed gets its toss first (you call heads when you call; if you win, you bat)
    let view = await this.flow.flow(scope, request.matchId); // authorises
    if (view.stage === 'toss')
      view = await this.flow.callToss(
        scope,
        request.matchId,
        view.toss.youCall ? { call: 'heads' } : {},
      );
    if (view.stage === 'toss_decision')
      await this.flow.decide(scope, request.matchId, { decision: 'bat' });
    let state = await this.play.state(scope, request.matchId);
    if (state.phase === 'completed')
      throw new DevToolError('INVALID_MATCH_STAGE', 'The match is over.', 409);
    if (state.expectedSequence !== 1 || state.innings.number !== 1)
      throw new DevToolError(
        'INVALID_MATCH_STAGE',
        'Only a match that has had no ball can be arranged.',
        409,
      );
    const read = this.database.repositories();
    const session = await read.matches.getEngineSession(request.matchId);
    if (!session)
      throw new DevToolError('MATCH_NOT_FOUND', 'Match not found.', 404);
    const replay = session.replay as MatchReplay;
    const yours = state.you.teamId;
    let chosen: string | null = null;
    for (let n = 0; n < 8000 && !chosen; n++) {
      const seed = `dev-force-${request.matchId.slice(0, 8)}-${n}`;
      const candidate = JSON.parse(JSON.stringify(replay)) as MatchReplay;
      candidate.input.rngSeed = seed;
      const engine = replayMatch(candidate);
      for (let i = 0; i < 500 && engine.cursor().status !== 'completed'; i++)
        (candidate.input.ai ? stepSimulationAI : stepSimulation)(engine, candidate.input);
      const result = engine.snapshot().result;
      const outcome =
        result?.type === 'tie'
          ? 'tie'
          : result?.winnerTeamId === yours
            ? 'win'
            : 'loss';
      if (outcome === request.outcome) chosen = seed;
    }
    if (!chosen)
      throw new DevToolError(
        'DEV_NO_SEED',
        'No seed produced that result in this match.',
        409,
      );
    await this.database.transaction(
      async (tx) => {
        const repos = this.database.repositories(tx);
        await repos.matches.lockMatch(request.matchId);
        await repos.matches.devReseed(request.matchId, chosen!);
      },
      { operation: 'match.dev.reseed' },
    );
    if (request.play)
      for (let guard = 0; guard < 40 && state.phase !== 'completed'; guard++)
        state =
          state.phase === 'innings_break'
            ? await this.play.advance(scope, request.matchId)
            : (
                await this.play.simulate(scope, request.matchId, {
                  mode: 'innings',
                })
              ).match;
    return { seed: chosen, match: state };
  }
}
