import { expect, it } from 'vitest';
import { createTestPlayer } from '../../packages/database/src/testing/factories';
import { execRaw } from '../../packages/database/src/testing/harness';
import { describeDb } from '../support/db';
import {
  Browser,
  buildAuthApp,
  ORIGIN,
  PASSWORD,
  uniqueEmail,
} from '../support/auth';

describeDb('CSRF, CORS and response hygiene', (ctx) => {
  it('rejects state-changing requests without a trusted Origin and accepts trusted ones', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const evil = new Browser(
        app,
        'cricketer_session',
        'https://evil.example',
      );
      const none = new Browser(app, 'cricketer_session', null);
      const opaque = new Browser(app, 'cricketer_session', 'null');
      for (const b of [evil, none, opaque]) {
        const r = await b.guest();
        expect(r.statusCode).toBe(403);
        expect(r.json().error.code).toBe('CSRF_ORIGIN_INVALID');
        expect(r.headers['set-cookie']).toBeUndefined();
      }
      // no account was created by the rejected attempts
      expect(await execRaw(ctx().url, 'SELECT 1 FROM users')).toHaveLength(0);
      // Referer is an accepted fallback when Origin is absent
      const referer = await none.post(
        '/api/v1/auth/guest',
        {},
        { referer: `${ORIGIN}/login` },
      );
      expect(referer.statusCode).toBe(201);
      const badReferer = new Browser(app, 'cricketer_session', null);
      expect(
        (
          await badReferer.post(
            '/api/v1/auth/guest',
            {},
            { referer: 'https://evil.example/x' },
          )
        ).statusCode,
      ).toBe(403);
      expect((await new Browser(app).guest()).statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  it('blocks cross-site login/logout/upgrade/password changes even with a valid session cookie', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const victim = new Browser(app);
      await victim.register(uniqueEmail('victim'));
      const attacker = new Browser(
        app,
        'cricketer_session',
        'https://evil.example',
      );
      attacker.cookie = victim.cookie; // browsers attach the cookie on a forged request
      for (const [path, body] of [
        ['/api/v1/auth/logout', {}],
        ['/api/v1/auth/logout-all', {}],
        [
          '/api/v1/auth/password/change',
          { currentPassword: PASSWORD, newPassword: 'attacker chosen pass' },
        ],
        ['/api/v1/auth/login', { email: 'x@example.com', password: PASSWORD }],
      ] as const) {
        const r = await attacker.post(path, body);
        expect(r.statusCode, path).toBe(403);
      }
      expect((await victim.me()).statusCode).toBe(200); // session survived the forgeries
      // read-only requests are not subject to the check
      expect((await attacker.me()).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('allows credentialed CORS only for the exact trusted origin, never a wildcard', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const preflight = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/auth/login',
        headers: {
          origin: ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });
      expect(preflight.headers['access-control-allow-origin']).toBe(ORIGIN);
      expect(preflight.headers['access-control-allow-credentials']).toBe(
        'true',
      );
      const evil = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/auth/login',
        headers: {
          origin: 'https://evil.example',
          'access-control-request-method': 'POST',
        },
      });
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
      // a CORS-allowed but non-trusted origin (the admin app) gets no credentials on /api/
      const admin = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { origin: 'http://localhost:3301' },
      });
      expect(admin.headers['access-control-allow-origin']).toBeUndefined();
      expect(admin.headers['access-control-allow-credentials']).toBeUndefined();
      // non-auth routes keep credential-less CORS
      const health = await app.inject({
        url: '/health',
        headers: { origin: ORIGIN },
      });
      expect(
        health.headers['access-control-allow-credentials'],
      ).toBeUndefined();
      for (const r of [preflight, evil, admin, health])
        expect(r.headers['access-control-allow-origin']).not.toBe('*');
    } finally {
      await app.close();
    }
  });

  it('marks auth responses uncacheable and never leaks hashes, tokens or stack traces', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const browser = new Browser(app);
      const email = uniqueEmail('hygiene');
      const responses = [
        await browser.register(email),
        await browser.me(),
        await browser.get('/api/v1/auth/sessions'),
        await browser.logout(),
        await browser.login(email),
        await browser.login(email, 'wrong wrong wrong'),
        await browser.me(),
      ];
      for (const r of responses) {
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.body).not.toMatch(
          /argon2|password_hash|token_hash|passwordHash|tokenHash|stack|node_modules|SELECT |sql/i,
        );
      }
      const token = browser.cookie as string;
      expect(responses.map((r) => r.body).join()).not.toContain(token);
    } finally {
      await app.close();
    }
  });

  it('survives SQL-injection style input and oversized payloads', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const browser = new Browser(app);
      const real = uniqueEmail('inject');
      await browser.register(real);
      const attempts = [
        { email: `${real}' OR '1'='1`, password: PASSWORD },
        { email: "x'; DROP TABLE users; --@example.com", password: PASSWORD },
        { email: real, password: "' OR '1'='1" },
      ];
      for (const body of attempts) {
        const r = await new Browser(app).post('/api/v1/auth/login', body);
        expect(r.statusCode).toBe(401);
      }
      // quotes inside a legitimate password are just characters
      const quoted = new Browser(app);
      expect(
        (await quoted.register(uniqueEmail('quote'), `it's "fine" ; -- ok`))
          .statusCode,
      ).toBe(201);
      expect(
        (
          await quoted.login(
            quoted
              ? ((
                  await execRaw(
                    ctx().url,
                    'SELECT email FROM auth_identities ORDER BY created_at DESC LIMIT 1',
                  )
                )[0]?.email as string)
              : '',
            `it's "fine" ; -- ok`,
          )
        ).statusCode,
      ).toBe(200);
      expect(
        (await execRaw(ctx().url, 'SELECT count(*)::int AS n FROM users'))[0]
          ?.n,
      ).toBeGreaterThan(1);
      const big = await new Browser(app).post('/api/v1/auth/login', {
        email: real,
        password: 'x'.repeat(50_000),
      });
      expect(big.statusCode).toBe(413 as number);
      expect(big.json().success).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('clients cannot choose their role, account type or user id', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      for (const extra of [
        { role: 'admin' },
        { accountType: 'registered' },
        { userId: '00000000-0000-4000-8000-000000000000' },
        { isAdmin: true },
      ]) {
        const r = await new Browser(app).post('/api/v1/auth/register', {
          email: uniqueEmail(),
          password: PASSWORD,
          ...extra,
        });
        expect(r.statusCode).toBe(400);
      }
      const guest = new Browser(app);
      const g = await guest.post('/api/v1/auth/guest', { role: 'admin' });
      expect(g.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describeDb('authentication rate limiting', (ctx) => {
  it('limits guest creation per IP and recovers after the window', async () => {
    const { app, clock } = await buildAuthApp(ctx(), {
      AUTH_RL_GUEST_MAX: '2',
      AUTH_RL_GUEST_WINDOW: '3600',
    });
    try {
      const a = new Browser(app);
      a.ip = '10.0.0.1';
      const codes = [];
      for (let i = 0; i < 4; i += 1) {
        a.cookie = undefined;
        codes.push((await a.guest()).statusCode);
      }
      expect(codes).toEqual([201, 201, 429, 429]);
      const limited = await a.guest();
      expect(limited.json().error.code).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      // another client is unaffected
      const b = new Browser(app);
      b.ip = '10.0.0.2';
      expect((await b.guest()).statusCode).toBe(201);
      clock.advanceSeconds(3601);
      a.cookie = undefined;
      expect((await a.guest()).statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  it('does not count a valid session as a new guest', async () => {
    const { app } = await buildAuthApp(ctx(), { AUTH_RL_GUEST_MAX: '1' });
    try {
      const a = new Browser(app);
      await a.guest();
      for (let i = 0; i < 3; i += 1)
        expect((await a.guest()).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('blocks repeated failed logins with escalating temporary blocks, then recovers', async () => {
    const { app, clock } = await buildAuthApp(ctx(), {
      AUTH_RL_LOGIN_FAILURE_MAX: '3',
      AUTH_RL_LOGIN_BLOCK_BASE: '60',
      AUTH_RL_LOGIN_BLOCK_MAX: '600',
    });
    try {
      const email = uniqueEmail('stuff');
      await new Browser(app).register(email);
      const attacker = new Browser(app);
      attacker.ip = '203.0.113.9';
      for (let i = 0; i < 3; i += 1)
        expect(
          (await attacker.login(email, 'wrong wrong wrong')).statusCode,
        ).toBe(401);
      // blocked: even the correct password is refused (no oracle), identical for unknown emails
      const blocked = await attacker.login(email, PASSWORD);
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error.code).toBe('RATE_LIMITED');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(60);
      // the legitimate user from another address is not locked out
      const owner = new Browser(app);
      owner.ip = '198.51.100.7';
      expect((await owner.login(email)).statusCode).toBe(200);
      // temporary: after the block, login works again
      clock.advanceSeconds(61);
      expect((await attacker.login(email)).statusCode).toBe(200);
      // repeat offences escalate (60s -> 120s)
      const second = new Browser(app);
      second.ip = '203.0.113.50';
      for (let i = 0; i < 3; i += 1)
        await second.login(email, 'wrong wrong wrong');
      clock.advanceSeconds(61);
      for (let i = 0; i < 3; i += 1)
        await second.login(email, 'wrong wrong wrong');
      const longer = await second.login(email, PASSWORD);
      expect(longer.statusCode).toBe(429);
      expect(Number(longer.headers['retry-after'])).toBeGreaterThan(60);
    } finally {
      await app.close();
    }
  });

  it('throttles per-IP login volume, registration, recovery requests and token guessing', async () => {
    const { app } = await buildAuthApp(ctx(), {
      AUTH_RL_LOGIN_IP_MAX: '3',
      AUTH_RL_REGISTER_MAX: '2',
      AUTH_RL_EMAIL_ACTION_IP_MAX: '2',
      AUTH_RL_TOKEN_ATTEMPT_MAX: '2',
    });
    try {
      const login = new Browser(app);
      login.ip = '192.0.2.1';
      const l = [];
      for (let i = 0; i < 5; i += 1)
        l.push((await login.login(uniqueEmail('x'))).statusCode);
      expect(l).toEqual([401, 401, 401, 429, 429]);
      const r = [];
      for (let i = 0; i < 3; i += 1) {
        const reg = new Browser(app);
        reg.ip = '192.0.2.2';
        r.push((await reg.register(uniqueEmail('r'))).statusCode);
      }
      expect(r).toEqual([201, 201, 429]);
      const rec = new Browser(app);
      rec.ip = '192.0.2.3';
      const f = [];
      for (let i = 0; i < 3; i += 1)
        f.push(
          (
            await rec.post('/api/v1/auth/password/forgot', {
              email: uniqueEmail('f'),
            })
          ).statusCode,
        );
      expect(f).toEqual([200, 200, 429]);
      const guess = new Browser(app);
      guess.ip = '192.0.2.4';
      const t = [];
      for (let i = 0; i < 3; i += 1)
        t.push(
          (
            await guess.post('/api/v1/auth/password/reset', {
              token: 'A'.repeat(43),
              newPassword: PASSWORD,
            })
          ).statusCode,
        );
      expect(t).toEqual([400, 400, 429]);
    } finally {
      await app.close();
    }
  });

  it('applies the same recovery throttle whether or not the account exists', async () => {
    const { app } = await buildAuthApp(ctx(), {
      AUTH_RL_EMAIL_ACTION_MAX: '2',
    });
    try {
      const real = uniqueEmail('real');
      await new Browser(app).register(real);
      for (const email of [real, uniqueEmail('ghost')]) {
        const codes = [];
        for (let i = 0; i < 3; i += 1) {
          const b = new Browser(app);
          b.ip = `192.0.2.${10 + i}`;
          codes.push(
            (await b.post('/api/v1/auth/password/forgot', { email }))
              .statusCode,
          );
        }
        expect(codes).toEqual([200, 200, 429]);
      }
    } finally {
      await app.close();
    }
  });
});

describeDb('ownership authorization', (ctx) => {
  it("never returns another user's player through the ownership helper", async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const repos = ctx().database.repositories();
      const a = await createTestPlayer(repos, { displayName: 'Player Alpha' });
      const b = await createTestPlayer(repos, { displayName: 'Player Bravo' });
      const guard = app.auth.ownership;
      // accounts and players are different things with different ids
      expect(a.user.id).not.toBe(a.profile.id);
      expect(b.user.id).not.toBe(b.profile.id);
      expect(
        (await guard.assertPlayerOwnership(a.user.id, a.profile.id))
          .displayName,
      ).toBe('Player Alpha');
      await expect(
        guard.assertPlayerOwnership(a.user.id, b.profile.id),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
      await expect(
        guard.assertPlayerOwnership(b.user.id, a.profile.id),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
      // passing a user id where a player id belongs does not work either
      await expect(
        guard.assertPlayerOwnership(a.user.id, a.user.id),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
      for (const junk of ['not-a-uuid', '', "' OR 1=1"])
        await expect(
          guard.assertPlayerOwnership(a.user.id, junk),
        ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
      // a missing player and someone else's player are indistinguishable
      const missing = await guard
        .assertPlayerOwnership(
          a.user.id,
          '00000000-0000-4000-8000-000000000001',
        )
        .catch((e) => e);
      const foreign = await guard
        .assertPlayerOwnership(a.user.id, b.profile.id)
        .catch((e) => e);
      expect(missing.message).toBe(foreign.message);
      expect(foreign.message).not.toContain('Bravo');
      // self-service resolves the player from the session user
      expect((await guard.requireOwnPlayer(b.user.id)).id).toBe(b.profile.id);
    } finally {
      await app.close();
    }
  });

  it('reports hasCricketer per account', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const repos = ctx().database.repositories();
      const browser = new Browser(app);
      const user = (await browser.guest()).json().data.user;
      expect((await browser.me()).json().data.user.hasCricketer).toBe(false);
      await createTestPlayer(repos, { userId: user.id });
      expect((await browser.me()).json().data.user.hasCricketer).toBe(true);
      const other = new Browser(app);
      await other.guest();
      expect((await other.me()).json().data.user.hasCricketer).toBe(false);
    } finally {
      await app.close();
    }
  });
});

describeDb('production configuration', (ctx) => {
  const prod = {
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://play.example.com',
    AUTH_TRUSTED_ORIGINS: 'https://play.example.com',
    AUTH_ARGON2_MEMORY_KIB: '19456',
    AUTH_ARGON2_PASSES: '2',
  };

  it('uses a Secure __Host- cookie and exposes no development mailbox', async () => {
    const { app } = await buildAuthApp(ctx(), prod);
    try {
      const browser = new Browser(
        app,
        '__Host-cricketer_session',
        'https://play.example.com',
      );
      const response = await browser.guest();
      expect(response.statusCode).toBe(201);
      const cookie = String(response.headers['set-cookie']);
      expect(cookie).toMatch(/^__Host-cricketer_session=/);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\//);
      expect(cookie).not.toMatch(/Domain=/i);
      expect(app.auth.email.constructor.name).toBe('DisabledEmailService');
      const mailbox = await app.inject({
        url: '/api/v1/dev/emails',
        remoteAddress: '127.0.0.1',
      });
      expect(mailbox.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('serves the development mailbox only to loopback callers outside production', async () => {
    const { app, mail } = await buildAuthApp(ctx());
    try {
      await new Browser(app).register(uniqueEmail('mailbox'));
      await app.auth.service.drainDeliveries();
      const local = await app.inject({
        url: '/api/v1/dev/emails',
        remoteAddress: '127.0.0.1',
      });
      expect(local.statusCode).toBe(200);
      expect(local.json().data.emails.length).toBe(mail.outbox.length);
      const remote = await app.inject({
        url: '/api/v1/dev/emails',
        remoteAddress: '203.0.113.5',
      });
      expect(remote.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
