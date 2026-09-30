import { expect, it } from 'vitest';
import {
  CheckViolationError,
  ForeignKeyViolationError,
  InvalidInputError,
  UniqueViolationError,
} from '../../packages/database/src/index';
import {
  createTestPlayer,
  defaultAttributes,
} from '../../packages/database/src/testing/factories';
import { sql } from '../../packages/database/src/testing/harness';
import { describeDb } from '../support/db';

describeDb('attribute and profile constraints', (ctx) => {
  const repos = () => ctx().database.repositories();

  it('rejects out-of-range attributes in the database (timing 101, power -5)', async () => {
    const high = defaultAttributes();
    const tooHigh = { ...high, batting: { ...high.batting, timing: 101 } };
    await expect(
      createTestPlayer(repos(), { attributes: tooHigh }),
    ).rejects.toBeInstanceOf(CheckViolationError);
    const low = { ...high, batting: { ...high.batting, power: -5 } };
    await expect(
      createTestPlayer(repos(), { attributes: low }),
    ).rejects.toBeInstanceOf(CheckViolationError);
    const zero = { ...high, physical: { ...high.physical, stamina: 0 } };
    await expect(
      createTestPlayer(repos(), { attributes: zero }),
    ).rejects.toBeInstanceOf(CheckViolationError);
  });

  it('accepts the boundary values 1 and 100', async () => {
    const a = defaultAttributes();
    const edge = { ...a, batting: { ...a.batting, timing: 100, power: 1 } };
    const { profile } = await createTestPlayer(repos(), { attributes: edge });
    expect(
      (await repos().players.getAttributes(profile.id))?.batting,
    ).toMatchObject({ timing: 100, power: 1 });
  });

  it('validates attribute updates in the repository before touching the database', async () => {
    const { profile } = await createTestPlayer(repos());
    await expect(
      repos().players.updateAttributes(profile.id, {
        batting: { timing: 101 },
      }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(
      repos().players.updateAttributes(profile.id, { batting: { power: -5 } }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(
      repos().players.updateAttributes(profile.id, {}),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await repos().players.updateAttributes(profile.id, {
      batting: { timing: 88 },
      personality: { confidence: 77 },
    });
    const attrs = await repos().players.getAttributes(profile.id);
    expect(attrs?.batting.timing).toBe(88);
    expect(attrs?.personality.confidence).toBe(77);
  });

  it('enforces profile invariants (jersey range, country code, name, role, one profile per user)', async () => {
    const { user, profile } = await createTestPlayer(repos());
    const base = {
      userId: user.id,
      displayName: 'Another Player',
      countryCode: 'IN',
      jerseyNumber: 5,
      battingHand: 'right' as const,
      primaryRole: 'finisher' as const,
    };
    await expect(repos().players.create(base)).rejects.toBeInstanceOf(
      UniqueViolationError,
    ); // user already has a profile
    const other = await createTestPlayer(repos());
    await expect(
      repos().players.create({
        ...base,
        userId: other.user.id,
        jerseyNumber: 100,
      }),
    ).rejects.toBeInstanceOf(CheckViolationError);
    await expect(
      repos().players.create({
        ...base,
        userId: other.user.id,
        jerseyNumber: -1,
      }),
    ).rejects.toBeInstanceOf(CheckViolationError);
    await expect(
      repos().players.create({
        ...base,
        userId: other.user.id,
        countryCode: 'india',
      }),
    ).rejects.toBeInstanceOf(CheckViolationError);
    await expect(
      repos().players.create({
        ...base,
        userId: other.user.id,
        displayName: 'ab',
      }),
    ).rejects.toBeInstanceOf(CheckViolationError);
    await expect(
      repos().players.create({
        ...base,
        userId: other.user.id,
        displayName: ' padded ',
      }),
    ).rejects.toBeInstanceOf(CheckViolationError);
    expect(profile.id).not.toBe(other.profile.id);
  });

  it('keeps foreign keys intact (no orphan careers, attributes or wallets)', async () => {
    const ghost = '00000000-0000-7000-8000-0000000000aa';
    await expect(
      repos().careers.create({ playerId: ghost, tier: 'academy' }),
    ).rejects.toBeInstanceOf(ForeignKeyViolationError);
    await expect(
      repos().players.createAttributes(ghost, defaultAttributes()),
    ).rejects.toBeInstanceOf(ForeignKeyViolationError);
    await expect(repos().wallet.ensureBalances(ghost)).rejects.toBeInstanceOf(
      ForeignKeyViolationError,
    );
    await expect(
      repos().players.create({
        userId: ghost,
        displayName: 'Nobody Here',
        countryCode: 'IN',
        jerseyNumber: 1,
        battingHand: 'right',
        primaryRole: 'finisher',
      }),
    ).rejects.toBeInstanceOf(ForeignKeyViolationError);
  });

  it('refuses to delete a user that still owns a player (deliberate RESTRICT)', async () => {
    const { user } = await createTestPlayer(repos());
    await expect(
      ctx().database.db.execute(
        sql`DELETE FROM users WHERE id = ${user.id}::uuid`,
      ),
    ).rejects.toThrow();
  });

  it('checks users soft-delete consistency', async () => {
    const { user } = await createTestPlayer(repos());
    const suspended = await repos().users.changeStatus(user.id, 'suspended');
    expect(suspended.deletedAt).toBeNull();
    const deleted = await repos().users.changeStatus(user.id, 'deleted');
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    await expect(
      repos().users.changeStatus(user.id, 'active'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  });

  it('caps level and XP and keeps lifetime XP monotonic', async () => {
    const { profile } = await createTestPlayer(repos());
    await expect(
      repos().players.applyLevelUp({
        playerId: profile.id,
        expectedRowVersion: 0,
        newLevel: 51,
        newCurrentXp: 0,
      }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(
      ctx().database.db.execute(
        sql`UPDATE player_state SET level = 0 WHERE player_id = ${profile.id}::uuid`,
      ),
    ).rejects.toThrow();
    await expect(
      ctx().database.db.execute(
        sql`UPDATE player_state SET current_xp = -1 WHERE player_id = ${profile.id}::uuid`,
      ),
    ).rejects.toThrow();
    await repos().players.awardXp(profile.id, 100);
    await expect(
      ctx().database.db.execute(
        sql`UPDATE player_state SET lifetime_xp = 1, current_xp = 0 WHERE player_id = ${profile.id}::uuid`,
      ),
    ).rejects.toThrow();
  });
});
