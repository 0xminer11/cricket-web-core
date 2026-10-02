import { expect, it } from 'vitest';
import { describeDb } from '../support/db';
import { Browser, buildAuthApp } from '../support/auth';
import type { App } from '../support/auth';
import { authenticatedGuest, createPlayer } from '../support/player';
import {
  arrangeToss,
  completeToss,
  finishByAi,
  flowOf,
  resultOf,
  startCareerMatch,
  stateOf,
} from '../support/match-flow';
import { replayMatch } from '../../packages/match-engine/src/index';
import type { MatchReplay } from '../../packages/match-engine/src/index';
import type {
  MatchFlowDto,
  MatchPlayStateDto,
  ScorecardDto,
} from '../../packages/shared-types/src/index';

type Ctx = Parameters<Parameters<typeof describeDb>[1]>[0];

const overs = (text: string) => {
  const [o, b] = text.split('.').map(Number);
  return o! * 6 + b!;
};

async function app<T>(ctx: Ctx, run: (app: App) => Promise<T>): Promise<T> {
  const { app } = await buildAuthApp(ctx());
  try {
    return await run(app);
  } finally {
    await app.close();
  }
}

describeDb('Module 11 match flow API', (ctx) => {
  it('a started match is created but not tossed: team sheets are shown, the coin is hidden and nothing can be played', () =>
    app(ctx, async (app) => {
      const started = await startCareerMatch(app, ctx);
      const { browser, matchId } = started;
      const flow = await flowOf(browser, matchId);
      expect(flow.stage).toBe('toss');
      expect(flow.started).toBe(false);
      expect(flow.toss.coin).toBeNull();
      expect(flow.toss.call).toBeNull();
      expect(flow.toss.winnerTeamId).toBeNull();
      expect(flow.firstMatch).toBe(true);
      // two real sides: eleven each, unique names, role-based roles, the Cricketer highlighted and rated, the opposition not scouted
      for (const sheet of [flow.yourTeam, flow.opponentTeam]) {
        expect(sheet.players).toHaveLength(11);
        expect(new Set(sheet.players.map((p) => p.name)).size).toBe(11);
        expect(sheet.players.map((p) => p.battingPosition)).toEqual([
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
        ]);
      }
      expect(flow.yourTeam.players.filter((p) => p.isYou)).toHaveLength(1);
      expect(flow.yourTeam.players.every((p) => p.overall !== null)).toBe(true);
      expect(
        flow.opponentTeam.players.every((p) => p.overall === null && !p.isYou),
      ).toBe(true);
      expect(
        new Set(flow.opponentTeam.players.map((p) => p.roleName)).size,
      ).toBeGreaterThan(4);
      expect(flow.pitch.hint.length).toBeGreaterThan(0);
      expect(flow.format.id).toMatch(/format\./);
      // nothing about the match can be played before the toss
      const state = await browser.get(`/api/v1/matches/${matchId}`);
      expect(state.statusCode).toBe(409);
      expect(state.json().error.code).toBe('MATCH_NOT_STARTED');
      for (const [url, body] of [
        [`/api/v1/matches/${matchId}/advance`, {}],
        [`/api/v1/matches/${matchId}/simulate`, { mode: 'over' }],
        [`/api/v1/matches/${matchId}/next-ball`, {}],
      ] as const) {
        const r = await browser.post(url, body);
        expect(r.statusCode, url).toBe(409);
        expect(r.json().error.code).toBe('MATCH_NOT_STARTED');
      }
      expect(
        (await browser.get(`/api/v1/matches/${matchId}/scorecard`)).statusCode,
      ).toBe(409);
      expect(
        (await browser.get(`/api/v1/matches/${matchId}/result`)).statusCode,
      ).toBe(409);
      // a started match is also a created-but-not-started engine: the replay has no 'start' command yet
      const session = (await started.repos.matches.getEngineSession(matchId))!;
      expect(
        (session.replay as MatchReplay).commands.some(
          (c) => c.type === 'start',
        ),
      ).toBe(false);
    }));

  it('is private: signed-out visitors and other players get nothing', () =>
    app(ctx, async (app) => {
      const { matchId } = await startCareerMatch(app, ctx);
      const stranger = await authenticatedGuest(app);
      await createPlayer(stranger);
      for (const [method, path, body] of [
        ['get', 'flow', undefined],
        ['get', 'scorecard', undefined],
        ['get', 'result', undefined],
        ['post', 'toss/call', { call: 'heads' }],
        ['post', 'toss/decision', { decision: 'bat' }],
      ] as const) {
        const url = `/api/v1/matches/${matchId}/${path}`;
        expect(
          (method === 'get'
            ? await stranger.get(url)
            : await stranger.post(url, body)
          ).statusCode,
          path,
        ).toBe(404);
        expect(
          (method === 'get'
            ? await new Browser(app).get(url)
            : await new Browser(app).post(url, body)
          ).statusCode,
          path,
        ).toBe(401);
      }
    }));

  it('the toss is decided by the server: a call that is not a call is refused, the coin comes from the seed, and the call is final', () =>
    app(ctx, async (app) => {
      const started = await startCareerMatch(app, ctx);
      const { browser, matchId } = started;
      const url = `/api/v1/matches/${matchId}/toss/call`;
      for (const body of [
        { call: 'edge' },
        { winner: 'me' },
        { call: 'heads', coin: 'heads' },
        { decision: 'bat' },
      ])
        expect(
          (await browser.post(url, body)).statusCode,
          JSON.stringify(body),
        ).toBe(400);
      // nothing can be played before the toss
      const early = await browser.get(`/api/v1/matches/${matchId}`);
      expect(early.statusCode).toBe(409);
      expect(early.json().error.code).toBe('MATCH_NOT_STARTED');
      const { youCall } = await arrangeToss(started, ctx, { userWins: false });
      if (youCall) {
        // your side calls: a call is needed
        expect((await browser.post(url, {})).statusCode).toBe(409);
      }
      const first = await browser.post(url, { call: 'heads' });
      expect(first.statusCode).toBe(200);
      const flow = first.json().data.flow as MatchFlowDto;
      expect(flow.toss.coin).not.toBeNull();
      expect(flow.toss.youWon).toBe(false);
      expect(flow.toss.decidedBy).toBe('ai');
      expect(flow.started).toBe(true);
      expect(flow.stage).toBe('in_progress');
      // asking again, even with the opposite call, returns the same persisted toss
      const again = await browser.post(url, { call: 'tails' });
      expect(again.json().data.flow.toss).toEqual(flow.toss);
      // concurrent calls
      const burst = await Promise.all(
        [1, 2, 3].map(() => browser.post(url, { call: 'heads' })),
      );
      for (const r of burst) expect(r.json().data.flow.toss).toEqual(flow.toss);
      // the engine started exactly once, with the recorded toss
      const replay = (await started.repos.matches.getEngineSession(matchId))!
        .replay as MatchReplay;
      expect(replay.commands.filter((c) => c.type === 'start')).toHaveLength(1);
      const engine = replayMatch(replay).snapshot();
      expect(engine.toss).toEqual({
        winnerTeamId: flow.toss.winnerTeamId,
        decision: flow.toss.decision,
      });
    }));

  it('when you win the toss you choose, once, and only before the first innings exists', () =>
    app(ctx, async (app) => {
      const started = await startCareerMatch(app, ctx);
      const { browser, matchId } = started;
      const decide = (decision: string) =>
        browser.post(`/api/v1/matches/${matchId}/toss/decision`, { decision });
      // before the toss
      expect((await decide('bat')).statusCode).toBe(409);
      await arrangeToss(started, ctx, { userWins: true });
      const called = await browser.post(
        `/api/v1/matches/${matchId}/toss/call`,
        { call: 'heads' },
      );
      const flow = called.json().data.flow as MatchFlowDto;
      expect(flow.stage).toBe('toss_decision');
      expect(flow.toss.youWon).toBe(true);
      expect(flow.started).toBe(false);
      expect((await decide('sideways')).statusCode).toBe(400);
      expect(
        (
          await browser.post(`/api/v1/matches/${matchId}/toss/decision`, {
            decision: 'bat',
            winner: 'me',
          })
        ).statusCode,
      ).toBe(400);
      const chosen = await decide('bowl');
      expect(chosen.statusCode).toBe(200);
      const after = chosen.json().data.flow as MatchFlowDto;
      expect(after.stage).toBe('in_progress');
      expect(after.toss.decision).toBe('bowl');
      expect(after.toss.decidedBy).toBe('you');
      // the same choice again is confirmed, a different one is refused: the innings has begun
      expect((await decide('bowl')).statusCode).toBe(200);
      const change = await decide('bat');
      expect(change.statusCode).toBe(409);
      expect(change.json().error.code).toBe('INVALID_TOSS_DECISION');
      // you bowl first, so the other side bats
      const state = await stateOf(browser, matchId);
      expect(state.battingTeam.id).not.toBe(state.you.teamId);
    }));

  it('when the AI wins the toss it chooses at once, and the Cricketer cannot choose for it', () =>
    app(ctx, async (app) => {
      const started = await startCareerMatch(app, ctx);
      const { browser, matchId } = started;
      await arrangeToss(started, ctx, { userWins: false });
      const flow = (
        await browser.post(`/api/v1/matches/${matchId}/toss/call`, {
          call: 'heads',
        })
      ).json().data.flow as MatchFlowDto;
      expect(flow.toss.youWon).toBe(false);
      expect(flow.toss.decidedBy).toBe('ai');
      expect(['bat', 'bowl']).toContain(flow.toss.decision);
      const r = await browser.post(`/api/v1/matches/${matchId}/toss/decision`, {
        decision: flow.toss.decision === 'bat' ? 'bowl' : 'bat',
      });
      expect(r.statusCode).toBe(409);
      const state = await stateOf(browser, matchId);
      // the first innings is set up exactly as the AI chose
      const youBatFirst = state.battingTeam.id === state.you.teamId;
      expect(youBatFirst).toBe(flow.toss.decision === 'bowl');
    }));

  it('starting a fixture twice (or at once) creates one match, and a refresh never re-tosses', () =>
    app(ctx, async (app) => {
      const started = await startCareerMatch(app, ctx);
      const url = `/api/v1/career/matches/${started.fixtureId}/start`;
      const burst = await Promise.all(
        [1, 2, 3, 4].map(() => started.browser.post(url, {})),
      );
      for (const r of burst)
        expect(r.json().data.matchId).toBe(started.matchId);
      const count = await started.repos.matches.findByFixture(
        started.fixtureId,
      );
      expect(count!.id).toBe(started.matchId);
      const before = await flowOf(started.browser, started.matchId);
      await completeToss(started.browser, started.matchId, { decision: 'bat' });
      const after = await flowOf(started.browser, started.matchId);
      const again = await flowOf(started.browser, started.matchId);
      expect(again.toss).toEqual(after.toss);
      expect(after.toss.winnerTeamId).not.toBeNull();
      expect(before.toss.coin).toBeNull();
      // starting again after the toss still returns the same match
      expect((await started.browser.post(url, {})).json().data.matchId).toBe(
        started.matchId,
      );
    }));

  it('the live scorecard shows batting, bowling, extras, did-not-bat and fall of wickets, and agrees with the state', () =>
    app(ctx, async (app) => {
      const started = await startCareerMatch(app, ctx);
      const { browser, matchId } = started;
      await completeToss(browser, matchId, { decision: 'bat' });
      // play the first innings by the AI so there is something to show
      const r = await browser.post(`/api/v1/matches/${matchId}/simulate`, {
        mode: 'innings',
      });
      expect(r.statusCode).toBe(200);
      const state = r.json().data.match as MatchPlayStateDto;
      const card = (
        await browser.get(`/api/v1/matches/${matchId}/scorecard`)
      ).json().data.scorecard as ScorecardDto;
      expect(card.matchId).toBe(matchId);
      expect(card.tossText).toMatch(/won the toss/);
      const innings = card.innings[0]!;
      expect(innings.number).toBe(1);
      expect(innings.total).toMatch(/^\d+\/\d+ \(\d+\.\d Overs\)$/);
      for (const i of card.innings) {
        // the batters' runs and the extras make the total; the bowlers' balls make the innings
        expect(i.batting.reduce((n, b) => n + b.runs, 0) + i.extras.total).toBe(
          i.runs,
        );
        expect(i.bowling.reduce((n, b) => n + overs(b.oversText), 0)).toBe(
          overs(i.oversText),
        );
        expect(
          i.bowling.reduce((n, b) => n + b.wickets, 0),
        ).toBeLessThanOrEqual(i.wickets);
        expect(
          i.extras.wides + i.extras.noBalls + i.extras.byes + i.extras.legByes,
        ).toBe(i.extras.total);
        expect(i.fallOfWickets).toHaveLength(i.wickets);
        for (const row of [...i.batting, ...i.bowling])
          for (const value of Object.values(row))
            if (typeof value === 'number')
              expect(value).toBeGreaterThanOrEqual(0);
        expect(i.batting.length + i.didNotBat.length).toBe(11);
        for (const b of i.batting.filter((x) => !x.notOut))
          expect(b.dismissal).toMatch(/^(b|caught b|lbw b) \w+/);
      }
      expect(innings.runs).toBe(
        Number(
          state.previousInnings.length
            ? state.previousInnings[0]!.score.split('/')[0]
            : state.innings.runs,
        ),
      );
      // names of fielders are never invented
      expect(JSON.stringify(card)).not.toContain('c &');
      const withBalls = (
        await browser.get(`/api/v1/matches/${matchId}/scorecard?timeline=1`)
      ).json().data.scorecard as ScorecardDto;
      expect(withBalls.timeline!.length).toBeGreaterThan(0);
      expect(withBalls.timeline![0]!.balls.length).toBeGreaterThan(0);
      expect(card.timeline).toBeNull();
    }));

  it(
    'finishing the match applies its career effects exactly once: stats, rewards, XP, form and fatigue, and a refresh changes nothing',
    () =>
      app(ctx, async (app) => {
        const started = await startCareerMatch(app, ctx);
        const { browser, matchId, playerId, repos } = started;
        await completeToss(browser, matchId, { decision: 'bat' });
        const stateBefore = (await repos.players.getState(playerId))!;
        const coinsBefore = await repos.wallet.getBalance(playerId, 'coins');
        expect(
          (await browser.get(`/api/v1/matches/${matchId}/result`)).statusCode,
        ).toBe(409); // not finished
        await finishByAi(browser, matchId);

        const result = await resultOf(browser, matchId);
        expect(result.status).toBe('completed');
        expect(result.processed).toBe(true);
        expect(['win', 'loss', 'tie']).toContain(result.outcome);
        expect(result.resultText).toMatch(
          /won by \d+ (runs?|wickets?)|Match tied/,
        );
        expect(result.resultText).not.toMatch(/by 0 /);
        expect(result.rewards!.coins).toBeGreaterThan(0);
        expect(result.rewards!.playerXp).toBeGreaterThan(0);
        expect(result.rewards!.breakdown.resultMultiplier).toBeGreaterThan(0);
        expect(result.innings.length).toBeGreaterThanOrEqual(2);
        expect(result.performance.tookPart).toBe(
          result.performance.rating !== null,
        );

        // exactly one reward grant, one match_reward ledger credit, one career result row, the fixture completed
        const grant = await repos.rewards.getGrant(playerId, 'match', matchId);
        expect(grant).not.toBeNull();
        const ledger = await repos.wallet.getTransactions(playerId, {
          currency: 'coins',
        });
        const credits = ledger.items.filter(
          (t) =>
            t.transactionType === 'match_reward' && t.referenceId === matchId,
        );
        expect(credits).toHaveLength(1);
        expect(credits[0]!.amount).toBe(result.rewards!.coins);
        expect(await repos.wallet.getBalance(playerId, 'coins')).toBe(
          coinsBefore + result.rewards!.coins,
        );
        expect((await repos.teams.getFixture(started.fixtureId))!.status).toBe(
          'completed',
        );
        expect(
          (await repos.matches.getCareerResult(matchId, playerId))!.summary,
        ).toMatchObject({ v: 1, outcome: result.outcome });

        // career stats: one match, and exactly the figures of the scorecard
        const stats = (await repos.players.getStats(playerId))!;
        expect(stats.matches).toBe(1);
        expect(stats.matchesWon).toBe(result.outcome === 'win' ? 1 : 0);
        const perf = result.performance;
        expect(stats.runs).toBe(perf.batting?.runs ?? 0);
        expect(stats.ballsFaced).toBe(perf.batting?.balls ?? 0);
        expect(stats.wickets).toBe(perf.bowling?.wickets ?? 0);
        expect(stats.inningsBatted).toBe(perf.batting ? 1 : 0);
        expect(stats.notOuts).toBe(perf.batting?.notOut ? 1 : 0);

        // XP, form and fatigue persisted once
        const after = (await repos.players.getState(playerId))!;
        expect(after.lifetimeXp - stateBefore.lifetimeXp).toBe(
          result.rewards!.playerXp,
        );
        expect(after.fatigue - stateBefore.fatigue).toBe(
          result.progression!.fatigueAdded,
        );
        expect(after.form).toBe(result.progression!.formAfter);
        if (!result.performance.tookPart)
          expect(after.form).toBe(stateBefore.form);
        expect(result.progression!.levelAfter).toBe(after.level);

        // asking again, and again, changes nothing: not the result, not the balance, not the stats
        const snapshot = JSON.stringify(result);
        for (let n = 0; n < 6; n++)
          expect(JSON.stringify(await resultOf(browser, matchId))).toBe(
            snapshot,
          );
        const burst = await Promise.all(
          [1, 2, 3, 4, 5].map(() =>
            browser.get(`/api/v1/matches/${matchId}/result`),
          ),
        );
        for (const r of burst)
          expect(JSON.stringify(r.json().data.result)).toBe(snapshot);
        expect(await repos.wallet.getBalance(playerId, 'coins')).toBe(
          coinsBefore + result.rewards!.coins,
        );
        expect((await repos.players.getStats(playerId))!.matches).toBe(1);
        expect((await repos.players.getState(playerId))!.lifetimeXp).toBe(
          after.lifetimeXp,
        );

        // the completion service itself is idempotent, called directly and concurrently
        const { MatchCompletionService } =
          await import('../../apps/api/src/modules/matches/match-completion.service');
        const session = (await repos.matches.getEngineSession(matchId))!;
        const replay = session.replay as MatchReplay;
        const service = new MatchCompletionService();
        const outcomes = await Promise.all(
          [1, 2, 3].map(() =>
            ctx().database.transaction(async (tx) => {
              const r = ctx().database.repositories(tx);
              await r.matches.lockMatch(matchId);
              return service.apply({
                repos: r as never, // the service is typed against the built database package
                matchId,
                playerId,
                state: replayMatch(replay).snapshot(),
                input: replay.input,
                now: new Date(),
              });
            }),
          ),
        );
        expect(outcomes.every((o) => !o.applied)).toBe(true);
        expect((await repos.players.getStats(playerId))!.matches).toBe(1);
        expect(await repos.wallet.getBalance(playerId, 'coins')).toBe(
          coinsBefore + result.rewards!.coins,
        );

        // the completed match cannot be played or re-tossed
        expect(
          (
            await browser.post(`/api/v1/matches/${matchId}/toss/call`, {
              call: 'heads',
            })
          ).json().data.flow.stage,
        ).toBe('completed');
        expect(
          (
            await browser.post(`/api/v1/matches/${matchId}/simulate`, {
              mode: 'over',
            })
          ).statusCode,
        ).toBe(409);
        const flow = await flowOf(browser, matchId);
        expect(flow.stage).toBe('completed');
      }),
    120000,
  );

  it(
    'the human bowler is asked only for overs they can bowl, and the end-of-over card names the bowler and figures',
    () =>
      app(ctx, async (app) => {
        const started = await startCareerMatch(app, ctx);
        const { browser, matchId } = started;
        await arrangeToss(started, ctx, { userWins: true });
        await completeToss(browser, matchId, { decision: 'bowl' });
        // we field first: the human off-spinner is eligible for the first over, so "until my turn" stops there
        let state = await stateOf(browser, matchId);
        if (state.phase === 'simulate_required')
          state = (
            await browser.post(`/api/v1/matches/${matchId}/simulate`, {
              mode: 'until_my_turn',
            })
          ).json().data.match;
        expect(state.phase).toBe('bowler_select');
        const me = state.eligibleBowlers.find((b) => b.isYou)!;
        expect(me.eligible).toBe(true);
        // bowl the whole over ourselves, six legal balls
        let last: {
          overSummary: {
            balls: unknown[];
            bowlerName: string;
            bowlerFigures: string;
            score: string;
          } | null;
        } | null = null;
        let legal = 0;
        for (let guard = 0; guard < 14 && legal < 6; guard++) {
          const current = await stateOf(browser, matchId);
          const res = await browser.post(
            `/api/v1/matches/${matchId}/deliveries`,
            {
              actionId: `m11-${guard}-${Date.now().toString(36)}`,
              expectedSequence: current.expectedSequence,
              ...(current.phase === 'bowler_select'
                ? { bowlerId: me.playerId }
                : {}),
              deliveryIntent: {
                variationId: me.deliveryIds[0],
                target: { x: 0.35, y: 0.5 },
              },
            },
          );
          expect(res.statusCode).toBe(200);
          const d = res.json().data.delivery;
          legal = d.match.thisOver.filter(
            (b: { legal: boolean }) => b.legal,
          ).length;
          if (legal < 6) expect(d.overSummary).toBeNull();
          last = d;
        }
        expect(legal).toBe(6);
        const summary = last!.overSummary!;
        expect(summary.bowlerName).toBe(me.name);
        expect(summary.bowlerFigures).toMatch(/^1\.0-\d+-\d+-\d+$/);
        expect(
          summary.balls.filter((b) => (b as { legal: boolean }).legal),
        ).toHaveLength(6);
        // the next over is one the Cricketer cannot bowl (no consecutive overs): "until my turn" plays it for the team
        const next = await browser.post(`/api/v1/matches/${matchId}/simulate`, {
          mode: 'until_my_turn',
        });
        expect(next.statusCode).toBe(200);
        expect(next.json().data.simulated.length).toBeGreaterThanOrEqual(6);
        for (const ball of next.json().data.simulated) {
          expect(ball.score).toMatch(/^\d+\/\d+$/);
          expect(ball.over).toMatch(/^\d+\.\d+$/);
        }
        expect([
          'innings_break',
          'simulate_required',
          'ready_to_bat',
        ]).toContain(next.json().data.match.phase);
      }),
    120000,
  );

  it(
    '"simulate this over" is bowled by a teammate unless you name the bowler, and the Cricketer\'s own overs are never forced on them',
    () =>
      app(ctx, async (app) => {
        const started = await startCareerMatch(app, ctx);
        const { browser, matchId } = started;
        await arrangeToss(started, ctx, { userWins: true });
        await completeToss(browser, matchId, { decision: 'bowl' });
        let state = await stateOf(browser, matchId);
        if (state.phase === 'simulate_required')
          state = (
            await browser.post(`/api/v1/matches/${matchId}/simulate`, {
              mode: 'until_my_turn',
            })
          ).json().data.match;
        expect(state.phase).toBe('bowler_select');
        const me = state.eligibleBowlers.find((b) => b.isYou)!;
        expect(me.eligible).toBe(true);
        const mine = async () =>
          (
            (await browser.get(`/api/v1/matches/${matchId}/scorecard`)).json()
              .data.scorecard as ScorecardDto
          ).innings[0]!.bowling.filter((b) => b.isYou);

        // no bowler named: a teammate bowls the over; the Cricketer has not bowled
        const first = await browser.post(
          `/api/v1/matches/${matchId}/simulate`,
          {
            mode: 'over',
          },
        );
        expect(first.statusCode).toBe(200);
        expect(first.json().data.simulated.length).toBeGreaterThanOrEqual(6);
        expect(await mine()).toHaveLength(0);

        // an unknown bowler is refused
        const bad = await browser.post(`/api/v1/matches/${matchId}/simulate`, {
          mode: 'over',
          bowlerId: 'not-a-player',
        });
        expect(bad.statusCode).toBeGreaterThanOrEqual(400);
        // naming yourself simulates YOUR over (a choice, never the default)
        state = await stateOf(browser, matchId);
        expect(state.phase).toBe('bowler_select');
        expect(state.eligibleBowlers.find((b) => b.isYou)!.eligible).toBe(true);
        const second = await browser.post(
          `/api/v1/matches/${matchId}/simulate`,
          { mode: 'over', bowlerId: me.playerId },
        );
        expect(second.statusCode).toBe(200);
        const rows = await mine();
        expect(rows).toHaveLength(1);
        expect(rows[0]!.oversText).toBe('1.0');
      }),
    120000,
  );

  it(
    'a Cricketer who cannot bowl never gets a bowling turn: the team plays the whole innings in the field',
    () =>
      app(ctx, async (app) => {
        const started = await startCareerMatch(app, ctx, {
          primaryRole: 'opening_batter',
          bowlingStyle: null,
        });
        const { browser, matchId } = started;
        await arrangeToss(started, ctx, { userWins: true });
        await completeToss(browser, matchId, { decision: 'bowl' });
        const state = await stateOf(browser, matchId);
        expect(state.you.side).toBe('bowling');
        expect(state.eligibleBowlers.some((b) => b.isYou)).toBe(false); // the choice exists, the Cricketer is not in it
        const r = await browser.post(`/api/v1/matches/${matchId}/simulate`, {
          mode: 'until_my_turn',
        });
        expect(r.statusCode).toBe(200);
        // the innings ran to its end (or to the break) without stopping for a bowling choice
        expect(r.json().data.match.phase).not.toBe('bowler_select');
        expect(r.json().data.match.phase).not.toBe('ready_to_bowl');
      }),
    60000,
  );
});
