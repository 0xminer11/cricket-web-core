import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { Argon2PasswordService } from '../../apps/api/src/modules/auth/index';
import { execRaw } from '../../packages/database/src/testing/harness';
import { describeDb } from '../support/db';
import {
  Browser,
  buildAuthApp,
  FAST_ARGON2,
  PASSWORD,
  uniqueEmail,
} from '../support/auth';

const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');

describeDb('login, sessions and account status', (ctx) => {
  const registered = async (
    app: Parameters<typeof Browser.prototype.register>[0] extends never
      ? never
      : ConstructorParameters<typeof Browser>[0],
  ) => {
    const email = uniqueEmail('login');
    const browser = new Browser(app);
    const response = await browser.register(email);
    return { email, browser, userId: response.json().data.user.id as string };
  };

  it('logs in with correct credentials and issues a fresh session', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { email, userId } = await registered(app);
      const other = new Browser(app);
      const response = await other.login(email.toUpperCase());
      expect(response.statusCode).toBe(200);
      expect(response.json().data.user).toMatchObject({
        id: userId,
        accountType: 'registered',
      });
      expect(other.cookie).toBeDefined();
      expect((await other.me()).json().data.user.id).toBe(userId);
      expect(response.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });

  it('answers wrong password and unknown email identically', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { email } = await registered(app);
      const browser = new Browser(app);
      const wrong = await browser.login(email, 'definitely wrong password');
      const unknown = await browser.login(uniqueEmail('ghost'));
      const malformed = await browser.post('/api/v1/auth/login', {
        email: 'nope',
        password: 'x',
      });
      for (const r of [wrong, unknown, malformed]) {
        expect(r.statusCode).toBe(401);
        expect(r.json().error.code).toBe('INVALID_CREDENTIALS');
        expect(r.json().error.message).toBe('Invalid email or password.');
      }
      expect(wrong.json().error.message).toBe(unknown.json().error.message);
      expect(browser.cookie).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('enforces account status at login and on existing sessions', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const repos = ctx().database.repositories();
      const { email, browser, userId } = await registered(app);
      await repos.users.changeStatus(userId, 'suspended');
      // existing session stops granting access at once
      const blocked = await browser.me();
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().error.code).toBe('ACCOUNT_SUSPENDED');
      // login: right password reveals suspension, wrong password does not
      const fresh = new Browser(app);
      const login = await fresh.login(email);
      expect(login.statusCode).toBe(403);
      expect(login.json().error.code).toBe('ACCOUNT_SUSPENDED');
      expect(
        (await fresh.login(email, 'wrong password!!')).json().error.code,
      ).toBe('INVALID_CREDENTIALS');
      // logout still works for a suspended user
      expect((await browser.logout()).statusCode).toBe(200);
      // reactivation restores a fresh login
      await repos.users.changeStatus(userId, 'active');
      expect((await fresh.login(email)).statusCode).toBe(200);
      // deleted accounts look like accounts that never existed
      const second = new Browser(app);
      await repos.users.changeStatus(userId, 'deleted');
      const gone = await second.login(email);
      expect(gone.statusCode).toBe(401);
      expect(gone.json().error.code).toBe('INVALID_CREDENTIALS');
      const stale = await fresh.me();
      expect(stale.statusCode).toBe(401);
      expect(stale.json().error.code).toBe('AUTH_REQUIRED');
      expect(String(stale.headers['set-cookie'])).toMatch(
        /cricketer_session=;/,
      );
    } finally {
      await app.close();
    }
  });

  it('rejects missing, malformed, tampered and unknown session cookies the same way', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser } = await registered(app);
      const real = browser.cookie as string;
      const none = new Browser(app);
      const results = [await none.me()];
      for (const bad of [
        'garbage',
        real.slice(0, -1) + (real.endsWith('A') ? 'B' : 'A'),
        'A'.repeat(43),
        `${real}x`,
        "'; DROP TABLE auth_sessions; --",
      ]) {
        const b = new Browser(app);
        b.cookie = bad;
        results.push(await b.me());
      }
      for (const r of results) {
        expect(r.statusCode).toBe(401);
        expect(r.json().error).toMatchObject({
          code: 'AUTH_REQUIRED',
          message: 'Authentication required.',
        });
      }
      expect((await browser.me()).statusCode).toBe(200);
      expect(
        await execRaw(ctx().url, 'SELECT 1 FROM auth_sessions'),
      ).not.toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('expires sessions by idle timeout and by absolute lifetime (no sleeping)', async () => {
    const { app, clock } = await buildAuthApp(ctx(), {
      AUTH_SESSION_TTL: '3600',
      AUTH_GUEST_SESSION_TTL: '1800',
      AUTH_SESSION_ABSOLUTE_TTL: '14400',
      AUTH_SESSION_TOUCH_INTERVAL: '60',
    });
    try {
      // guest: idle window 30 min
      const guest = new Browser(app);
      await guest.guest();
      clock.advanceSeconds(1700);
      expect((await guest.me()).statusCode).toBe(200); // within window; slides forward
      clock.advanceSeconds(1700);
      expect((await guest.me()).statusCode).toBe(200); // still alive thanks to sliding
      clock.advanceSeconds(1801);
      expect((await guest.me()).statusCode).toBe(401); // idle expiry

      // registered: slides until the absolute cap, then dies even though active
      const { browser } = await registered(app);
      for (let i = 0; i < 3; i += 1) {
        clock.advanceSeconds(3000);
        expect((await browser.me()).statusCode).toBe(200);
      }
      clock.advanceSeconds(3000); // 12000 + ... crosses absolute 14400 with the next step
      expect((await browser.me()).statusCode).toBe(200);
      clock.advanceSeconds(3000);
      expect((await browser.me()).statusCode).toBe(401);
      const [row] = await execRaw(
        ctx().url,
        'SELECT expires_at, absolute_expires_at FROM auth_sessions WHERE expires_at > absolute_expires_at',
      );
      expect(row).toBeUndefined(); // sliding never pushes past the absolute cap
    } finally {
      await app.close();
    }
  });

  it('throttles last_seen writes and re-sends the cookie only when the session slides', async () => {
    const { app, clock } = await buildAuthApp(ctx(), {
      AUTH_SESSION_TOUCH_INTERVAL: '300',
    });
    try {
      const browser = new Browser(app);
      await browser.guest();
      const token = browser.cookie as string;
      const seen = async () =>
        new Date(
          (
            await execRaw(
              ctx().url,
              'SELECT last_seen_at FROM auth_sessions WHERE token_hash = $1',
              [digest(token)],
            )
          )[0]?.last_seen_at as string,
        ).getTime();
      const first = await seen();
      clock.advanceSeconds(120);
      const quiet = await browser.me();
      expect(quiet.headers['set-cookie']).toBeUndefined();
      expect(await seen()).toBe(first);
      clock.advanceSeconds(200);
      const slid = await browser.me();
      expect(String(slid.headers['set-cookie'])).toMatch(/Max-Age=/);
      expect(await seen()).toBeGreaterThan(first);
    } finally {
      await app.close();
    }
  });

  it('logout revokes the server session, clears the cookie and is idempotent', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { browser } = await registered(app);
      const token = browser.cookie as string;
      const out = await browser.logout();
      expect(out.statusCode).toBe(200);
      expect(String(out.headers['set-cookie'])).toMatch(/cricketer_session=;/);
      expect(String(out.headers['set-cookie'])).toMatch(/Path=\//);
      // the old token is dead on the server, not just forgotten by the browser
      const replay = new Browser(app);
      replay.cookie = token;
      expect((await replay.me()).statusCode).toBe(401);
      // twice, and with no cookie at all
      expect((await replay.logout()).statusCode).toBe(200);
      expect((await new Browser(app).logout()).statusCode).toBe(200);
      const [row] = await execRaw(
        ctx().url,
        'SELECT revoked_reason FROM auth_sessions WHERE token_hash = $1',
        [digest(token)],
      );
      expect(row?.revoked_reason).toBe('logout');
    } finally {
      await app.close();
    }
  });

  it('logout-all revokes every device for registered accounts and refuses guests', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { email, browser } = await registered(app);
      const phone = new Browser(app);
      const laptop = new Browser(app);
      await phone.login(email);
      await laptop.login(email);
      const response = await browser.post('/api/v1/auth/logout-all');
      expect(response.statusCode).toBe(200);
      expect(response.json().data.revokedSessions).toBe(3);
      for (const b of [browser, phone, laptop])
        expect((await b.me()).statusCode).toBe(401);
      const guest = new Browser(app);
      await guest.guest();
      const refused = await guest.post('/api/v1/auth/logout-all');
      expect(refused.statusCode).toBe(403);
      expect(refused.json().error.code).toBe('REGISTERED_ACCOUNT_REQUIRED');
      expect(
        (await new Browser(app).post('/api/v1/auth/logout-all')).statusCode,
      ).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('rotates the session on login and revokes the pre-login session', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { email } = await registered(app);
      const browser = new Browser(app);
      await browser.guest();
      const before = browser.cookie as string;
      expect((await browser.login(email)).statusCode).toBe(200);
      expect(browser.cookie).not.toBe(before);
      const replay = new Browser(app);
      replay.cookie = before;
      expect((await replay.me()).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('lists active sessions without exposing tokens', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const { email, browser } = await registered(app);
      const other = new Browser(app);
      await other.login(email);
      const list = await browser.get('/api/v1/auth/sessions');
      expect(list.statusCode).toBe(200);
      const sessions = list.json().data.sessions;
      expect(sessions).toHaveLength(2);
      expect(
        sessions.filter((s: { current: boolean }) => s.current),
      ).toHaveLength(1);
      expect(list.body).not.toContain(browser.cookie as string);
      expect(list.body).not.toMatch(/token|hash/i);
    } finally {
      await app.close();
    }
  });

  it('ignores any client-supplied identity on /me', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const a = await registered(app);
      const b = await registered(app);
      const response = await a.browser.get(`/api/v1/me?userId=${b.userId}`, {
        'x-user-id': b.userId,
      });
      expect(response.json().data.user.id).toBe(a.userId);
    } finally {
      await app.close();
    }
  });

  it('upgrades password hashes created with weaker parameters at the next login', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const weak = new Argon2PasswordService({
        memoryKib: 512,
        passes: 1,
        parallelism: 1,
        concurrency: 1,
      });
      const repos = ctx().database.repositories();
      const email = uniqueEmail('rehash');
      const { user } = await repos.auth.createRegisteredUser({
        email,
        emailNormalized: email,
        passwordHash: await weak.hash(PASSWORD),
      });
      const read = async () =>
        String(
          (
            await execRaw(
              ctx().url,
              'SELECT password_hash FROM auth_identities WHERE user_id = $1',
              [user.id],
            )
          )[0]?.password_hash,
        );
      expect(await read()).toContain('m=512,');
      const browser = new Browser(app);
      expect((await browser.login(email)).statusCode).toBe(200);
      expect(await read()).toContain(
        `m=${FAST_ARGON2.AUTH_ARGON2_MEMORY_KIB},`,
      );
      expect((await new Browser(app).login(email)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
