import { expect, it } from 'vitest';
import { createTestUser } from '../../packages/database/src/testing/factories';
import { execRaw } from '../../packages/database/src/testing/harness';
import { describeDb } from '../support/db';

const HASH = 'a'.repeat(64);
const insert = (url: string, userId: string, cols: Record<string, unknown>) => {
  const base = {
    user_id: userId,
    display_name: 'Test Player',
    country_code: 'IN',
    jersey_number: 7,
    batting_hand: 'right',
    primary_role: 'finisher',
  };
  const row = { ...base, ...cols };
  const keys = Object.keys(row);
  return execRaw(
    url,
    `INSERT INTO player_profiles (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    Object.values(row),
  );
};

describeDb('player creation metadata (migration 0004)', (ctx) => {
  const repos = () => ctx().database.repositories();

  it('stores optional creation metadata and keeps seeded rows valid without it', async () => {
    const user = await createTestUser(repos());
    const [row] = await insert(ctx().url, user.id, {
      creation_key: 'k'.repeat(32),
      creation_request_hash: HASH,
      creation_balance_version: '1',
      starter_personality_id: 'personality.calm',
    });
    expect(row?.id).toBeDefined();
    const other = await createTestUser(repos());
    await expect(insert(ctx().url, other.id, {})).resolves.toHaveLength(1);
  });

  it('rejects malformed idempotency keys, hashes and archetype ids', async () => {
    const check = async (cols: Record<string, unknown>, pattern: RegExp) => {
      const user = await createTestUser(repos());
      await expect(insert(ctx().url, user.id, cols)).rejects.toThrow(pattern);
    };
    await check(
      { creation_key: 'short', creation_request_hash: HASH },
      /player_profiles_creation_key_check/,
    );
    await check(
      { creation_key: 'k'.repeat(32) },
      /player_profiles_creation_key_check/,
    ); // key without hash
    await check(
      { creation_request_hash: HASH },
      /player_profiles_creation_key_check/,
    ); // hash without key
    await check(
      { creation_key: 'k'.repeat(32), creation_request_hash: 'zz' },
      /player_profiles_creation_key_check/,
    );
    await check(
      { creation_key: 'k k'.repeat(12), creation_request_hash: HASH },
      /player_profiles_creation_key_check/,
    );
    await check(
      { starter_personality_id: 'Calm Person' },
      /player_profiles_starter_personality_check/,
    );
  });

  it('still enforces one cricketer per user in the database', async () => {
    const user = await createTestUser(repos());
    await insert(ctx().url, user.id, {});
    await expect(
      insert(ctx().url, user.id, { display_name: 'Second Player' }),
    ).rejects.toThrow(/player_profiles_user_id_uniq/);
  });
});
