import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  CheckViolationError,
  IntegrityError,
  InvalidStateTransitionError,
  UniqueViolationError,
} from '../../packages/database/src/index';
import {
  createTestPlayer,
  createTestUser,
} from '../../packages/database/src/testing/factories';
import { execRaw } from '../../packages/database/src/testing/harness';
import { describeDb } from '../support/db';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const HASH =
  '$argon2id$v=19$m=1024,t=1,p=1$c29tZXNhbHRzb21lc2FsdA$' + 'A'.repeat(43);
let n = 0;
const email = () => `db${Date.now().toString(36)}${(n += 1)}@example.com`;

describeDb('auth persistence', (ctx) => {
  const repos = () => ctx().database.repositories();
  const credentials = (address = email()) => ({
    email: address,
    emailNormalized: address.toLowerCase(),
    passwordHash: HASH,
  });
  const session = async (userId: string, token = `t${(n += 1)}`) => {
    const now = new Date();
    return repos().sessions.create({
      userId,
      tokenHash: sha(token),
      now,
      expiresAt: new Date(now.getTime() + 60_000),
      absoluteExpiresAt: new Date(now.getTime() + 120_000),
    });
  };

  it('defaults existing-style users to guest accounts', async () => {
    const user = await createTestUser(repos());
    expect(user).toMatchObject({ accountType: 'guest', registeredAt: null });
  });

  it('upgrades a guest in place and preserves the id and every game foreign key', async () => {
    const guest = await repos().auth.createGuestUser('test');
    const { profile } = await createTestPlayer(repos(), { userId: guest.id });
    const { user, identity } = await repos().auth.upgradeGuest(
      guest.id,
      credentials(),
    );
    expect(user.id).toBe(guest.id);
    expect(user.accountType).toBe('registered');
    expect(identity.userId).toBe(guest.id);
    expect(identity).not.toHaveProperty('passwordHash');
    expect((await repos().players.findByUserId(guest.id))?.id).toBe(profile.id);
    // the row can never go back to guest, and a registered user cannot be upgraded again
    await expect(
      execRaw(
        ctx().url,
        "UPDATE users SET account_type = 'guest' WHERE id = $1",
        [guest.id],
      ),
    ).rejects.toThrow(/cannot become a guest/);
    await expect(
      repos().auth.upgradeGuest(guest.id, credentials()),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('rolls the whole upgrade back when the email is taken', async () => {
    const taken = credentials();
    await repos().auth.createRegisteredUser(taken);
    const guest = await repos().auth.createGuestUser('test');
    await expect(
      repos().auth.upgradeGuest(guest.id, {
        ...credentials(),
        email: taken.email.toUpperCase(),
        emailNormalized: taken.emailNormalized,
      }),
    ).rejects.toBeInstanceOf(UniqueViolationError);
    expect((await repos().users.findById(guest.id))?.accountType).toBe('guest');
    expect(
      await execRaw(
        ctx().url,
        'SELECT 1 FROM auth_identities WHERE user_id = $1',
        [guest.id],
      ),
    ).toHaveLength(0);
  });

  it('createRegisteredUser leaves no orphan user when the identity insert fails', async () => {
    const dup = credentials();
    await repos().auth.createRegisteredUser(dup);
    const before = (
      await execRaw(ctx().url, 'SELECT count(*)::int AS n FROM users')
    )[0]?.n;
    await expect(repos().auth.createRegisteredUser(dup)).rejects.toBeInstanceOf(
      UniqueViolationError,
    );
    expect(
      (await execRaw(ctx().url, 'SELECT count(*)::int AS n FROM users'))[0]?.n,
    ).toBe(before);
  });

  it('rejects malformed identities at the database', async () => {
    const user = await createTestUser(repos());
    const insert = (cols: string, vals: unknown[]) =>
      execRaw(
        ctx().url,
        `INSERT INTO auth_identities (user_id, ${cols}) VALUES ($1, ${vals.map((_, i) => `$${i + 2}`).join(',')})`,
        [user.id, ...vals],
      );
    // email_password needs hash, normalized email, and subject == normalized email
    await expect(
      insert('provider, provider_subject, email, email_normalized', [
        'email_password',
        'a@x.com',
        'a@x.com',
        'a@x.com',
      ]),
    ).rejects.toThrow(/auth_identities_email_password_check/);
    await expect(
      insert(
        'provider, provider_subject, email, email_normalized, password_hash',
        ['email_password', 'other', 'a@x.com', 'a@x.com', HASH],
      ),
    ).rejects.toThrow(/auth_identities_email_password_check/);
    // external providers never carry passwords; unknown providers do not exist
    await expect(
      insert('provider, provider_subject, password_hash', [
        'google',
        'sub-1',
        HASH,
      ]),
    ).rejects.toThrow(/auth_identities_password_provider_check/);
    await expect(
      insert('provider, provider_subject', ['guest', 'x']),
    ).rejects.toThrow(/auth_identities_provider_check/);
    // future providers share (provider, subject) uniqueness, and one identity per provider per user
    await insert('provider, provider_subject', ['google', 'google-sub-1']);
    await expect(
      insert('provider, provider_subject', ['google', 'google-sub-1']),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      insert('provider, provider_subject', ['google', 'google-sub-2']),
    ).rejects.toThrow(/duplicate key/);
    const other = await createTestUser(repos());
    await expect(
      execRaw(
        ctx().url,
        "INSERT INTO auth_identities (user_id, provider, provider_subject) VALUES ($1, 'google', 'google-sub-1')",
        [other.id],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('never lets an identity move to another user', async () => {
    const a = await repos().auth.createRegisteredUser(credentials());
    const b = await createTestUser(repos());
    await expect(
      execRaw(
        ctx().url,
        'UPDATE auth_identities SET user_id = $1 WHERE id = $2',
        [b.id, a.identity.id],
      ),
    ).rejects.toThrow(/cannot be reassigned/);
  });

  it('enforces session integrity and stores only digests', async () => {
    const user = await createTestUser(repos());
    const s = await session(user.id, 'secret-token');
    expect(s.userId).toBe(user.id);
    await expect(
      execRaw(
        ctx().url,
        "INSERT INTO auth_sessions (user_id, token_hash, expires_at, absolute_expires_at) VALUES ($1, 'secret-token', now(), now())",
        [user.id],
      ),
    ).rejects.toThrow(/auth_sessions_token_hash_check/);
    await expect(
      execRaw(
        ctx().url,
        "INSERT INTO auth_sessions (user_id, token_hash, expires_at, absolute_expires_at) VALUES ($1, $2, now() + interval '2 day', now() + interval '1 day')",
        [user.id, sha('x1')],
      ),
    ).rejects.toThrow(/auth_sessions_expiry_check/);
    await expect(
      execRaw(
        ctx().url,
        'UPDATE auth_sessions SET revoked_at = now() WHERE id = $1',
        [s.id],
      ),
    ).rejects.toThrow(/auth_sessions_revoked_check/);
    await expect(session(user.id, 'secret-token')).rejects.toBeInstanceOf(
      UniqueViolationError,
    );
  });

  it('touches sessions at most once per interval, revokes idempotently and sweeps expired rows', async () => {
    const user = await createTestUser(repos());
    const s = await session(user.id);
    const now = new Date();
    const later = new Date(now.getTime() + 600_000);
    const stale = new Date(now.getTime() + 300_000);
    const first = await repos().sessions.touch({
      id: s.id,
      now: later,
      expiresAt: new Date(now.getTime() + 100_000),
      staleBefore: stale,
    });
    expect(first?.lastSeenAt.getTime()).toBe(later.getTime());
    // a concurrent/second touch inside the interval is a no-op
    expect(
      await repos().sessions.touch({
        id: s.id,
        now: later,
        expiresAt: later,
        staleBefore: stale,
      }),
    ).toBeNull();
    expect(await repos().sessions.revoke(s.id, 'logout', now)).toBe(true);
    expect(await repos().sessions.revoke(s.id, 'logout', now)).toBe(false);
    expect(
      await repos().sessions.touch({
        id: s.id,
        now: later,
        expiresAt: later,
        staleBefore: new Date(later.getTime() + 1),
      }),
    ).toBeNull();
    const keep = await session(user.id);
    const extra = await session(user.id);
    expect(
      await repos().sessions.revokeAllForUser(user.id, 'logout_all', now, {
        exceptSessionId: keep.id,
      }),
    ).toBe(1);
    expect(
      (await repos().sessions.listActiveForUser(user.id, now)).map((x) => x.id),
    ).toEqual([keep.id]);
    expect(await repos().sessions.revoke(extra.id, 'logout', now)).toBe(false); // already revoked above
    const removed = await repos().sessions.deleteExpired(
      new Date(now.getTime() + 3_600_000),
    );
    expect(removed).toBeGreaterThanOrEqual(3);
    expect(await repos().sessions.findByTokenHash(sha('nothing'))).toBeNull();
  });

  it('spends a token exactly once even under concurrent attempts', async () => {
    const user = await createTestUser(repos());
    const now = new Date();
    const token = await repos().authTokens.issue({
      userId: user.id,
      purpose: 'password_reset',
      tokenHash: sha('reset-me'),
      now,
      expiresAt: new Date(now.getTime() + 60_000),
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        repos().authTokens.consume(token.id, now),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const expired = await repos().authTokens.issue({
      userId: user.id,
      purpose: 'password_reset',
      tokenHash: sha('too-late'),
      now,
      expiresAt: new Date(now.getTime() + 1000),
    });
    expect(
      await repos().authTokens.consume(
        expired.id,
        new Date(now.getTime() + 2000),
      ),
    ).toBe(false);
  });

  it('retires earlier tokens when a new one is issued and scopes lookups by purpose', async () => {
    const user = await createTestUser(repos());
    const now = new Date();
    const issue = (
      purpose: 'password_reset' | 'email_verification',
      raw: string,
    ) =>
      repos().authTokens.issue({
        userId: user.id,
        purpose,
        tokenHash: sha(raw),
        now,
        expiresAt: new Date(now.getTime() + 60_000),
      });
    const first = await issue('password_reset', 'r1');
    const second = await issue('password_reset', 'r2');
    const verify = await issue('email_verification', 'v1');
    expect(
      (await repos().authTokens.findByTokenHash(sha('r1'), 'password_reset'))
        ?.consumedAt,
    ).not.toBeNull();
    expect(
      (await repos().authTokens.findByTokenHash(sha('r2'), 'password_reset'))
        ?.consumedAt,
    ).toBeNull();
    expect(
      await repos().authTokens.findByTokenHash(sha('r2'), 'email_verification'),
    ).toBeNull();
    expect(
      await repos().authTokens.findByTokenHash(sha('v1'), 'password_reset'),
    ).toBeNull();
    expect(first.id).not.toBe(second.id);
    expect(
      await repos().authTokens.invalidateAllForUser(
        user.id,
        'password_reset',
        now,
      ),
    ).toBe(1);
    expect(
      (
        await repos().authTokens.findByTokenHash(
          sha('v1'),
          'email_verification',
        )
      )?.consumedAt,
    ).toBeNull();
    expect(verify.purpose).toBe('email_verification');
    await expect(
      execRaw(
        ctx().url,
        "INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, 'magic_link', $2, now())",
        [user.id, sha('z')],
      ),
    ).rejects.toThrow(/auth_tokens_purpose_check/);
  });

  it('cascades credentials, sessions and tokens when a bare user is hard-deleted', async () => {
    const { user } = await repos().auth.createRegisteredUser(credentials());
    await session(user.id);
    await repos().authTokens.issue({
      userId: user.id,
      purpose: 'email_verification',
      tokenHash: sha(`c${n}`),
      now: new Date(),
      expiresAt: new Date(Date.now() + 1000),
    });
    await execRaw(ctx().url, 'DELETE FROM users WHERE id = $1', [user.id]);
    for (const table of ['auth_identities', 'auth_sessions', 'auth_tokens'])
      expect(
        await execRaw(ctx().url, `SELECT 1 FROM ${table} WHERE user_id = $1`, [
          user.id,
        ]),
      ).toHaveLength(0);
  });

  it('accepts user-actor audit entries and keeps the other users CHECKs', async () => {
    const user = await createTestUser(repos());
    const entry = await repos().audit.record({
      actorType: 'user',
      actorId: user.id,
      action: 'auth.login_success',
      targetType: 'user',
      targetId: user.id,
    });
    expect(entry.actorType).toBe('user');
    await expect(
      execRaw(
        ctx().url,
        "UPDATE users SET account_type = 'admin' WHERE id = $1",
        [user.id],
      ),
    ).rejects.toThrow(/users_account_type_check/);
    await expect(
      execRaw(
        ctx().url,
        "UPDATE users SET account_type = 'registered' WHERE id = $1",
        [user.id],
      ),
    ).rejects.toThrow(/users_registered_at_check/);
    expect(CheckViolationError).toBeDefined();
    expect(IntegrityError).toBeDefined();
  });
});
