import { expect, it } from 'vitest';
import { sql } from '../../packages/database/src/testing/harness';
import {
  createTestCareer,
  createTestPlayer,
  createTestTeam,
} from '../../packages/database/src/testing/factories';
import { describeDb } from '../support/db';

describeDb('career, contracts, sponsorships and teams', (ctx) => {
  const repos = () => ctx().database.repositories();

  it('allows one active career per player and records career_started history', async () => {
    const { profile } = await createTestPlayer(repos());
    const career = await createTestCareer(repos(), profile.id);
    expect(career).toMatchObject({
      currentTier: 'academy',
      careerStatus: 'active',
      seasonNumber: 1,
    });
    await expect(createTestCareer(repos(), profile.id)).rejects.toMatchObject({
      code: 'UNIQUE_VIOLATION',
    });
    const history = await repos().careers.listHistory(career.id);
    expect(history.items.map((h) => h.eventType)).toEqual(['career_started']);
    const retired = await repos().careers.retire(career.id);
    expect(retired).toMatchObject({ careerStatus: 'retired' });
    expect(retired.retiredAt).toBeInstanceOf(Date);
    const next = await createTestCareer(repos(), profile.id, { tier: 'club' }); // a new career after retirement
    expect(next.id).not.toBe(career.id);
    await expect(repos().careers.retire(career.id)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('keeps career history append-only', async () => {
    const { profile } = await createTestPlayer(repos());
    const career = await createTestCareer(repos(), profile.id);
    await repos().careers.appendHistory({
      careerId: career.id,
      eventType: 'captaincy_awarded',
      referenceId: 'team-x',
      metadata: { season: 1 },
    });
    const row = (await repos().careers.listHistory(career.id)).items[0];
    await expect(
      ctx().database.db.execute(
        sql`UPDATE career_history SET event_type = 'retired' WHERE id = ${row?.id}::uuid`,
      ),
    ).rejects.toThrow();
    await expect(
      ctx().database.db.execute(
        sql`DELETE FROM career_history WHERE id = ${row?.id}::uuid`,
      ),
    ).rejects.toThrow();
  });

  it('applies progress deltas atomically with clamping', async () => {
    const { profile } = await createTestPlayer(repos());
    const career = await createTestCareer(repos(), profile.id);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        repos().careers.applyProgressDelta(career.id, {
          fans: 100,
          reputation: 90,
          selectorInterest: 15,
        }),
      ),
    );
    const after = await repos().careers.getActiveCareer(profile.id);
    expect(after).toMatchObject({
      fans: 1000,
      reputation: 900,
      selectorInterest: 100,
    }); // selector clamps at 100
    const clamped = await repos().careers.applyProgressDelta(career.id, {
      reputation: 500,
      fans: -5000,
    });
    expect(clamped).toMatchObject({ reputation: 1000, fans: 0 });
  });

  it('changes tier with compare-and-set and logs the promotion', async () => {
    const { profile } = await createTestPlayer(repos());
    const career = await createTestCareer(repos(), profile.id);
    const promoted = await repos().careers.changeTier({
      careerId: career.id,
      from: 'academy',
      to: 'club',
      direction: 'promoted',
    });
    expect(promoted.currentTier).toBe('club');
    await expect(
      repos().careers.changeTier({
        careerId: career.id,
        from: 'academy',
        to: 'district',
        direction: 'promoted',
      }),
    ).rejects.toMatchObject({ code: 'STALE_WRITE' });
    const types = (await repos().careers.listHistory(career.id)).items.map(
      (h) => h.eventType,
    );
    expect(types).toEqual(['tier_promoted', 'career_started']);
  });

  it('models career event occurrences separately from definitions', async () => {
    const { profile } = await createTestPlayer(repos());
    const career = await createTestCareer(repos(), profile.id);
    const instance = await repos().careers.createEventInstance({
      careerId: career.id,
      eventDefinitionId: 'career_event.media.form_question',
      careerMatchesAtTrigger: 5,
    });
    await expect(
      repos().careers.createEventInstance({
        careerId: career.id,
        eventDefinitionId: 'career_event.media.form_question',
        careerMatchesAtTrigger: 5,
      }),
    ).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' }); // one pending per definition
    await expect(
      repos().careers.createEventInstance({
        careerId: career.id,
        eventDefinitionId: 'career_event.made.up',
        careerMatchesAtTrigger: 0,
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_DEFINITION' });
    await expect(
      repos().careers.resolveEventInstance({
        careerId: career.id,
        instanceId: instance.id,
        choiceId: 'nope',
        effectsSnapshot: {},
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const resolved = await repos().careers.resolveEventInstance({
      careerId: career.id,
      instanceId: instance.id,
      choiceId: 'accountable',
      effectsSnapshot: [{ type: 'fans', delta: 40 }],
    });
    expect(resolved).toMatchObject({
      status: 'resolved',
      selectedChoiceId: 'accountable',
    });
    await expect(
      repos().careers.resolveEventInstance({
        careerId: career.id,
        instanceId: instance.id,
        choiceId: 'accountable',
        effectsSnapshot: {},
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    const another = await createTestPlayer(repos());
    const otherCareer = await createTestCareer(repos(), another.profile.id);
    await expect(
      repos().careers.resolveEventInstance({
        careerId: otherCareer.id,
        instanceId: instance.id,
        choiceId: 'accountable',
        effectsSnapshot: {},
      }),
    ).rejects.toMatchObject({ code: 'OWNERSHIP_VIOLATION' });
    // a new occurrence is allowed once the previous one is resolved
    const again = await repos().careers.createEventInstance({
      careerId: career.id,
      eventDefinitionId: 'career_event.media.form_question',
      careerMatchesAtTrigger: 15,
    });
    expect(
      (
        await repos().careers.getLatestEventInstance(
          career.id,
          'career_event.media.form_question',
        )
      )?.id,
    ).toBe(again.id);
  });

  it('walks contracts through their state machine with one active contract per career', async () => {
    const { profile } = await createTestPlayer(repos());
    const career = await createTestCareer(repos(), profile.id);
    const team = await createTestTeam(repos(), 'team.club.metro_stallions');
    const offer = (extra = {}) =>
      repos().careers.offerContract({
        careerId: career.id,
        teamId: team.id,
        contractDefinitionId: 'contract.metro_stallions.development_01',
        expectedRole: 'top_order_batter',
        salaryCoins: 1200,
        matchFeeCoins: 120,
        performanceBonusCoins: 80,
        minimumPerformanceRating: 5.5,
        durationMatches: 8,
        ...extra,
      });
    const contract = await offer();
    expect(contract).toMatchObject({
      status: 'offered',
      minimumPerformanceRating: 5.5,
      salaryCoins: 1200,
    });
    await expect(
      repos().careers.transitionContract(career.id, contract.id, 'active'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    const accepted = await repos().careers.transitionContract(
      career.id,
      contract.id,
      'accepted',
    );
    expect(accepted.signedAt).toBeInstanceOf(Date);
    const active = await repos().careers.transitionContract(
      career.id,
      contract.id,
      'active',
    );
    expect(active.status).toBe('active');
    const second = await offer();
    await repos().careers.transitionContract(career.id, second.id, 'accepted');
    await expect(
      repos().careers.transitionContract(career.id, second.id, 'active'),
    ).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' });
    expect(
      (await repos().careers.recordContractMatch(career.id))?.matchesPlayed,
    ).toBe(1);
    const other = await createTestPlayer(repos());
    const otherCareer = await createTestCareer(repos(), other.profile.id);
    await expect(
      repos().careers.transitionContract(
        otherCareer.id,
        contract.id,
        'terminated',
      ),
    ).rejects.toMatchObject({ code: 'OWNERSHIP_VIOLATION' });
    const terminated = await repos().careers.transitionContract(
      career.id,
      contract.id,
      'terminated',
    );
    expect(terminated.terminatedAt).toBeInstanceOf(Date);
    await expect(offer({ salaryCoins: -1 })).rejects.toMatchObject({
      code: 'CHECK_VIOLATION',
    });
    await expect(
      offer({ contractDefinitionId: 'contract.unknown.x' }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_DEFINITION' });
  });

  it('tracks sponsorships against static sponsor definitions', async () => {
    const { profile } = await createTestPlayer(repos());
    const career = await createTestCareer(repos(), profile.id);
    const offer = await repos().careers.offerSponsorship({
      careerId: career.id,
      sponsorDefinitionId: 'sponsor.wicketworks',
      payout: { currency: 'coins', amount: 900 },
      rewardConfigSnapshot: { objectiveIds: ['objective.hit_10_fours'] },
    });
    await expect(
      repos().careers.offerSponsorship({
        careerId: career.id,
        sponsorDefinitionId: 'sponsor.wicketworks',
        payout: { currency: 'coins', amount: 900 },
      }),
    ).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' });
    await expect(
      repos().careers.offerSponsorship({
        careerId: career.id,
        sponsorDefinitionId: 'sponsor.unknown',
        payout: { currency: 'coins', amount: 1 },
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_DEFINITION' });
    const active = await repos().careers.transitionSponsorship(
      career.id,
      offer.id,
      'active',
    );
    expect(active.acceptedAt).toBeInstanceOf(Date);
    await expect(
      repos().careers.transitionSponsorship(
        career.id,
        offer.id,
        'offered' as never,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  });

  it('keeps team membership history instead of overwriting it', async () => {
    const { profile } = await createTestPlayer(repos());
    const a = await createTestTeam(repos(), 'team.academy.riverhawks');
    const b = await createTestTeam(repos(), 'team.club.metro_stallions');
    await repos().teams.joinTeam({
      playerId: profile.id,
      teamId: a.id,
      shirtNumber: 7,
    });
    await expect(
      repos().teams.joinTeam({ playerId: profile.id, teamId: a.id }),
    ).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' });
    const left = await repos().teams.leaveTeam(profile.id, a.id);
    expect(left).toMatchObject({ status: 'ended' });
    await repos().teams.joinTeam({
      playerId: profile.id,
      teamId: b.id,
      role: 'captain',
    });
    await repos().teams.joinTeam({ playerId: profile.id, teamId: a.id }); // may rejoin later
    expect(
      (await repos().teams.getActiveMemberships(profile.id))
        .map((m) => m.teamId)
        .sort(),
    ).toEqual([a.id, b.id].sort());
    expect(
      (await repos().teams.listMembershipHistory(profile.id)).items,
    ).toHaveLength(3);
    await expect(
      repos().teams.leaveTeam(
        profile.id,
        '00000000-0000-7000-8000-0000000000ee',
      ),
    ).rejects.toMatchObject({ code: 'OWNERSHIP_VIOLATION' });
    await expect(
      repos().teams.joinTeam({
        playerId: profile.id,
        teamId: a.id,
        shirtNumber: 100,
      }),
    ).rejects.toMatchObject({ code: 'CHECK_VIOLATION' });
  });

  it('schedules fixtures and enforces their lifecycle', async () => {
    const home = await createTestTeam(repos(), 'team.academy.riverhawks');
    const away = await createTestTeam(repos(), 'team.club.metro_stallions');
    const soon = new Date(Date.now() + 86_400_000);
    const later = new Date(Date.now() + 2 * 86_400_000);
    const f2 = await repos().teams.createFixture({
      competitionDefinitionId: 'competition.local_league',
      homeTeamId: away.id,
      awayTeamId: home.id,
      matchFormatId: 'format.5_over',
      scheduledAt: later,
      round: 2,
    });
    const f1 = await repos().teams.createFixture({
      competitionDefinitionId: 'competition.local_league',
      homeTeamId: home.id,
      awayTeamId: away.id,
      matchFormatId: 'format.2_over',
      scheduledAt: soon,
    });
    await expect(
      repos().teams.createFixture({
        competitionDefinitionId: 'competition.local_league',
        homeTeamId: home.id,
        awayTeamId: home.id,
        matchFormatId: 'format.2_over',
        scheduledAt: soon,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const list = await repos().teams.listFixtures({
      status: 'scheduled',
      from: new Date(),
    });
    const ids = list.items.map((f) => f.id);
    expect(ids.indexOf(f1.id)).toBeLessThan(ids.indexOf(f2.id)); // upcoming first
    expect(
      (await repos().teams.transitionFixture(f1.id, 'in_progress')).status,
    ).toBe('in_progress');
    await expect(
      repos().teams.transitionFixture(f1.id, 'scheduled'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  });

  it('records training sessions once and links the ledger', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 300 });
    const debit = await repos().wallet.debit({
      playerId: profile.id,
      currency: 'coins',
      amount: 60,
      type: 'training_cost',
      reference: { type: 'training', id: 'timing' },
      idempotencyKey: `train-${profile.id}`,
    });
    const { session, replayed } = await repos().training.start({
      playerId: profile.id,
      trainingDefinitionId: 'training.batting.timing',
      walletTransactionId: debit.transaction.id,
      idempotencyKey: `train-${profile.id}`,
    });
    expect(replayed).toBe(false);
    expect(session).toMatchObject({
      status: 'started',
      costAmount: 60,
      costCurrency: 'coins',
      gameBalanceVersion: '1',
    });
    expect(
      (
        await repos().training.start({
          playerId: profile.id,
          trainingDefinitionId: 'training.batting.timing',
          idempotencyKey: `train-${profile.id}`,
        })
      ).replayed,
    ).toBe(true);
    await expect(
      repos().training.start({
        playerId: profile.id,
        trainingDefinitionId: 'training.batting.unknown',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_DEFINITION' });
    const outsider = await createTestPlayer(repos());
    await expect(
      repos().training.complete({
        playerId: outsider.profile.id,
        sessionId: session.id,
        xpAwarded: 25,
        fatigueAdded: 8,
        outcome: {},
      }),
    ).rejects.toMatchObject({ code: 'OWNERSHIP_VIOLATION' });
    const done = await repos().training.complete({
      playerId: profile.id,
      sessionId: session.id,
      xpAwarded: 25,
      fatigueAdded: 8,
      outcome: [
        {
          statKey: 'batting.timing',
          skillXp: 32,
          statBefore: 50,
          statAfter: 50,
        },
      ],
    });
    expect(done).toMatchObject({
      status: 'completed',
      xpAwarded: 25,
      walletTransactionId: debit.transaction.id,
    });
    const results = await Promise.allSettled(
      [1, 2, 3].map(() =>
        repos().training.complete({
          playerId: profile.id,
          sessionId: session.id,
          xpAwarded: 25,
          fatigueAdded: 8,
          outcome: {},
        }),
      ),
    );
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect((await repos().training.list(profile.id)).items).toHaveLength(1);
  });

  it('keeps achievements unique per player and completes them once', async () => {
    const { profile } = await createTestPlayer(repos());
    await repos().achievements.ensure(profile.id, 'achievement.first_fifty');
    await repos().achievements.ensure(profile.id, 'achievement.first_fifty');
    expect(await repos().achievements.list(profile.id)).toHaveLength(1);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        repos().achievements.incrementProgress(
          profile.id,
          'achievement.ten_wins',
          1,
        ),
      ),
    );
    expect(
      (await repos().achievements.get(profile.id, 'achievement.ten_wins'))
        ?.progress,
    ).toBe(10);
    await expect(
      repos().achievements.ensure(profile.id, 'achievement.does_not_exist'),
    ).rejects.toMatchObject({ code: 'UNKNOWN_DEFINITION' });
    expect(
      await repos().achievements.markRewardClaimed(
        profile.id,
        'achievement.ten_wins',
      ),
    ).toBe(false); // not complete yet
    const flips = await Promise.all(
      [1, 2, 3].map(() =>
        repos().achievements.markCompleted(profile.id, 'achievement.ten_wins'),
      ),
    );
    expect(flips.filter(Boolean)).toHaveLength(1);
    const claims = await Promise.all(
      [1, 2, 3].map(() =>
        repos().achievements.markRewardClaimed(
          profile.id,
          'achievement.ten_wins',
        ),
      ),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(
      ctx().database.db.execute(
        sql`INSERT INTO player_achievements (player_id, achievement_definition_id) VALUES (${profile.id}::uuid, 'achievement.ten_wins')`,
      ),
    ).rejects.toThrow();
  });

  it('records sensitive operations in an append-only audit log', async () => {
    const { profile } = await createTestPlayer(repos());
    await expect(
      repos().audit.record({
        actorType: 'admin',
        action: 'wallet.adjust',
        targetType: 'player',
        targetId: profile.id,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const entry = await repos().audit.record({
      actorType: 'admin',
      actorId: 'admin-1',
      action: 'wallet.adjust',
      targetType: 'player',
      targetId: profile.id,
      metadata: { reason: 'support ticket 42' },
    });
    expect(
      (await repos().audit.listForTarget('player', profile.id)).items[0]?.id,
    ).toBe(entry.id);
    await expect(
      ctx().database.db.execute(
        sql`DELETE FROM audit_logs WHERE id = ${entry.id}::uuid`,
      ),
    ).rejects.toThrow();
  });
});
