import { expect, it } from 'vitest';
import {
  DATA_SCHEMA_VERSION,
  GAME_BALANCE_VERSION,
  MATCH_ENGINE_VERSION,
} from '../../packages/game-core/src/index';
import { OwnershipViolationError } from '../../packages/database/src/index';
import type {
  MatchRepository,
  RecordBallInput,
} from '../../packages/database/src/index';
import {
  createTestMatch,
  createTestPlayer,
} from '../../packages/database/src/testing/factories';
import { sql } from '../../packages/database/src/testing/harness';
import { describeDb } from '../support/db';

describeDb('match persistence', (ctx) => {
  const repos = () => ctx().database.repositories();

  async function startedMatch(playerId?: string) {
    const summary = await createTestMatch(
      repos(),
      playerId ? { playerId } : {},
    );
    await repos().matches.startMatch(summary.match.id);
    const home = summary.match.homeTeamId;
    const away = summary.match.awayTeamId;
    const pick = (team: string, position: number) => {
      const found = summary.participants.find(
        (p) => p.teamId === team && p.battingPosition === position,
      );
      if (!found) throw new Error('participant');
      return found.id;
    };
    const innings = await repos().matches.createInnings({
      matchId: summary.match.id,
      inningsNumber: 1,
      battingTeamId: home,
      bowlingTeamId: away,
    });
    const over = await repos().matches.startOver({
      inningsId: innings.id,
      overNumber: 1,
      bowlerParticipantId: pick(away, 2),
    });
    const ball = (
      sequenceNumber: number,
      extra: Partial<RecordBallInput> = {},
    ): RecordBallInput => ({
      overId: over.id,
      sequenceNumber,
      ballInOver: sequenceNumber,
      strikerParticipantId: pick(home, 1),
      nonStrikerParticipantId: pick(home, 2),
      bowlerParticipantId: pick(away, 2),
      deliveryDefinitionId: 'delivery.fast.stock',
      line: 'middle',
      length: 'good',
      runsOffBat: 0,
      extras: 0,
      legalDelivery: true,
      ...extra,
    });
    return { summary, innings, over, ball, pick, home, away };
  }

  it('creates a match pinned to the current engine, balance and schema versions', async () => {
    const { match, participants } = await createTestMatch(repos());
    expect(match).toMatchObject({
      status: 'created',
      matchEngineVersion: MATCH_ENGINE_VERSION,
      gameBalanceVersion: GAME_BALANCE_VERSION,
      dataSchemaVersion: DATA_SCHEMA_VERSION,
      matchFormatId: 'format.2_over',
      pitchDefinitionId: 'pitch.green',
    });
    expect(participants).toHaveLength(4);
  });

  it('rejects unknown formats, pitches and participants from other teams', async () => {
    const summary = await createTestMatch(repos());
    const base = {
      matchMode: 'friendly' as const,
      homeTeamId: summary.match.homeTeamId,
      awayTeamId: summary.match.awayTeamId,
      participants: [],
    };
    await expect(
      repos().matches.createMatch({
        ...base,
        matchFormatId: 'format.9_over',
        pitchDefinitionId: 'pitch.green',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_DEFINITION' });
    await expect(
      repos().matches.createMatch({
        ...base,
        matchFormatId: 'format.2_over',
        pitchDefinitionId: 'pitch.lava',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_DEFINITION' });
    await expect(
      repos().matches.createMatch({
        ...base,
        matchFormatId: 'format.2_over',
        pitchDefinitionId: 'pitch.green',
        participants: [
          {
            teamId: '00000000-0000-7000-8000-0000000000dd',
            participantType: 'ai',
            displayName: 'Stranger',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('enforces the status machine', async () => {
    const { match } = await createTestMatch(repos());
    await expect(
      repos().matches.completeMatch({ matchId: match.id, resultType: 'tie' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    expect((await repos().matches.markReady(match.id)).status).toBe('ready');
    expect((await repos().matches.startMatch(match.id)).status).toBe(
      'in_progress',
    );
    await expect(repos().matches.startMatch(match.id)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    await expect(repos().matches.cancelMatch(match.id)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    await expect(
      repos().matches.createInnings({
        matchId: (await createTestMatch(repos())).match.id,
        inningsNumber: 1,
        battingTeamId: match.homeTeamId,
        bowlingTeamId: match.awayTeamId,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' }); // not started
  });

  it('enforces innings and over uniqueness', async () => {
    const { summary, innings, over } = await startedMatch();
    await expect(
      repos().matches.createInnings({
        matchId: summary.match.id,
        inningsNumber: 1,
        battingTeamId: summary.match.awayTeamId,
        bowlingTeamId: summary.match.homeTeamId,
      }),
    ).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' });
    await expect(
      repos().matches.startOver({
        inningsId: innings.id,
        overNumber: 1,
        bowlerParticipantId: over.bowlerParticipantId,
      }),
    ).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' });
    const second = await repos().matches.createInnings({
      matchId: summary.match.id,
      inningsNumber: 2,
      battingTeamId: summary.match.awayTeamId,
      bowlingTeamId: summary.match.homeTeamId,
    });
    expect(second.inningsNumber).toBe(2);
  });

  it('keeps balls strictly ordered, gap-free and aggregate-consistent', async () => {
    const { innings, over, ball } = await startedMatch();
    await repos().matches.recordBall(ball(1, { runsOffBat: 4 }));
    await repos().matches.recordBall(
      ball(2, {
        runsOffBat: 0,
        extras: 1,
        extraType: 'wide',
        legalDelivery: false,
      }),
    );
    await repos().matches.recordBall(ball(3, { runsOffBat: 1 }));
    await expect(repos().matches.recordBall(ball(3))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    }); // repeat
    await expect(repos().matches.recordBall(ball(9))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    }); // gap
    const balls = (await repos().matches.listBalls(innings.id)).items;
    expect(balls.map((b) => b.sequenceNumber)).toEqual([1, 2, 3]);
    const check = await repos().matches.verifyInningsAggregates(innings.id);
    expect(check).toMatchObject({
      consistent: true,
      stored: { runs: 6, extras: 1, legalBalls: 2, wickets: 0 },
    });
    const overs = await repos().matches.listOvers(innings.id);
    expect(overs[0]).toMatchObject({ id: over.id, runs: 6, legalBalls: 2 });
  });

  it('rolls a rejected ball back completely, including aggregates', async () => {
    const { innings, ball } = await startedMatch();
    await repos().matches.recordBall(ball(1, { runsOffBat: 2 }));
    await expect(
      repos().matches.recordBall(
        ball(2, { runsOffBat: 6, deliveryDefinitionId: 'delivery.made.up' }),
      ),
    ).rejects.toMatchObject({ code: 'UNKNOWN_DEFINITION' });
    await expect(
      repos().matches.recordBall(
        ball(2, { runsOffBat: 6, wicketType: 'bowled' }),
      ),
    ).rejects.toMatchObject({ code: 'CHECK_VIOLATION' }); // wicket without dismissed batter
    expect(
      (await repos().matches.verifyInningsAggregates(innings.id)).stored.runs,
    ).toBe(2);
  });

  it('serialises simultaneous ball submissions so only one takes a sequence number', async () => {
    const { innings, ball } = await startedMatch();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        repos().matches.recordBall(ball(1, { runsOffBat: 1 })),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await repos().matches.verifyInningsAggregates(innings.id)).fromBalls
        .runs,
    ).toBe(1);
  });

  it('rejects balls that reference another match’s participants, overs or wickets on wrong batters', async () => {
    const one = await startedMatch();
    const two = await startedMatch();
    await expect(
      repos().matches.recordBall(
        one.ball(1, { strikerParticipantId: two.pick(two.home, 1) }),
      ),
    ).rejects.toMatchObject({ code: 'FOREIGN_KEY_VIOLATION' });
    await expect(
      repos().matches.recordBall(
        one.ball(1, { bowlerParticipantId: two.pick(two.away, 2) }),
      ),
    ).rejects.toMatchObject({ code: 'FOREIGN_KEY_VIOLATION' });
    await expect(
      ctx().database.db.execute(
        sql`UPDATE match_balls SET match_id = ${two.summary.match.id}::uuid`,
      ),
    ).rejects.toThrow();
  });

  it('validates delivery-level integrity rules in the database', async () => {
    const { ball } = await startedMatch();
    await expect(
      repos().matches.recordBall(ball(1, { extras: 1 })),
    ).rejects.toMatchObject({ code: 'CHECK_VIOLATION' }); // extras without type
    await expect(
      repos().matches.recordBall(
        ball(1, { extras: 1, extraType: 'wide', legalDelivery: true }),
      ),
    ).rejects.toMatchObject({ code: 'CHECK_VIOLATION' }); // a wide is not legal
    await expect(
      repos().matches.recordBall(ball(1, { runsOffBat: 9 })),
    ).rejects.toMatchObject({ code: 'CHECK_VIOLATION' });
    await expect(
      repos().matches.recordBall(ball(1, { ballInOver: 0 })),
    ).rejects.toMatchObject({ code: 'CHECK_VIOLATION' });
  });

  it('completes a match exactly once', async () => {
    const { summary, innings, over, ball, home } = await startedMatch();
    await repos().matches.recordBall(ball(1, { runsOffBat: 6 }));
    await expect(
      repos().matches.completeMatch({
        matchId: summary.match.id,
        resultType: 'win',
        winnerTeamId: home,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' }); // innings unfinished
    await repos().matches.completeOver(over.id);
    await expect(repos().matches.completeOver(over.id)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
    await expect(repos().matches.recordBall(ball(2))).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    }); // over closed
    await repos().matches.completeInnings(innings.id);
    await expect(
      repos().matches.completeMatch({
        matchId: summary.match.id,
        resultType: 'win',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' }); // win needs winner
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        repos().matches.completeMatch({
          matchId: summary.match.id,
          resultType: 'win',
          winnerTeamId: home,
          resultSummary: 'Home won',
        }),
      ),
    );
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const done = await repos().matches.getMatch(summary.match.id);
    expect(done).toMatchObject({
      status: 'completed',
      winnerTeamId: home,
      resultType: 'win',
    });
    expect(done?.completedAt).toBeInstanceOf(Date);
  });

  it('refuses completion when stored aggregates drift from the balls', async () => {
    const { innings, ball } = await startedMatch();
    await repos().matches.recordBall(ball(1, { runsOffBat: 2 }));
    await ctx().database.db.execute(
      sql`UPDATE match_innings SET runs = 99 WHERE id = ${innings.id}::uuid`,
    );
    await expect(
      repos().matches.completeInnings(innings.id),
    ).rejects.toMatchObject({ code: 'INTEGRITY_ERROR' });
  });

  it('lists a player’s match history with opponent, result and scores without loading balls', async () => {
    const { profile } = await createTestPlayer(repos());
    const { summary, innings, over, ball, home, away } = await startedMatch(
      profile.id,
    );
    await repos().matches.recordBall(ball(1, { runsOffBat: 4 }));
    await repos().matches.completeOver(over.id);
    await repos().matches.completeInnings(innings.id);
    const second = await repos().matches.createInnings({
      matchId: summary.match.id,
      inningsNumber: 2,
      battingTeamId: away,
      bowlingTeamId: home,
    });
    await repos().matches.completeInnings(second.id);
    await repos().matches.completeMatch({
      matchId: summary.match.id,
      resultType: 'win',
      winnerTeamId: home,
    });
    const participant = summary.participants.find(
      (p) => p.playerId === profile.id,
    );
    await repos().matches.setPerformanceRatings(summary.match.id, [
      { participantId: participant?.id ?? '', rating: 7.5 },
    ]);

    const page = await repos().matches.listPlayerMatchHistory(profile.id);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      matchId: summary.match.id,
      playerTeamId: home,
      opponentTeamId: away,
      status: 'completed',
      won: true,
      matchFormatId: 'format.2_over',
      performanceRating: 7.5,
    });
    expect(page.items[0]?.scores).toEqual([
      { teamId: home, runs: 4, wickets: 0, legalBalls: 1 },
      { teamId: away, runs: 0, wickets: 0, legalBalls: 0 },
    ]);
    expect(
      await repos().matches.getRecentPerformanceRatings(profile.id),
    ).toEqual([7.5]);
  });

  it('only returns a match to players who took part in it', async () => {
    const insider = await createTestPlayer(repos());
    const outsider = await createTestPlayer(repos());
    const { summary } = await startedMatch(insider.profile.id);
    expect(
      (
        await repos().matches.getMatchForPlayer(
          insider.profile.id,
          summary.match.id,
        )
      ).match.id,
    ).toBe(summary.match.id);
    await expect(
      repos().matches.getMatchForPlayer(outsider.profile.id, summary.match.id),
    ).rejects.toBeInstanceOf(OwnershipViolationError);
  });

  it('supports human-vs-human participants (PvP-ready) and human/AI constraints', async () => {
    const a = await createTestPlayer(repos());
    const b = await createTestPlayer(repos());
    const home = (await createTestMatch(repos())).match;
    const pvp = await repos().matches.createMatch({
      matchMode: 'ranked',
      matchFormatId: 'format.5_over',
      pitchDefinitionId: 'pitch.hard',
      homeTeamId: home.homeTeamId,
      awayTeamId: home.awayTeamId,
      participants: [
        {
          teamId: home.homeTeamId,
          participantType: 'human',
          playerId: a.profile.id,
          battingPosition: 1,
          displayName: 'A',
        },
        {
          teamId: home.awayTeamId,
          participantType: 'human',
          playerId: b.profile.id,
          battingPosition: 1,
          displayName: 'B',
        },
      ],
    });
    expect(pvp.participants.every((p) => p.participantType === 'human')).toBe(
      true,
    );
    await expect(
      repos().matches.createMatch({
        matchMode: 'friendly',
        matchFormatId: 'format.2_over',
        pitchDefinitionId: 'pitch.dry',
        homeTeamId: home.homeTeamId,
        awayTeamId: home.awayTeamId,
        participants: [
          {
            teamId: home.homeTeamId,
            participantType: 'ai',
            playerId: a.profile.id,
            displayName: 'Bad',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CHECK_VIOLATION' });
    await expect(
      repos().matches.createMatch({
        matchMode: 'friendly',
        matchFormatId: 'format.2_over',
        pitchDefinitionId: 'pitch.dry',
        homeTeamId: home.homeTeamId,
        awayTeamId: home.awayTeamId,
        participants: [
          {
            teamId: home.homeTeamId,
            participantType: 'human',
            displayName: 'No profile',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CHECK_VIOLATION' });
  });
});

export type { MatchRepository };
