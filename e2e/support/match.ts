import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withDb } from './db';

export const WEB = 'http://localhost:3300';
export const API = 'http://localhost:4300/api/v1';
export const headers = { origin: WEB, 'content-type': 'application/json' };

/** A signed-in guest with a fast bowler (so the bowling scene always has pace deliveries). */
export async function newBowler(
  page: Page,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const g = await page.request.post(`${API}/auth/guest`, { headers, data: {} });
  expect(g.status()).toBe(201);
  const key =
    `m9${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.padEnd(
      32,
      'x',
    );
  const r = await page.request.post(`${API}/player`, {
    headers: { ...headers, 'idempotency-key': key },
    data: {
      displayName: 'Match Hero',
      countryCode: 'IN',
      jerseyNumber: 18,
      battingHand: 'right',
      primaryRole: 'fast_bowler',
      bowlingStyle: 'right_arm_fast',
      appearance: {
        bodyPresetId: 'appearance.body.athletic_01',
        facePresetId: 'appearance.face.preset_01',
        skinToneId: 'appearance.skin.tone_04',
        hairStyleId: 'appearance.hair.short_01',
        hairColorId: 'appearance.haircolor.black',
        beardStyleId: 'appearance.beard.none',
        heightScale: 1,
      },
      personalityArchetypeId: 'personality.balanced',
      ...overrides,
    },
  });
  expect(r.status()).toBe(201);
  return (await r.json()).data.player.summary.id as string;
}

/** A signed-in guest who opens the batting: an opening batter (so they are on strike for the first ball). */
export async function newBatter(
  page: Page,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  return newBowler(page, {
    displayName: 'Opener',
    primaryRole: 'opening_batter',
    bowlingStyle: 'right_arm_medium',
    ...overrides,
  });
}

export interface Started {
  readonly matchId: string;
  readonly fixtureId: string;
}

/** Creates the match through the same API the Start button uses. The toss has NOT happened yet. */
export async function createMatchApi(page: Page): Promise<Started> {
  const home = (await (await page.request.get(`${API}/career/home`)).json())
    .data.home;
  const fixtureId = home.nextMatch.id as string;
  const started = await page.request.post(
    `${API}/career/matches/${fixtureId}/start`,
    { headers, data: {} },
  );
  expect(started.status()).toBe(200);
  return { matchId: (await started.json()).data.matchId as string, fixtureId };
}

export interface TossOptions {
  /** Arrange the (seeded) coin so the player's side wins (default) or loses the toss. */
  readonly userWins?: boolean;
  /** The player's choice when they win; when the AI wins, the AI chooses (it is arranged to match when set). */
  readonly decision?: 'bat' | 'bowl';
  readonly call?: 'heads' | 'tails';
}

export const flowOf = async (page: Page, matchId: string) =>
  (await (await page.request.get(`${API}/matches/${matchId}/flow`)).json()).data
    .flow;

/**
 * Re-seeds a match that has not been tossed so the coin lands the way the test needs. The coin is a pure function
 * of the seed, so this is exact (it runs the same built code the API runs).
 */
export async function arrangeToss(
  page: Page,
  matchId: string,
  wanted: { userWins: boolean; call?: 'heads' | 'tails' },
): Promise<{ youCall: boolean; call: 'heads' | 'tails' }> {
  const lib = await loadEngine();
  const flow = await flowOf(page, matchId);
  expect(flow.stage, 'the toss was already made').toBe('toss');
  const row = await withDb(async (q) => {
    const rows = await q(
      'SELECT flow FROM match_engine_sessions WHERE match_id = $1',
      [matchId],
    );
    return rows[0]!.flow as { toss: { aiCall: 'heads' | 'tails' } };
  });
  const youCall = flow.toss.youCall as boolean;
  const call = youCall ? (wanted.call ?? 'heads') : row.toss.aiCall;
  for (let n = 0; n < 200; n++) {
    const seed = `e2e-toss-${matchId.slice(0, 8)}-${n}`;
    const coin =
      new lib.MatchRandom(`${seed}:toss:coin`).next() < 0.5 ? 'heads' : 'tails';
    const callerWins = coin === call;
    if ((youCall ? callerWins : !callerWins) !== wanted.userWins) continue;
    await withDb(async (q) => {
      await q(
        `UPDATE match_engine_sessions
            SET replay = jsonb_set(replay, '{input,rngSeed}', to_jsonb($2::text))
          WHERE match_id = $1`,
        [matchId, seed],
      );
      await q('UPDATE matches SET rng_seed = $2 WHERE id = $1', [
        matchId,
        seed,
      ]);
    });
    return { youCall, call };
  }
  throw new Error('no seed arranged the toss');
}

/** The toss through the real endpoints: the call, then (when the player wins it) bat or bowl. Returns the flow. */
export async function completeTossApi(
  page: Page,
  matchId: string,
  options: TossOptions = {},
) {
  const called = await page.request.post(
    `${API}/matches/${matchId}/toss/call`,
    {
      headers,
      data: { call: options.call ?? 'heads' },
    },
  );
  expect(called.status()).toBe(200);
  let flow = (await called.json()).data.flow;
  if (flow.stage === 'toss_decision') {
    const decided = await page.request.post(
      `${API}/matches/${matchId}/toss/decision`,
      { headers, data: { decision: options.decision ?? 'bowl' } },
    );
    expect(decided.status()).toBe(200);
    flow = (await decided.json()).data.flow;
  }
  expect(flow.started).toBe(true);
  return flow;
}

/**
 * Creates the match and makes the toss through the API, so the first innings exists. By default the player wins the
 * toss and chooses to bowl; pass `false` to leave the match before the toss (the UI then runs the flow).
 */
export async function startMatchApi(
  page: Page,
  toss: TossOptions | false = {},
): Promise<Started> {
  const started = await createMatchApi(page);
  if (toss === false) return started;
  await arrangeToss(page, started.matchId, {
    userWins: toss.userWins ?? true,
    ...(toss.call ? { call: toss.call } : {}),
  });
  await completeTossApi(page, started.matchId, toss);
  return started;
}

/** Walks the team sheet and the toss screens in the browser: the player calls (or flips), then chooses. */
export async function playTossInBrowser(
  page: Page,
  decision: 'bat' | 'bowl' = 'bowl',
): Promise<void> {
  await expect(page.getByTestId('team-sheet')).toBeVisible();
  // the coin is seeded: arrange it (nothing has been tossed yet) so the player wins and the test is deterministic
  const matchId = new URL(page.url()).pathname.split('/').pop()!;
  await arrangeToss(page, matchId, { userWins: true });
  await page.getByTestId('team-sheet-continue').click();
  await expect(page.getByTestId('toss')).toBeVisible();
  const heads = page.getByTestId('toss-heads');
  if (await heads.isVisible()) await heads.click();
  else await page.getByTestId('toss-flip').click();
  await expect(page.getByTestId('toss-result')).toBeVisible();
  await page.getByTestId('toss-continue').click();
  const choose = page.getByTestId(
    decision === 'bat' ? 'bat-first' : 'bowl-first',
  );
  if (await choose.isVisible().catch(() => false)) await choose.click();
}

export const matchState = async (page: Page, matchId: string) =>
  (await (await page.request.get(`${API}/matches/${matchId}`)).json()).data
    .match;

/**
 * A fresh match where the player's side bowls first (so seeds can still be arranged before the first ball). The
 * toss is arranged: the player wins it and chooses to bowl.
 */
export async function matchWhereIBowlFirst(
  page: Page,
  overrides: Record<string, unknown> = {},
): Promise<Started> {
  await newBowler(page, overrides);
  const started = await startMatchApi(page, {
    userWins: true,
    decision: 'bowl',
  });
  const state = await matchState(page, started.matchId);
  expect(state.phase).toBe('bowler_select');
  return started;
}

/**
 * A fresh match where the player's side bats first, so their Cricketer is on strike for ball one: the player wins the
 * toss and chooses to bat.
 */
export async function matchWhereIBatFirst(
  page: Page,
  overrides: Record<string, unknown> = {},
): Promise<Started> {
  await newBatter(page, overrides);
  const started = await startMatchApi(page, {
    userWins: true,
    decision: 'bat',
  });
  const state = await matchState(page, started.matchId);
  expect(state.phase).toBe('ready_to_bat');
  return started;
}

// ---- seed forcing: choose a seed so a specific ball has a specific outcome ----------------------

interface EngineModule {
  replayMatch(replay: unknown): {
    selectBowler(id: string): void;
    resolveBall(action: unknown): {
      wicketType: string | null;
      extraType: string | null;
      runsOffBat: number;
      extras: number;
      shot: { contactQuality: string };
      delivery: { actualTarget: { x: number; y: number } };
    };
    eligibleBowlers(): string[];
    cursor(): { bowlerId: string | null };
    previewDelivery(sequence: number, intent: unknown): { speed: number };
  };
  aiBowlerIntent(seed: string, bowler: unknown, sequence: number): unknown;
  humanShotIntent(
    input: {
      shotId: string;
      direction: number;
      timing: number;
      assist: string;
    },
    batter: unknown,
    delivery: { speed: number },
  ): unknown;
  aiShotIntent(
    seed: string,
    batter: unknown,
    intent: unknown,
    sequence: number,
    context?: unknown,
  ): unknown;
  classifyLine(x: number): string;
  classifyLength(y: number): string;
  MatchRandom: new (seed: string) => { next(): number };
}
let engine: EngineModule | null = null;
async function loadEngine(): Promise<EngineModule> {
  if (engine) return engine;
  // the built ESM entry: exactly the code the API runs, so the outcome we pick is the real one
  const entry = path.join(process.cwd(), 'packages/match-engine/dist/index.js');
  engine = (await import(pathToFileURL(entry).href)) as EngineModule;
  return engine;
}

export interface BallPredicate {
  (ball: {
    wicketType: string | null;
    extraType: string | null;
    runsOffBat: number;
    contactQuality: string;
  }): boolean;
}

/**
 * Re-seeds a match that has not had a ball yet so that the FIRST delivery (the exact intent the UI
 * will send) satisfies `wanted`. It runs the real engine build locally, so the outcome is the one
 * the server will produce, not a guess. Returns the seed it chose.
 */
export async function forceFirstBall(
  matchId: string,
  intent: {
    variationId: string;
    target: { x: number; y: number };
  },
  wanted: BallPredicate,
): Promise<string> {
  const lib = await loadEngine();
  const replay = await withDb(async (q) => {
    const rows = await q(
      'SELECT replay FROM match_engine_sessions WHERE match_id = $1',
      [matchId],
    );
    const balls = await q(
      'SELECT count(*)::int AS n FROM match_balls WHERE match_id = $1',
      [matchId],
    );
    expect(balls[0]!.n, 'a ball was already bowled').toBe(0);
    return rows[0]!.replay as {
      input: {
        rngSeed: string;
        teamA: { players: unknown[]; bowlingOrder: string[] };
        teamB: { players: unknown[]; bowlingOrder: string[] };
      };
      commands: { type: string }[];
    };
  });
  const state = replayLike(replay);
  const bowlerTeam = state.bowlingTeam;
  const batterTeam = state.battingTeam;
  const bowlerId = state.humanBowlerId;
  const batter = (batterTeam.players as { playerId: string }[]).find(
    (p) => p.playerId === state.strikerId,
  )!;
  void bowlerTeam;
  const fullIntent = {
    variationId: intent.variationId,
    line: lib.classifyLine(intent.target.x),
    length: lib.classifyLength(intent.target.y),
    target: intent.target,
  };
  for (let n = 0; n < 20000; n++) {
    const seed = `e2e-${matchId.slice(0, 8)}-${n}`;
    const candidate = JSON.parse(JSON.stringify(replay)) as typeof replay;
    candidate.input.rngSeed = seed;
    const sim = lib.replayMatch(candidate);
    sim.selectBowler(bowlerId);
    const ball = sim.resolveBall({
      actionId: 'probe',
      expectedSequence: 1,
      deliveryIntent: fullIntent,
      battingIntent: lib.aiShotIntent(seed, batter, fullIntent, 1, {
        runsNeeded: null,
        ballsRemaining: null,
      }),
    });
    if (
      wanted({
        wicketType: ball.wicketType,
        extraType: ball.extraType,
        runsOffBat: ball.runsOffBat,
        contactQuality: ball.shot.contactQuality,
      })
    ) {
      await withDb(async (q) => {
        await q(
          `UPDATE match_engine_sessions
              SET replay = jsonb_set(replay, '{input,rngSeed}', to_jsonb($2::text))
            WHERE match_id = $1`,
          [matchId, seed],
        );
        await q('UPDATE matches SET rng_seed = $2 WHERE id = $1', [
          matchId,
          seed,
        ]);
      });
      return seed;
    }
  }
  throw new Error('no seed produced the wanted outcome');
}

interface ReplayShape {
  input: {
    teamA: {
      teamId: string;
      players: unknown[];
      battingOrder: string[];
      bowlingOrder: string[];
    };
    teamB: {
      teamId: string;
      players: unknown[];
      battingOrder: string[];
      bowlingOrder: string[];
    };
  };
  commands: {
    type: string;
    toss?: { winnerTeamId: string; decision: 'bat' | 'bowl' };
  }[];
}
/** Who bats and who bowls first, from the recorded toss (the opening innings of a fresh match). */
function replayLike(replay: unknown) {
  const r = replay as ReplayShape;
  const toss = r.commands.find((c) => c.type === 'start')!.toss!;
  const other = (id: string) =>
    r.input.teamA.teamId === id ? r.input.teamB : r.input.teamA;
  const team = (id: string) =>
    r.input.teamA.teamId === id ? r.input.teamA : r.input.teamB;
  const battingId =
    toss.decision === 'bat'
      ? toss.winnerTeamId
      : other(toss.winnerTeamId).teamId;
  const battingTeam = team(battingId);
  const bowlingTeam = other(battingId);
  return {
    battingTeam,
    bowlingTeam,
    strikerId: battingTeam.battingOrder[0]!,
    humanBowlerId: bowlingTeam.bowlingOrder[0]!,
  };
}

export interface HumanBall {
  readonly wicketType: string | null;
  readonly extraType: string | null;
  readonly runsOffBat: number;
  readonly contactQuality: string;
}

/**
 * Re-seeds a match that has not had a ball yet so that the FIRST ball the player bats (the AI bowler's real
 * delivery, the shot the UI will send, assist Auto so the engine times it) satisfies `wanted`. Runs the real
 * engine build, so the outcome is the one the server will produce. Returns the seed it chose.
 */
export async function forceFirstHumanBall(
  page: Page,
  matchId: string,
  shot: {
    shotId: string;
    direction: number;
    /** The client's timing error (assist Auto sends none, so the engine times it). */
    timing?: number;
    assist?: string;
  },
  wanted: (ball: HumanBall) => boolean,
): Promise<string> {
  const lib = await loadEngine();
  const state = await matchState(page, matchId);
  expect(state.phase).toBe('ready_to_bat');
  const youId = state.you.playerId as string;
  const replay = await withDb(async (q) => {
    const rows = await q(
      'SELECT replay FROM match_engine_sessions WHERE match_id = $1',
      [matchId],
    );
    const balls = await q(
      'SELECT count(*)::int AS n FROM match_balls WHERE match_id = $1',
      [matchId],
    );
    expect(balls[0]!.n, 'a ball was already played').toBe(0);
    return rows[0]!.replay as {
      input: {
        rngSeed: string;
        teamA: { players: { playerId: string }[] };
        teamB: { players: { playerId: string }[] };
      };
    };
  });
  const players = [
    ...replay.input.teamA.players,
    ...replay.input.teamB.players,
  ] as { playerId: string }[];
  const you = players.find((p) => p.playerId === youId)!;
  for (let n = 0; n < 30000; n++) {
    const seed = `e2e-bat-${matchId.slice(0, 8)}-${n}`;
    const candidate = JSON.parse(JSON.stringify(replay)) as typeof replay;
    candidate.input.rngSeed = seed;
    const sim = lib.replayMatch(candidate);
    sim.selectBowler(sim.eligibleBowlers()[0]!);
    const bowler = players.find((p) => p.playerId === sim.cursor().bowlerId)!;
    const intent = lib.aiBowlerIntent(seed, bowler, 1);
    const preview = sim.previewDelivery(1, intent);
    const ball = sim.resolveBall({
      actionId: 'probe',
      expectedSequence: 1,
      deliveryIntent: intent,
      battingIntent: lib.humanShotIntent(
        {
          shotId: shot.shotId,
          direction: shot.direction,
          timing: shot.timing ?? 0,
          assist: shot.assist ?? 'auto',
        },
        you,
        preview,
      ),
    });
    if (
      wanted({
        wicketType: ball.wicketType,
        extraType: ball.extraType,
        runsOffBat: ball.runsOffBat,
        contactQuality: ball.shot.contactQuality,
      })
    ) {
      await withDb(async (q) => {
        await q(
          `UPDATE match_engine_sessions
              SET replay = jsonb_set(replay, '{input,rngSeed}', to_jsonb($2::text))
            WHERE match_id = $1`,
          [matchId, seed],
        );
        await q('UPDATE matches SET rng_seed = $2 WHERE id = $1', [
          matchId,
          seed,
        ]);
      });
      return seed;
    }
  }
  throw new Error('no seed produced the wanted batting outcome');
}
