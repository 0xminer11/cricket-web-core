import { expect, it } from 'vitest';
import { PLAYER_ARCHETYPES } from '../../packages/game-core/src/index';
import {
  createPlayerFoundationAtomic,
  UnknownDefinitionError,
} from '../../packages/database/src/index';
import type { PlayerFoundationInput } from '../../packages/database/src/index';
import {
  createTestPlayer,
  createTestUser,
  defaultAttributes,
} from '../../packages/database/src/testing/factories';
import { describeDb } from '../support/db';

describeDb('player persistence', (ctx) => {
  const repos = () => ctx().database.repositories();
  const foundationInput = (
    userId: string,
    overrides: Partial<PlayerFoundationInput> = {},
  ): PlayerFoundationInput => ({
    userId,
    profile: {
      displayName: 'Foundation Test',
      countryCode: 'IN',
      jerseyNumber: 12,
      battingHand: 'left',
      primaryRole: 'opening_batter',
    },
    appearance: {
      bodyPresetId: 'body.athletic_01',
      facePresetId: 'face.preset_02',
      skinToneId: 'skin.tone_03',
      hairStyleId: 'hair.short_01',
      hairColorId: 'haircolor.black',
      beardStyleId: 'beard.stubble_01',
      heightScale: 1.05,
    },
    attributes: defaultAttributes(),
    level: 2,
    career: { tier: 'academy', teamDefinitionId: 'team.academy.riverhawks' },
    startingBalances: { coins: 2500, gems: 50 },
    starterItems: [
      { itemDefinitionId: 'item.bat.street_willow_01', equip: true },
      { itemDefinitionId: 'item.helmet.core_guard_01', equip: true },
    ],
    starterAchievementIds: ['achievement.first_fifty'],
    ...overrides,
  });

  it('creates the whole player foundation in one transaction', async () => {
    const user = await createTestUser(repos());
    const foundation = await createPlayerFoundationAtomic(
      ctx().database,
      foundationInput(user.id),
    );
    const id = foundation.profile.id;
    expect(foundation.balances).toEqual([
      { currencyType: 'coins', balance: 2500 },
      { currencyType: 'gems', balance: 50 },
    ]);
    expect(await repos().players.getAttributes(id)).toEqual(
      defaultAttributes(),
    );
    expect(await repos().players.getAppearance(id)).toMatchObject({
      beardStyleId: 'beard.stubble_01',
      heightScale: 1.05,
    });
    expect(await repos().players.getState(id)).toMatchObject({
      level: 2,
      currentXp: 0,
      form: 50,
      fatigue: 0,
    });
    expect(await repos().players.getStats(id)).toMatchObject({
      matches: 0,
      runs: 0,
    });
    expect(await repos().wallet.reconcile(id, 'coins')).toMatchObject({
      consistent: true,
    });
    expect(await repos().inventory.getEquipped(id)).toHaveLength(2);
    expect(await repos().achievements.list(id)).toHaveLength(1);
    const career = await repos().careers.getActiveCareer(id);
    expect(career).toMatchObject({
      currentTier: 'academy',
      seasonNumber: 1,
      reputation: 0,
    });
    expect(career?.currentTeamId).not.toBeNull();
    const history = await repos().careers.listHistory(career?.id ?? '');
    expect(history.items.map((h) => h.eventType).sort()).toEqual([
      'career_started',
      'team_joined',
    ]);
    expect(await repos().teams.getActiveMemberships(id)).toHaveLength(1);
  });

  it('leaves nothing behind when any step of creation fails', async () => {
    const user = await createTestUser(repos());
    const bad = foundationInput(user.id, {
      starterItems: [
        { itemDefinitionId: 'item.bat.street_willow_01' },
        { itemDefinitionId: 'item.bat.nonexistent' },
      ],
    });
    await expect(
      createPlayerFoundationAtomic(ctx().database, bad),
    ).rejects.toBeInstanceOf(UnknownDefinitionError);
    expect(await repos().players.findByUserId(user.id)).toBeNull();
    // and the same user can then be created correctly
    const ok = await createPlayerFoundationAtomic(
      ctx().database,
      foundationInput(user.id),
    );
    expect(ok.profile.userId).toBe(user.id);
  });

  it('rejects a second creation for the same user without touching the first player', async () => {
    const user = await createTestUser(repos());
    const first = await createPlayerFoundationAtomic(
      ctx().database,
      foundationInput(user.id),
    );
    await expect(
      createPlayerFoundationAtomic(ctx().database, foundationInput(user.id)),
    ).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' });
    expect(await repos().wallet.getBalance(first.profile.id, 'coins')).toBe(
      2500,
    ); // no second starter grant
    expect(
      (await repos().inventory.getOwnedItems(first.profile.id)).items,
    ).toHaveLength(2);
  });

  it('never loses concurrent XP awards', async () => {
    const { profile } = await createTestPlayer(repos());
    await Promise.all(
      Array.from({ length: 25 }, () => repos().players.awardXp(profile.id, 10)),
    );
    expect(await repos().players.getState(profile.id)).toMatchObject({
      currentXp: 250,
      lifetimeXp: 250,
      rowVersion: 25,
    });
  });

  it('applies level-ups optimistically and rejects a stale writer', async () => {
    const { profile } = await createTestPlayer(repos());
    await repos().players.awardXp(profile.id, 500);
    const seen = await repos().players.getState(profile.id);
    expect(seen).not.toBeNull();
    const up = await repos().players.applyLevelUp({
      playerId: profile.id,
      expectedRowVersion: seen?.rowVersion ?? -1,
      newLevel: 2,
      newCurrentXp: 80,
    });
    expect(up).toMatchObject({ level: 2, currentXp: 80, lifetimeXp: 500 });
    await expect(
      repos().players.applyLevelUp({
        playerId: profile.id,
        expectedRowVersion: seen?.rowVersion ?? -1,
        newLevel: 3,
        newCurrentXp: 0,
      }),
    ).rejects.toMatchObject({ code: 'STALE_WRITE' });
    await expect(
      repos().players.applyLevelUp({
        playerId: '00000000-0000-7000-8000-0000000000bb',
        expectedRowVersion: 0,
        newLevel: 3,
        newCurrentXp: 0,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('locks state for read-modify-write inside a transaction so concurrent level-ups serialise', async () => {
    const { profile } = await createTestPlayer(repos());
    await repos().players.awardXp(profile.id, 100);
    await Promise.all(
      [1, 2, 3, 4].map(() =>
        ctx().database.transaction(async (tx) => {
          const r = ctx().database.repositories(tx);
          const state = await r.players.getState(profile.id, {
            forUpdate: true,
          });
          await r.players.applyLevelUp({
            playerId: profile.id,
            expectedRowVersion: state?.rowVersion ?? 0,
            newLevel: (state?.level ?? 1) + 1,
            newCurrentXp: state?.currentXp ?? 0,
          });
        }),
      ),
    );
    expect((await repos().players.getState(profile.id))?.level).toBe(5);
  });

  it('accumulates skill XP atomically and applies skill points with compare-and-set', async () => {
    const { profile } = await createTestPlayer(repos());
    await Promise.all(
      Array.from({ length: 10 }, () =>
        repos().players.addSkillXp(profile.id, 'batting.timing', 7),
      ),
    );
    expect(
      (await repos().players.getSkillProgress(profile.id)).find(
        (s) => s.statKey === 'batting.timing',
      )?.skillXp,
    ).toBe(70);
    const before =
      (await repos().players.getAttributes(profile.id))?.batting.timing ?? 0;
    await repos().players.applySkillPoint({
      playerId: profile.id,
      statKey: 'batting.timing',
      expectedSkillXp: 70,
      remainingSkillXp: 5,
      newStatValue: before + 1,
    });
    expect(
      (await repos().players.getAttributes(profile.id))?.batting.timing,
    ).toBe(before + 1);
    await expect(
      repos().players.applySkillPoint({
        playerId: profile.id,
        statKey: 'batting.timing',
        expectedSkillXp: 70,
        remainingSkillXp: 0,
        newStatValue: before + 2,
      }),
    ).rejects.toMatchObject({ code: 'STALE_WRITE' });
    expect(
      (await repos().players.getAttributes(profile.id))?.batting.timing,
    ).toBe(before + 1); // failed CAS changed nothing
  });

  it('clamps fatigue atomically and validates form', async () => {
    const { profile } = await createTestPlayer(repos());
    expect((await repos().players.adjustFatigue(profile.id, 70)).fatigue).toBe(
      70,
    );
    expect((await repos().players.adjustFatigue(profile.id, 70)).fatigue).toBe(
      100,
    );
    expect(
      (await repos().players.adjustFatigue(profile.id, -100)).fatigue,
    ).toBe(0);
    expect((await repos().players.setForm(profile.id, 64)).form).toBe(64);
    await expect(
      repos().players.setForm(profile.id, 101),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('accumulates statistics per scope with SQL-side arithmetic', async () => {
    const { profile } = await createTestPlayer(repos());
    await repos().players.applyStatsDelta(profile.id, {
      matches: 1,
      inningsBatted: 1,
      runs: 34,
      ballsFaced: 20,
      fours: 3,
      sixes: 1,
      highestScore: 34,
      wickets: 2,
      ballsBowled: 12,
      runsConceded: 15,
      bestBowling: { wickets: 2, runs: 15 },
    });
    await Promise.all([
      repos().players.applyStatsDelta(profile.id, {
        matches: 1,
        inningsBatted: 1,
        notOuts: 1,
        runs: 61,
        ballsFaced: 30,
        fifties: 1,
        highestScore: 61,
        wickets: 3,
        ballsBowled: 12,
        runsConceded: 30,
        bestBowling: { wickets: 3, runs: 30 },
      }),
      repos().players.applyStatsDelta(profile.id, {
        matches: 1,
        inningsBatted: 1,
        runs: 5,
        ballsFaced: 8,
        highestScore: 5,
        wickets: 3,
        ballsBowled: 6,
        runsConceded: 12,
        bestBowling: { wickets: 3, runs: 12 },
      }),
    ]);
    const career = await repos().players.getStats(profile.id);
    expect(career).toMatchObject({
      matches: 3,
      inningsBatted: 3,
      notOuts: 1,
      runs: 100,
      ballsFaced: 58,
      highestScore: 61,
      wickets: 8,
      ballsBowled: 30,
      runsConceded: 57,
      bestBowlingWickets: 3,
      bestBowlingRuns: 12,
    });
    await repos().players.applyStatsDelta(
      profile.id,
      { matches: 1 },
      { type: 'format', id: 'format.2_over' },
    );
    expect(
      (await repos().players.getStats(profile.id, 'format', 'format.2_over'))
        ?.matches,
    ).toBe(1);
    expect((await repos().players.getStats(profile.id))?.matches).toBe(3); // scopes are independent
  });

  it('serves the dashboard read model in one call', async () => {
    const user = await createTestUser(repos());
    const { profile } = await createPlayerFoundationAtomic(
      ctx().database,
      foundationInput(user.id),
    );
    const dashboard = await repos().players.getDashboard(profile.id);
    expect(dashboard).toMatchObject({
      profile: { id: profile.id, displayName: 'Foundation Test' },
      state: { level: 2 },
      career: { currentTier: 'academy' },
      currentTeam: { definitionId: 'team.academy.riverhawks' },
    });
    expect(dashboard?.balances).toHaveLength(2);
    expect(dashboard?.equipped.map((e) => e.equipmentSlot)).toEqual([
      'bat',
      'helmet',
    ]);
    expect(
      await repos().players.getDashboard(
        '00000000-0000-7000-8000-0000000000cc',
      ),
    ).toBeNull();
  });

  it('uses Module 0 archetype attributes without alteration', async () => {
    const source = PLAYER_ARCHETYPES.find(
      (a) => a.id === 'archetype.fast_enforcer',
    );
    expect(source).toBeDefined();
    const { profile } = await createTestPlayer(repos(), {
      attributes: structuredClone(source?.attributes) as ReturnType<
        typeof defaultAttributes
      >,
    });
    expect(await repos().players.getAttributes(profile.id)).toEqual(
      source?.attributes,
    );
  });
});
