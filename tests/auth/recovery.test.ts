import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { execRaw } from '../../packages/database/src/testing/harness';
import { describeDb } from '../support/db';
import { Browser, buildAuthApp, PASSWORD, uniqueEmail } from '../support/auth';

const NEW_PASSWORD = 'a brand new passphrase';
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const verify = (b: Browser, token: string) =>
  b.post('/api/v1/auth/email/verify', { token });
const forgot = (b: Browser, email: string) =>
  b.post('/api/v1/auth/password/forgot', { email });
const reset = (b: Browser, token: string, newPassword = NEW_PASSWORD) =>
  b.post('/api/v1/auth/password/reset', { token, newPassword });

describeDb('email verification', (ctx) => {
  const setup = async (env: Record<string, string> = {}) => {
    const built = await buildAuthApp(ctx(), env);
    const email = uniqueEmail('verify');
    const browser = new Browser(built.app);
    await browser.register(email);
    await built.app.auth.service.drainDeliveries();
    const token = built.mail.last('verification', email)?.token as string;
    return { ...built, email, browser, token };
  };

  it('verifies the address with a valid token, then treats repeats as idempotent', async () => {
    const { app, browser, token } = await setup();
    try {
      expect((await browser.me()).json().data.user.emailVerified).toBe(false);
      // verification links work from any browser (no session needed)
      const anonymous = new Browser(app);
      const ok = await verify(anonymous, token);
      expect(ok.statusCode).toBe(200);
      expect(ok.json().data).toEqual({
        verified: true,
        alreadyVerified: false,
      });
      expect((await browser.me()).json().data.user.emailVerified).toBe(true);
      const again = await verify(anonymous, token);
      expect(again.statusCode).toBe(200);
      expect(again.json().data).toEqual({
        verified: true,
        alreadyVerified: true,
      });
    } finally {
      await app.close();
    }
  });

  it('stores only a hash of the token and keeps the raw value out of responses', async () => {
    const { app, token, browser } = await setup();
    try {
      const rows = await execRaw(
        ctx().url,
        'SELECT token_hash, purpose FROM auth_tokens WHERE token_hash = $1',
        [digest(token)],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.purpose).toBe('email_verification');
      expect(
        await execRaw(
          ctx().url,
          'SELECT 1 FROM auth_tokens WHERE token_hash = $1',
          [token],
        ),
      ).toHaveLength(0);
      const response = await verify(browser, token);
      expect(response.body).not.toContain(token);
    } finally {
      await app.close();
    }
  });

  it('rejects invalid, malformed and expired tokens with distinct codes', async () => {
    const { app, clock, browser, token } = await setup({
      AUTH_VERIFICATION_TOKEN_TTL: '600',
    });
    try {
      for (const bad of ['nope', 'A'.repeat(43), '', "' OR 1=1 --"]) {
        const r = await verify(browser, bad);
        expect(r.statusCode).toBe(400);
        expect(r.json().error.code).toBe(
          bad === '' ? 'VALIDATION_ERROR' : 'INVALID_VERIFICATION_TOKEN',
        );
      }
      clock.advanceSeconds(601);
      const expired = await verify(browser, token);
      expect(expired.statusCode).toBe(400);
      expect(expired.json().error.code).toBe('VERIFICATION_TOKEN_EXPIRED');
      expect((await browser.me()).json().data.user.emailVerified).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('resend issues a new link and retires the previous one', async () => {
    const { app, mail, email, browser, token } = await setup();
    try {
      const resend = await browser.post(
        '/api/v1/auth/email/verification/request',
      );
      expect(resend.statusCode).toBe(200);
      await app.auth.service.drainDeliveries();
      const fresh = mail.last('verification', email)?.token as string;
      expect(fresh).not.toBe(token);
      const stale = await verify(browser, token);
      expect(stale.statusCode).toBe(400);
      expect(stale.json().error.code).toBe('INVALID_VERIFICATION_TOKEN');
      expect((await verify(browser, fresh)).statusCode).toBe(200);
      // nothing left to send once verified
      const before = mail.outbox.length;
      expect(
        (await browser.post('/api/v1/auth/email/verification/request'))
          .statusCode,
      ).toBe(200);
      await app.auth.service.drainDeliveries();
      expect(mail.outbox.length).toBe(before);
    } finally {
      await app.close();
    }
  });

  it('requires a registered caller to request verification and rate-limits resends', async () => {
    const { app, browser } = await setup({ AUTH_RL_EMAIL_ACTION_MAX: '2' });
    try {
      const guest = new Browser(app);
      await guest.guest();
      const refused = await guest.post(
        '/api/v1/auth/email/verification/request',
      );
      expect(refused.statusCode).toBe(403);
      expect(refused.json().error.code).toBe('GUEST_UPGRADE_REQUIRED');
      expect(
        (await new Browser(app).post('/api/v1/auth/email/verification/request'))
          .statusCode,
      ).toBe(401);
      const codes: number[] = [];
      for (let i = 0; i < 4; i += 1)
        codes.push(
          (await browser.post('/api/v1/auth/email/verification/request'))
            .statusCode,
        );
      expect(codes).toEqual([200, 200, 429, 429]);
    } finally {
      await app.close();
    }
  });

  it('never accepts a reset token as a verification token or vice versa', async () => {
    const { app, mail, email, browser, token } = await setup();
    try {
      await forgot(browser, email);
      await app.auth.service.drainDeliveries();
      const resetToken = mail.last('password_reset', email)?.token as string;
      expect((await verify(browser, resetToken)).json().error.code).toBe(
        'INVALID_VERIFICATION_TOKEN',
      );
      expect((await reset(browser, token)).json().error.code).toBe(
        'INVALID_RESET_TOKEN',
      );
      // neither was consumed by the wrong-purpose attempt
      expect((await verify(browser, token)).statusCode).toBe(200);
      expect((await reset(browser, resetToken)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('keeps the account when email delivery fails', async () => {
    const { app } = await buildAuthApp(
      ctx(),
      {},
      {
        emailService: {
          sendVerificationEmail: () =>
            Promise.reject(new Error('provider down')),
          sendPasswordResetEmail: () =>
            Promise.reject(new Error('provider down')),
        },
      },
    );
    try {
      const email = uniqueEmail('mailfail');
      const browser = new Browser(app);
      const response = await browser.register(email);
      expect(response.statusCode).toBe(201);
      await app.auth.service.drainDeliveries();
      expect((await browser.me()).statusCode).toBe(200);
      expect((await new Browser(app).login(email)).statusCode).toBe(200);
      expect(
        (await browser.post('/api/v1/auth/email/verification/request'))
          .statusCode,
      ).toBe(200);
      expect((await forgot(new Browser(app), email)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describeDb('password reset and change', (ctx) => {
  const setup = async (env: Record<string, string> = {}) => {
    const built = await buildAuthApp(ctx(), env);
    const email = uniqueEmail('reset');
    const browser = new Browser(built.app);
    await browser.register(email);
    await built.app.auth.service.drainDeliveries();
    built.mail.clear();
    return { ...built, email, browser };
  };
  const requestReset = async (
    app: Awaited<ReturnType<typeof setup>>['app'],
    mail: Awaited<ReturnType<typeof setup>>['mail'],
    email: string,
  ) => {
    await forgot(new Browser(app), email);
    await app.auth.service.drainDeliveries();
    return mail.last('password_reset', email)?.token as string;
  };

  it('does not reveal whether an account exists', async () => {
    const { app, mail, email } = await setup();
    try {
      const known = await forgot(new Browser(app), email);
      const unknown = await forgot(new Browser(app), uniqueEmail('ghost'));
      const malformedBody = await forgot(new Browser(app), 'a@b.co');
      expect(known.statusCode).toBe(200);
      expect(unknown.statusCode).toBe(200);
      expect(known.json()).toEqual(unknown.json());
      expect(malformedBody.json()).toEqual(unknown.json());
      expect(known.json().data.message).toMatch(
        /If an eligible account exists/,
      );
      await app.auth.service.drainDeliveries();
      expect(
        mail.outbox.filter((m) => m.kind === 'password_reset'),
      ).toHaveLength(1);
      expect(mail.outbox[0]?.to).toBe(email);
    } finally {
      await app.close();
    }
  });

  it('sends nothing for suspended or deleted accounts, with the same response', async () => {
    const { app, mail, email, browser } = await setup();
    try {
      const repos = ctx().database.repositories();
      const userId = (await browser.me()).json().data.user.id;
      await repos.users.changeStatus(userId, 'suspended');
      const response = await forgot(new Browser(app), email);
      expect(response.statusCode).toBe(200);
      await repos.users.changeStatus(userId, 'deleted');
      expect((await forgot(new Browser(app), email)).json()).toEqual(
        response.json(),
      );
      await app.auth.service.drainDeliveries();
      expect(mail.outbox).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('resets the password, revokes every session and invalidates the old password', async () => {
    const { app, mail, email, browser } = await setup();
    try {
      const phone = new Browser(app);
      await phone.login(email);
      const token = await requestReset(app, mail, email);
      const before = browser.cookie;
      const response = await reset(new Browser(app), token);
      expect(response.statusCode).toBe(200);
      // no session is created by a reset (deliberate: the user signs in again)
      expect(response.headers['set-cookie']).toBeUndefined();
      expect((await browser.me()).statusCode).toBe(401);
      expect((await phone.me()).statusCode).toBe(401);
      expect(browser.cookie).toBe(
        before === undefined ? undefined : browser.cookie,
      );
      expect((await new Browser(app).login(email, PASSWORD)).statusCode).toBe(
        401,
      );
      const fresh = new Browser(app);
      expect((await fresh.login(email, NEW_PASSWORD)).statusCode).toBe(200);
      // the mailbox link proved control of the address
      expect((await fresh.me()).json().data.user.emailVerified).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('makes reset tokens single-use, expiring and superseded by newer ones', async () => {
    const { app, mail, clock, email } = await setup({
      AUTH_RESET_TOKEN_TTL: '900',
    });
    try {
      const first = await requestReset(app, mail, email);
      const second = await requestReset(app, mail, email);
      expect(second).not.toBe(first);
      const stale = await reset(new Browser(app), first);
      expect(stale.statusCode).toBe(400);
      expect(stale.json().error.code).toBe('INVALID_RESET_TOKEN');
      expect((await reset(new Browser(app), second)).statusCode).toBe(200);
      const reused = await reset(new Browser(app), second);
      expect(reused.statusCode).toBe(400);
      expect(reused.json().error.code).toBe('INVALID_RESET_TOKEN');
      // expiry
      const third = await requestReset(app, mail, email);
      clock.advanceSeconds(901);
      const expired = await reset(new Browser(app), third);
      expect(expired.statusCode).toBe(400);
      expect(expired.json().error.code).toBe('RESET_TOKEN_EXPIRED');
      // a successful reset also kills any other outstanding reset links
      const a = await requestReset(app, mail, email);
      const rows = await execRaw(
        ctx().url,
        "SELECT count(*)::int AS n FROM auth_tokens WHERE purpose = 'password_reset' AND consumed_at IS NULL AND expires_at > $1",
        [clock.now().toISOString()],
      );
      expect(rows[0]?.n).toBeGreaterThanOrEqual(1);
      expect((await reset(new Browser(app), a)).statusCode).toBe(200);
      const left = await execRaw(
        ctx().url,
        "SELECT count(*)::int AS n FROM auth_tokens t JOIN auth_identities i ON i.user_id = t.user_id WHERE i.email_normalized = $1 AND t.purpose = 'password_reset' AND t.consumed_at IS NULL",
        [email],
      );
      expect(left[0]?.n).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('lets only one of many concurrent resets with the same token succeed', async () => {
    const { app, mail, email } = await setup();
    try {
      const token = await requestReset(app, mail, email);
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          reset(new Browser(app), token, `${NEW_PASSWORD} ${i}`),
        ),
      );
      expect(
        results.filter((r: { statusCode: number }) => r.statusCode === 200),
      ).toHaveLength(1);
      expect(
        results.filter((r: { statusCode: number }) => r.statusCode === 400),
      ).toHaveLength(4);
    } finally {
      await app.close();
    }
  });

  it('enforces the password policy on reset and rejects bad tokens before hashing', async () => {
    const { app, mail, email } = await setup();
    try {
      const token = await requestReset(app, mail, email);
      const weak = await reset(new Browser(app), token, 'short');
      expect(weak.json().error.code).toBe('WEAK_PASSWORD');
      expect(
        (await reset(new Browser(app), 'x'.repeat(43))).json().error.code,
      ).toBe('INVALID_RESET_TOKEN');
      // the weak attempt did not burn the token
      expect((await reset(new Browser(app), token)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('changes the password: current password required, other devices signed out, session rotated', async () => {
    const { app, email, browser } = await setup();
    try {
      const other = new Browser(app);
      await other.login(email);
      const before = browser.cookie;
      const wrong = await browser.post('/api/v1/auth/password/change', {
        currentPassword: 'wrong wrong wrong',
        newPassword: NEW_PASSWORD,
      });
      expect(wrong.statusCode).toBe(400);
      expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');
      const same = await browser.post('/api/v1/auth/password/change', {
        currentPassword: PASSWORD,
        newPassword: PASSWORD,
      });
      expect(same.json().error.code).toBe('WEAK_PASSWORD');
      const ok = await browser.post('/api/v1/auth/password/change', {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      expect(ok.statusCode).toBe(200);
      expect(browser.cookie).not.toBe(before);
      expect((await browser.me()).statusCode).toBe(200);
      expect((await other.me()).statusCode).toBe(401);
      expect((await new Browser(app).login(email, PASSWORD)).statusCode).toBe(
        401,
      );
      expect(
        (await new Browser(app).login(email, NEW_PASSWORD)).statusCode,
      ).toBe(200);
      const guest = new Browser(app);
      await guest.guest();
      const refused = await guest.post('/api/v1/auth/password/change', {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      expect(refused.statusCode).toBe(403);
      expect(refused.json().error.code).toBe('GUEST_UPGRADE_REQUIRED');
    } finally {
      await app.close();
    }
  });

  it('writes security audit events without secrets', async () => {
    const { app, mail, email, browser } = await setup();
    try {
      const userId = (await browser.me()).json().data.user.id as string;
      await new Browser(app).login(email, 'wrong wrong wrong');
      const token = await requestReset(app, mail, email);
      await reset(new Browser(app), token);
      const login = new Browser(app);
      await login.login(email, NEW_PASSWORD);
      await login.logout();
      const rows = await execRaw(
        ctx().url,
        'SELECT action, actor_type, metadata FROM audit_logs WHERE target_id = $1',
        [userId],
      );
      const actions = new Set(rows.map((r) => r.action));
      for (const expected of [
        'auth.registered',
        'auth.login_failed',
        'auth.password_reset_requested',
        'auth.password_reset_completed',
        'auth.session_revoked',
        'auth.login_success',
        'auth.logout',
      ])
        expect(actions, expected).toContain(expected);
      const dump = JSON.stringify(rows);
      for (const secret of [
        PASSWORD,
        NEW_PASSWORD,
        token,
        login.cookie as string,
        'argon2',
      ])
        expect(dump).not.toContain(secret);
    } finally {
      await app.close();
    }
  });
});
