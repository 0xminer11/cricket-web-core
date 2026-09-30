import { expect, it } from 'vitest';
import { IdempotencyConflictError } from '../../packages/database/src/index';
import {
  createTestCareer,
  createTestPlayer,
} from '../../packages/database/src/testing/factories';
import { describeDb } from '../support/db';

describeDb('reward grants and duplicate protection', (ctx) => {
  const repos = () => ctx().database.repositories();
  const payload = {
    coins: 300,
    gems: 5,
    playerXp: 150,
    fans: 250,
    reputation: 8,
    skillXp: [{ statKey: 'batting.timing' as const, amount: 20 }],
    items: [{ itemDefinitionId: 'item.helmet.core_guard_01' }],
  };

  it('grants a match reward once: coins, XP, career gains, skill XP and items apply a single time', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 100 });
    await createTestCareer(repos(), profile.id);
    const input = {
      playerId: profile.id,
      sourceType: 'match' as const,
      sourceId: 'match-abc-123',
      idempotencyKey: `reward-${profile.id}-match-abc-123`,
      payload,
    };

    const first = await repos().rewards.grantOnce(input);
    const second = await repos().rewards.grantOnce(input);
    expect(first.granted).toBe(true);
    expect(second.granted).toBe(false);
    expect(second.grant.id).toBe(first.grant.id);

    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(400);
    expect(await repos().wallet.getBalance(profile.id, 'gems')).toBe(5);
    const state = await repos().players.getState(profile.id);
    expect(state).toMatchObject({ currentXp: 150, lifetimeXp: 150 });
    const career = await repos().careers.getActiveCareer(profile.id);
    expect(career).toMatchObject({ fans: 250, reputation: 8 });
    expect(
      (await repos().players.getSkillProgress(profile.id))[0],
    ).toMatchObject({ statKey: 'batting.timing', skillXp: 20 });
    expect(
      (await repos().inventory.getOwnedItems(profile.id)).items,
    ).toHaveLength(1);
    const ledger = (
      await repos().wallet.getTransactions(profile.id)
    ).items.filter((t) => t.transactionType === 'match_reward');
    expect(ledger).toHaveLength(2); // coins + gems, once each
  });

  it('survives simultaneous duplicate submissions', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 0 });
    await createTestCareer(repos(), profile.id);
    const input = {
      playerId: profile.id,
      sourceType: 'match' as const,
      sourceId: 'match-race',
      idempotencyKey: `reward-race-${profile.id}`,
      payload: { coins: 100, playerXp: 40 },
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repos().rewards.grantOnce(input)),
    );
    expect(results.filter((r) => r.granted)).toHaveLength(1);
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(100);
    expect((await repos().players.getState(profile.id))?.currentXp).toBe(40);
  });

  it('keys rewards per source: another match still pays', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 0 });
    await createTestCareer(repos(), profile.id);
    for (const id of ['m-one', 'm-two'])
      await repos().rewards.grantOnce({
        playerId: profile.id,
        sourceType: 'match',
        sourceId: id,
        idempotencyKey: `reward-${profile.id}-${id}`,
        payload: { coins: 50 },
      });
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(100);
  });

  it('rolls the whole grant back when any effect fails', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 0 });
    // no career => fans cannot be applied => the coins credited earlier in the grant must vanish
    await expect(
      repos().rewards.grantOnce({
        playerId: profile.id,
        sourceType: 'match',
        sourceId: 'no-career',
        idempotencyKey: `reward-nc-${profile.id}`,
        payload: { coins: 100, fans: 10 },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(0);
    expect(
      await repos().rewards.getGrant(profile.id, 'match', 'no-career'),
    ).toBeNull();
  });

  it('flags a reused idempotency key for a different source', async () => {
    const { profile } = await createTestPlayer(repos(), { coins: 0 });
    const key = `reward-reuse-${profile.id}`;
    await repos().rewards.grantOnce({
      playerId: profile.id,
      sourceType: 'match',
      sourceId: 'first',
      idempotencyKey: key,
      payload: { coins: 10 },
    });
    await expect(
      repos().rewards.grantOnce({
        playerId: profile.id,
        sourceType: 'match',
        sourceId: 'second',
        idempotencyKey: key,
        payload: { coins: 10 },
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(await repos().wallet.getBalance(profile.id, 'coins')).toBe(10);
  });

  it('refuses currency for sources that cannot pay it', async () => {
    const { profile } = await createTestPlayer(repos());
    await expect(
      repos().rewards.grantOnce({
        playerId: profile.id,
        sourceType: 'training',
        sourceId: 't',
        idempotencyKey: `reward-tr-${profile.id}`,
        payload: { coins: 5 },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
