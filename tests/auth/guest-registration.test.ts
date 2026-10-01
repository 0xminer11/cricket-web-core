import { expect, it } from 'vitest';
import {
  createTestCareer,
  createTestInventoryItem,
  createTestPlayer,
} from '../../packages/database/src/testing/factories';
import { execRaw } from '../../packages/database/src/testing/harness';
import { describeDb } from '../support/db';
import { Browser, buildAuthApp, PASSWORD, uniqueEmail } from '../support/auth';

describeDb('guest accounts, registration and guest upgrade', (ctx) => {
  it('creates a guest with a secure server-generated session and serves /me', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const browser = new Browser(app);
      const created = await browser.guest();
      expect(created.statusCode).toBe(201);
      const body = created.json();
      expect(body).toMatchObject({
        success: true,
        data: { user: { accountType: 'guest' } },
      });
      expect(body.data.user.id).toMatch(/^[0-9a-f-]{36}$/);

      // Cookie attributes: HttpOnly + SameSite + Path + Max-Age; the token is high entropy.
      const raw = String(created.headers['set-cookie']);
      expect(raw).toMatch(/HttpOnly/i);
      expect(raw).toMatch(/SameSite=Lax/i);
      expect(raw).toMatch(/Path=\//i);
      expect(raw).toMatch(/Max-Age=\d+/i);
      expect(browser.cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const me = await browser.me();
      expect(me.statusCode).toBe(200);
      expect(me.json().data.user).toEqual({
        id: body.data.user.id,
        accountType: 'guest',
        email: null,
        emailVerified: false,
        hasCricketer: false,
      });
      expect(me.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });

  it('does not create another guest when a valid session already exists', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const browser = new Browser(app);
      const first = (await browser.guest()).json().data.user.id;
      const before = (
        await execRaw(ctx().url, 'SELECT count(*)::int AS n FROM users')
      )[0]?.n;
      const again = await browser.guest();
      expect(again.statusCode).toBe(200);
      expect(again.json().data.user.id).toBe(first);
      expect(
        (await execRaw(ctx().url, 'SELECT count(*)::int AS n FROM users'))[0]
          ?.n,
      ).toBe(before);
    } finally {
      await app.close();
    }
  });

  it('stores only a hash of the session token and never exposes secrets', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const browser = new Browser(app);
      await browser.guest();
      const token = browser.cookie as string;
      const rows = await execRaw(
        ctx().url,
        'SELECT token_hash FROM auth_sessions',
      );
      expect(rows.some((r) => r.token_hash === token)).toBe(false);
      expect(
        rows.every((r) => /^[0-9a-f]{64}$/.test(String(r.token_hash))),
      ).toBe(true);
      const me = (await browser.me()).body;
      expect(me).not.toMatch(/password|token|hash|secret/i);
    } finally {
      await app.close();
    }
  });

  it('registers directly with email and password, hashing the password with Argon2id', async () => {
    const { app, mail } = await buildAuthApp(ctx());
    try {
      const browser = new Browser(app);
      const email = uniqueEmail('Direct');
      const response = await browser.register(` ${email.toUpperCase()} `);
      expect(response.statusCode).toBe(201);
      expect(response.json().data.user).toMatchObject({
        accountType: 'registered',
        email: email.toUpperCase(),
        emailVerified: false,
      });
      const [identity] = await execRaw(
        ctx().url,
        'SELECT email, email_normalized, password_hash, provider_subject FROM auth_identities WHERE email_normalized = $1',
        [email.toLowerCase()],
      );
      expect(identity?.email).toBe(email.toUpperCase());
      expect(identity?.provider_subject).toBe(email.toLowerCase());
      expect(String(identity?.password_hash)).toMatch(
        /^\$argon2id\$v=19\$m=1024,t=1,p=1\$/,
      );
      expect(String(identity?.password_hash)).not.toContain(PASSWORD);
      await app.auth.service.drainDeliveries();
      const mailed = mail.last('verification', email.toUpperCase());
      expect(mailed?.url).toMatch(/\/verify-email#token=[A-Za-z0-9_-]{43}$/);
    } finally {
      await app.close();
    }
  });

  it('rejects invalid email, short/oversized passwords, unknown fields and role escalation', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const browser = new Browser(app);
      const bad = async (body: unknown) =>
        browser.post('/api/v1/auth/register', body);
      expect(
        (await bad({ email: 'not-an-email', password: PASSWORD })).json().error
          .code,
      ).toBe('INVALID_EMAIL');
      expect(
        (await bad({ email: uniqueEmail(), password: 'short' })).json().error
          .code,
      ).toBe('WEAK_PASSWORD');
      expect(
        (await bad({ email: uniqueEmail(), password: 'x'.repeat(129) })).json()
          .error.code,
      ).toBe('WEAK_PASSWORD');
      const role = await bad({
        email: uniqueEmail(),
        password: PASSWORD,
        role: 'admin',
      });
      expect(role.statusCode).toBe(400);
      expect(role.json().error.code).toBe('VALIDATION_ERROR');
      const userId = await bad({
        email: uniqueEmail(),
        password: PASSWORD,
        userId: 'abc',
        accountType: 'registered',
      });
      expect(userId.statusCode).toBe(400);
      // Spaces and long passphrases are valid; there are no composition rules.
      const ok = await bad({
        email: uniqueEmail(),
        password: 'a long  passphrase with spaces ',
      });
      expect(ok.statusCode).toBe(201);
      const huge = await browser.post('/api/v1/auth/register', {
        email: uniqueEmail(),
        password: 'x'.repeat(10_000),
      });
      expect(huge.statusCode).toBe(413 as number);
      expect(huge.body).not.toMatch(/stack|node_modules/);
    } finally {
      await app.close();
    }
  });

  it('rejects duplicate emails (case-insensitive) and repeat registration of a registered account', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const email = uniqueEmail('dup');
      const first = new Browser(app);
      expect((await first.register(email)).statusCode).toBe(201);
      const second = new Browser(app);
      const dup = await second.register(email.toUpperCase());
      expect(dup.statusCode).toBe(409);
      expect(dup.json().error.code).toBe('EMAIL_ALREADY_IN_USE');
      // The registered caller registering again
      const again = await first.register(uniqueEmail('other'));
      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe('ALREADY_REGISTERED');
    } finally {
      await app.close();
    }
  });

  it('upgrades a guest in place: same user id, same career/wallet/inventory, rotated session', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const repos = ctx().database.repositories();
      const browser = new Browser(app);
      // 1-4: guest, cookie, /me, identity
      const guestUser = (await browser.guest()).json().data.user;
      const guestToken = browser.cookie as string;
      expect((await browser.me()).json().data.user.id).toBe(guestUser.id);
      // 5: seed game progress on the guest's user id
      const { profile } = await createTestPlayer(repos, {
        userId: guestUser.id,
        coins: 750,
      });
      const career = await createTestCareer(repos, profile.id);
      const item = await createTestInventoryItem(repos, profile.id);
      expect(profile.id).not.toBe(guestUser.id); // account id != player id
      expect((await browser.me()).json().data.user.hasCricketer).toBe(true);

      // 6-8: upgrade, session rotates, same id
      const email = uniqueEmail('upgrade');
      const upgraded = await browser.register(email);
      expect(upgraded.statusCode).toBe(201);
      expect(upgraded.json().data.user).toMatchObject({
        id: guestUser.id,
        accountType: 'registered',
        hasCricketer: true,
      });
      expect(browser.cookie).not.toBe(guestToken);
      // old guest token no longer works (session fixation defence)
      const stale = new Browser(app);
      stale.cookie = guestToken;
      expect((await stale.me()).statusCode).toBe(401);

      // 9: game progress untouched
      const players = await execRaw(
        ctx().url,
        'SELECT id, user_id FROM player_profiles WHERE user_id = $1',
        [guestUser.id],
      );
      expect(players).toHaveLength(1);
      expect(players[0]?.id).toBe(profile.id);
      expect(
        await repos.careers.getCareer(profile.id, career.id),
      ).toMatchObject({
        id: career.id,
      });
      expect(
        (await repos.wallet.getBalances(profile.id)).find(
          (b) => b.currencyType === 'coins',
        )?.balance,
      ).toBe(750);
      expect((await repos.inventory.getItem(profile.id, item.id)).id).toBe(
        item.id,
      );
      const [user] = await execRaw(
        ctx().url,
        'SELECT account_type, registered_at FROM users WHERE id = $1',
        [guestUser.id],
      );
      expect(user?.account_type).toBe('registered');
      expect(user?.registered_at).not.toBeNull();

      // 10-12: logout, login, same account and progress
      expect((await browser.logout()).statusCode).toBe(200);
      expect((await browser.me()).statusCode).toBe(401);
      const login = await browser.login(email);
      expect(login.statusCode).toBe(200);
      expect(login.json().data.user).toMatchObject({
        id: guestUser.id,
        hasCricketer: true,
        accountType: 'registered',
      });
      expect((await browser.me()).json().data.user.id).toBe(guestUser.id);
    } finally {
      await app.close();
    }
  });

  it('keeps the guest intact when an upgrade fails (duplicate email)', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const taken = uniqueEmail('taken');
      expect((await new Browser(app).register(taken)).statusCode).toBe(201);
      const browser = new Browser(app);
      const guest = (await browser.guest()).json().data.user;
      const before = browser.cookie;
      const failed = await browser.register(taken);
      expect(failed.statusCode).toBe(409);
      expect(browser.cookie).toBe(before);
      const me = await browser.me();
      expect(me.json().data.user).toMatchObject({
        id: guest.id,
        accountType: 'guest',
      });
      expect(
        await execRaw(
          ctx().url,
          'SELECT 1 FROM auth_identities WHERE user_id = $1',
          [guest.id],
        ),
      ).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('lets exactly one of two concurrent guest upgrades win', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const browser = new Browser(app);
      const guest = (await browser.guest()).json().data.user;
      const a = new Browser(app);
      const b = new Browser(app);
      a.cookie = b.cookie = browser.cookie;
      const [ra, rb] = await Promise.all([
        a.register(uniqueEmail('race-a')),
        b.register(uniqueEmail('race-b')),
      ]);
      const codes = [ra.statusCode, rb.statusCode].sort();
      expect(codes[0]).toBe(201);
      expect([401, 409]).toContain(codes[1]);
      const identities = await execRaw(
        ctx().url,
        'SELECT id FROM auth_identities WHERE user_id = $1',
        [guest.id],
      );
      expect(identities).toHaveLength(1);
      const [user] = await execRaw(
        ctx().url,
        'SELECT account_type FROM users WHERE id = $1',
        [guest.id],
      );
      expect(user?.account_type).toBe('registered');
    } finally {
      await app.close();
    }
  });

  it('lets exactly one of many concurrent registrations of the same email win', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const email = uniqueEmail('same');
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          new Browser(app).register(i % 2 ? email.toUpperCase() : email),
        ),
      );
      type Res = { statusCode: number; json(): { error: { code: string } } };
      const statuses = (results as Res[]).map((r) => r.statusCode);
      expect(statuses.filter((s: number) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s: number) => s === 409)).toHaveLength(5);
      for (const r of (results as Res[]).filter((x) => x.statusCode === 409))
        expect(r.json().error.code).toBe('EMAIL_ALREADY_IN_USE');
      expect(
        await execRaw(
          ctx().url,
          'SELECT 1 FROM auth_identities WHERE email_normalized = $1',
          [email.toLowerCase()],
        ),
      ).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});
