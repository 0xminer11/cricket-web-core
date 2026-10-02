import { expect } from 'vitest';
import type { Browser } from './auth';
import type {
  MatchFlowDto,
  MatchPlayStateDto,
  MatchResultDto,
} from '../../packages/shared-types/src/index';
import { execRaw } from '../../packages/database/src/testing/harness';
import { MatchRandom } from '../../packages/match-engine/src/index';
import type { MatchReplay } from '../../packages/match-engine/src/index';
import type { App } from './auth';
import type { TestDatabase } from '../../packages/database/src/testing/harness';
import {
  authenticatedGuest,
  createPlayer,
  createTestPlayerCreationRequest,
} from './player';

/**
 * Plays the toss through the real endpoints: the call (the server uses its own when the AI side calls), and, when the
 * player's side wins, the bat/bowl choice. Returns the flow after the first innings exists.
 */
export async function completeToss(
  browser: Browser,
  matchId: string,
  options: { call?: 'heads' | 'tails'; decision?: 'bat' | 'bowl' } = {},
): Promise<MatchFlowDto> {
  const called = await browser.post(`/api/v1/matches/${matchId}/toss/call`, {
    call: options.call ?? 'heads',
  });
  expect(called.statusCode).toBe(200);
  let flow = called.json().data.flow as MatchFlowDto;
  if (flow.stage === 'toss_decision') {
    const decided = await browser.post(
      `/api/v1/matches/${matchId}/toss/decision`,
      { decision: options.decision ?? 'bowl' },
    );
    expect(decided.statusCode).toBe(200);
    flow = decided.json().data.flow as MatchFlowDto;
  }
  expect(flow.started).toBe(true);
  return flow;
}

type Ctx = () => TestDatabase;

/** A signed-in guest with a new Cricketer and their first fixture started: the match exists, the toss has not happened. */
export async function startCareerMatch(
  app: App,
  ctx: Ctx,
  overrides: Record<string, unknown> = {},
) {
  const browser = await authenticatedGuest(app);
  const created = await createPlayer(
    browser,
    createTestPlayerCreationRequest({
      primaryRole: 'spin_bowler',
      bowlingStyle: 'off_spin',
      ...overrides,
    }),
  );
  expect(created.statusCode).toBe(201);
  const playerId = created.json().data.player.summary.id as string;
  await browser.get('/api/v1/career/home');
  const repos = ctx().database.repositories();
  const dashboard = (await repos.players.getDashboard(playerId))!;
  const fixture = (
    await repos.teams.listFixtures({
      careerId: dashboard.career!.id,
      status: 'scheduled',
    })
  ).items[0]!;
  const started = await browser.post(
    `/api/v1/career/matches/${fixture.id}/start`,
    {},
  );
  expect(started.statusCode).toBe(200);
  return {
    browser,
    playerId,
    fixtureId: fixture.id,
    careerId: dashboard.career!.id,
    matchId: started.json().data.matchId as string,
    repos,
  };
}

type Started = Awaited<ReturnType<typeof startCareerMatch>>;

export const flowOf = async (browser: Browser, matchId: string) =>
  (await browser.get(`/api/v1/matches/${matchId}/flow`)).json().data
    .flow as MatchFlowDto;
export const stateOf = async (browser: Browser, matchId: string) =>
  (await browser.get(`/api/v1/matches/${matchId}`)).json().data
    .match as MatchPlayStateDto;

/**
 * Re-seeds a match that has not been tossed so the coin lands the way the test needs. The coin is a pure function of
 * the seed, so this is how a deterministic toss is arranged (the same technique the end-to-end tests use).
 */
export async function arrangeToss(
  started: Started,
  ctx: Ctx,
  wanted: { userWins: boolean; call?: 'heads' | 'tails' },
) {
  const session = (await started.repos.matches.getEngineSession(
    started.matchId,
  ))!;
  const flow = (
    session.flow as {
      toss: { callerTeamId: string; aiCall: 'heads' | 'tails' };
    }
  ).toss;
  const replay = session.replay as MatchReplay;
  const yourTeam = [replay.input.teamA, replay.input.teamB].find((t) =>
    t.players.some((p) => p.playerId === started.playerId),
  )!;
  const youCall = flow.callerTeamId === yourTeam.teamId;
  const call = youCall ? (wanted.call ?? 'heads') : flow.aiCall;
  for (let n = 0; n < 200; n++) {
    const seed = `m11-toss-${started.matchId.slice(0, 8)}-${n}`;
    const coin =
      new MatchRandom(`${seed}:toss:coin`).next() < 0.5 ? 'heads' : 'tails';
    const callerWins = coin === call;
    if ((youCall ? callerWins : !callerWins) === wanted.userWins) {
      await execRaw(
        ctx().url,
        `UPDATE match_engine_sessions SET replay = jsonb_set(replay, '{input,rngSeed}', to_jsonb($2::text)) WHERE match_id = $1`,
        [started.matchId, seed],
      );
      return { youCall, call, seed };
    }
  }
  throw new Error('no seed arranged the toss');
}

/** Plays a match to its end through the real endpoints (the AI plays every ball, including the Cricketer's). */
export async function finishByAi(browser: Browser, matchId: string) {
  let state = await stateOf(browser, matchId);
  for (let guard = 0; guard < 40 && state.phase !== 'completed'; guard++) {
    if (state.phase === 'innings_break')
      state = (
        await browser.post(`/api/v1/matches/${matchId}/advance`, {})
      ).json().data.match;
    else {
      const r = await browser.post(`/api/v1/matches/${matchId}/simulate`, {
        mode: 'innings',
      });
      expect(r.statusCode).toBe(200);
      state = r.json().data.match;
    }
  }
  expect(state.phase).toBe('completed');
  return state;
}

export const resultOf = async (browser: Browser, matchId: string) => {
  const r = await browser.get(`/api/v1/matches/${matchId}/result`);
  expect(r.statusCode).toBe(200);
  return r.json().data.result as MatchResultDto;
};
