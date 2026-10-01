import { expect, it } from 'vitest';
import { describeDb } from '../support/db';
import { Browser, buildAuthApp } from '../support/auth';
import { authenticatedGuest, createPlayer } from '../support/player';
import { MatchService } from '../../apps/api/src/modules/matches/match.service';
import {
  replayMatch,
  aiBallAction,
} from '../../packages/match-engine/src/index';
import type { MatchReplay } from '../../packages/match-engine/src/index';
import { execRaw } from '../../packages/database/src/testing/harness';

describeDb('Module 8 match authority', (ctx) => {
  it('authenticates, snapshots latest skills/equipment, persists/replays every ball, and completes once', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const browser = await authenticatedGuest(app);
      const created = await createPlayer(browser);
      expect(created.statusCode).toBe(201);
      const playerId = created.json().data.player.summary.id as string;
      await browser.get('/api/v1/career/home');
      const repos = ctx().database.repositories();
      const dashboard = (await repos.players.getDashboard(playerId))!;
      const scope = { playerId, userId: dashboard.profile.userId };
      const fixture = (
        await repos.teams.listFixtures({
          careerId: dashboard.career!.id,
          status: 'scheduled',
        })
      ).items[0]!;
      await execRaw(
        ctx().url,
        'UPDATE player_attributes SET batting_timing = 74 WHERE player_id = $1',
        [playerId],
      );
      const url = `/api/v1/career/matches/${fixture.id}/start`;
      expect((await new Browser(app).post(url, {})).statusCode).toBe(401);
      const starts = await Promise.all([
        browser.post(url, {}),
        browser.post(url, {}),
      ]);
      expect(starts[0]!.statusCode).toBe(200);
      expect(starts[1]!.statusCode).toBe(200);
      expect(starts[0]!.json()).toEqual(starts[1]!.json());
      const matchId = starts[0]!.json().data.matchId as string;
      const initial = (await repos.matches.getEngineSession(matchId))!;
      const replay = initial.replay as MatchReplay;
      const human = [replay.input.teamA, replay.input.teamB]
        .flatMap((t) => t.players)
        .find((p) => p.playerId === playerId)!;
      expect(human.batting.timing).toBe(74);
      expect(Object.keys(human.equipmentModifiers).length).toBeGreaterThan(0);
      await execRaw(
        ctx().url,
        'UPDATE player_attributes SET batting_timing = 80 WHERE player_id = $1',
        [playerId],
      );
      expect(human.batting.timing).toBe(74);
      const intruder = await authenticatedGuest(app);
      await createPlayer(intruder);
      expect(
        (await intruder.get(`/api/v1/matches/${matchId}`)).statusCode,
      ).toBe(404);
      expect((await intruder.post(url, {})).statusCode).toBe(404);
      const read = await browser.get(`/api/v1/matches/${matchId}`);
      expect(read.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(read.json())).not.toContain(replay.input.rngSeed);
      const service = new MatchService(
        (
          app as typeof app & {
            database: ConstructorParameters<typeof MatchService>[0];
          }
        ).database,
      );
      let duplicateChecked = false;
      for (let n = 0; n < 150; n++) {
        const session = (await repos.matches.getEngineSession(matchId))!;
        const recording = session.replay as MatchReplay;
        const engine = replayMatch(recording);
        let state = engine.snapshot();
        if (state.status === 'completed') break;
        if (state.status === 'innings_break') {
          engine.startNextInnings();
          state = engine.snapshot();
        }
        const inning = state.innings[state.currentInningsIndex]!;
        const bowlerId = inning.currentBowlerId ?? engine.eligibleBowlers()[0]!;
        const players = [recording.input.teamA, recording.input.teamB].flatMap(
          (t) => t.players,
        );
        const action = aiBallAction(
          recording.input,
          players.find((p) => p.playerId === bowlerId)!,
          players.find((p) => p.playerId === inning.strikerId)!,
          state.sequence + 1,
        );
        if (!duplicateChecked) {
          await expect(
            service.resolveBall(
              scope,
              matchId,
              { ...action, expectedSequence: 999 },
              bowlerId,
            ),
          ).rejects.toThrow();
          expect(
            (await repos.matches.getEngineSession(matchId))!.revision,
          ).toBe(0);
          const results = await Promise.all([
            service.resolveBall(scope, matchId, action, bowlerId),
            service.resolveBall(scope, matchId, action, bowlerId),
          ]);
          expect(results[0]).toEqual(results[1]);
          expect(
            (await repos.matches.getEngineSession(matchId))!.revision,
          ).toBe(1);
          duplicateChecked = true;
        } else await service.resolveBall(scope, matchId, action, bowlerId);
      }
      const final = (await repos.matches.getEngineSession(matchId))!;
      const engine = replayMatch(final.replay as MatchReplay);
      expect(engine.snapshot().status).toBe('completed');
      expect(final.state).toEqual(engine.snapshot());
      const summary = await repos.matches.getMatchSummary(matchId);
      expect(summary.match.status).toBe('completed');
      expect(summary.match.matchEngineVersion).toBe('2');
      for (const inning of summary.innings)
        expect(
          (await repos.matches.verifyInningsAggregates(inning.id)).consistent,
        ).toBe(true);
      expect((await repos.teams.getFixture(fixture.id))!.status).toBe(
        'completed',
      );
      const last = (final.replay as MatchReplay).commands
        .filter((c) => c.type === 'ball')
        .at(-1)!;
      await service.resolveBall(scope, matchId, last.action);
      expect((await repos.matches.getEngineSession(matchId))!.revision).toBe(
        final.revision,
      );
      expect(
        (await repos.players.getAttributes(playerId))!.batting.timing,
      ).toBe(80);
    } finally {
      await app.close();
    }
  }, 30000);
});
