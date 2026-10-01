import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_RATE_LIMIT_DEFAULTS,
  parseAuthEnvironment,
  parseEnvironment,
} from '../../packages/config/src/index';
import { mapDatabaseError } from '../../packages/database/src/index';
import {
  AUTH_ERROR_CODES,
  DEFAULT_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  emailSchema,
  loginRequestSchema,
  newPasswordSchema,
  registerRequestSchema,
} from '../../packages/shared-types/src/index';
import { RateLimitedError } from '../../packages/server-kit/src/errors';
import * as authErrors from '../../apps/api/src/modules/auth/auth.errors';
import { SessionCookie } from '../../apps/api/src/modules/auth/auth.cookies';
import {
  Argon2PasswordService,
  AuthRateLimiter,
  DevelopmentEmailService,
  DisabledEmailService,
  MemoryRateLimitStore,
  ResilientRateLimitStore,
  SecureTokenGenerator,
  SessionService,
  TokenService,
  assertOwnsResource,
  hasRole,
  hashIdentifier,
  hashToken,
  isWellFormedToken,
  normalizeEmail,
  passwordResetUrl,
  summarizeUserAgent,
  verificationUrl,
} from '../../apps/api/src/modules/auth/index';
import { TestClock } from '../support/auth';

type Repositories = Parameters<SessionService['resolve']>[0];
const FAST = { memoryKib: 512, passes: 1, parallelism: 1, concurrency: 2 };
const silent = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('email normalization', () => {
  it('trims and lower-cases, nothing more', () => {
    expect(normalizeEmail('  Player@Example.COM ')).toBe('player@example.com');
    // distinct provider addresses are never merged
    expect(normalizeEmail('first.last+tag@gmail.com')).toBe(
      'first.last+tag@gmail.com',
    );
    expect(normalizeEmail('firstlast@gmail.com')).not.toBe(
      normalizeEmail('first.last@gmail.com'),
    );
    expect(normalizeEmail('A@b.co')).toBe(normalizeEmail('a@B.CO'));
  });
  it('validates syntax and length', () => {
    for (const ok of ['a@b.co', 'x.y+z@sub.example.org'])
      expect(emailSchema.safeParse(ok).success).toBe(true);
    for (const bad of [
      '',
      'plain',
      '@x.com',
      'a@',
      'a b@c.com',
      `${'a'.repeat(250)}@x.com`,
    ])
      expect(emailSchema.safeParse(bad).success, bad).toBe(false);
    expect(emailSchema.parse('  a@b.co  ')).toBe('a@b.co');
  });
  it('hashes identifiers for logs without exposing them', () => {
    expect(hashIdentifier('a@b.co')).toMatch(/^[0-9a-f]{16}$/);
    expect(hashIdentifier('a@b.co')).toBe(hashIdentifier('a@b.co'));
    expect(hashIdentifier('a@b.co')).not.toContain('a@b');
  });
  it('summarises user agents coarsely', () => {
    expect(
      summarizeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      ),
    ).toBe('Chrome on macOS');
    expect(summarizeUserAgent(undefined)).toBeNull();
    expect(summarizeUserAgent('curl/8')).toBeNull();
  });
});

describe('password policy', () => {
  const schema = newPasswordSchema();
  it('is length-based: allows spaces and passphrases, imposes no composition rules', () => {
    for (const ok of [
      'aaaaaaaaaa',
      'a long passphrase with spaces',
      ' leading and trailing spaces ',
      '1234567890',
      'x'.repeat(PASSWORD_MAX_LENGTH),
    ])
      expect(schema.safeParse(ok).success, ok).toBe(true);
    expect(schema.parse(' keep spaces ')).toBe(' keep spaces ');
  });
  it('blocks short and abusively long passwords', () => {
    expect(DEFAULT_PASSWORD_MIN_LENGTH).toBe(10);
    expect(schema.safeParse('x'.repeat(9)).success).toBe(false);
    expect(schema.safeParse('x'.repeat(PASSWORD_MAX_LENGTH + 1)).success).toBe(
      false,
    );
    expect(newPasswordSchema(12).safeParse('x'.repeat(11)).success).toBe(false);
  });
  it('rejects unknown request fields (no role or id smuggling)', () => {
    const register = registerRequestSchema();
    expect(
      register.safeParse({ email: 'a@b.co', password: 'x'.repeat(12) }).success,
    ).toBe(true);
    expect(
      register.safeParse({
        email: 'a@b.co',
        password: 'x'.repeat(12),
        role: 'admin',
      }).success,
    ).toBe(false);
    expect(
      register.safeParse({
        email: 'a@b.co',
        password: 'x'.repeat(12),
        confirmPassword: 'x',
      }).success,
    ).toBe(false);
    expect(
      loginRequestSchema.safeParse({
        email: 'a@b.co',
        password: 'p',
        userId: '1',
      }).success,
    ).toBe(false);
  });
});

describe('Argon2id password service', () => {
  const service = new Argon2PasswordService(FAST);
  it('hashes to a PHC string with the configured parameters and verifies', async () => {
    const hash = await service.hash('correct horse battery');
    expect(hash).toMatch(
      /^\$argon2id\$v=19\$m=512,t=1,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
    expect(hash).not.toContain('correct horse');
    expect(await service.verify(hash, 'correct horse battery')).toBe(true);
    expect(await service.verify(hash, 'correct horse batterY')).toBe(false);
    expect(await service.verify(hash, '')).toBe(false);
  });
  it('uses a unique random salt per hash', async () => {
    const [a, b] = await Promise.all([
      service.hash('same password'),
      service.hash('same password'),
    ]);
    expect(a).not.toBe(b);
    expect(await service.verify(a, 'same password')).toBe(true);
    expect(await service.verify(b, 'same password')).toBe(true);
  });
  it('treats malformed, foreign or hostile hashes as non-matching, never throwing', async () => {
    for (const bad of [
      '',
      'plaintext',
      '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012',
      '$argon2id$v=19$m=999999999,t=1,p=1$c2FsdHNhbHRzYWx0c2FsdA$' +
        'A'.repeat(43),
      '$argon2id$v=19$m=512,t=1,p=1$short$short',
    ])
      expect(await service.verify(bad, 'x')).toBe(false);
  });
  it('flags weaker stored parameters for rehashing', async () => {
    const weak = await new Argon2PasswordService({
      ...FAST,
      memoryKib: 256,
    }).hash('pw pw pw pw pw');
    expect(service.needsRehash(weak)).toBe(true);
    expect(service.needsRehash(await service.hash('pw pw pw pw pw'))).toBe(
      false,
    );
    expect(service.needsRehash('garbage')).toBe(true);
  });
  it('spends real work for unknown accounts', async () => {
    await expect(
      service.verifyAgainstDummy('anything at all'),
    ).resolves.toBeUndefined();
  });
  it('bounds concurrent hashing', async () => {
    const gated = new Argon2PasswordService({ ...FAST, concurrency: 1 });
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => gated.hash(`password number ${i}`)),
    );
    expect(new Set(results).size).toBe(4);
  });
});

describe('tokens', () => {
  it('generates unique 256-bit URL-safe tokens and hashes them with SHA-256', () => {
    const generator = new SecureTokenGenerator();
    const tokens = Array.from({ length: 500 }, () => generator.generate());
    expect(new Set(tokens).size).toBe(500);
    for (const t of tokens.slice(0, 20)) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(isWellFormedToken(t)).toBe(true);
    }
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hashToken(tokens[0] as string)).toMatch(/^[0-9a-f]{64}$/);
    for (const bad of [
      '',
      'short',
      'A'.repeat(44),
      'A'.repeat(42) + '!',
      undefined,
      42,
    ])
      expect(isWellFormedToken(bad)).toBe(false);
  });
  it('never uses Math.random for secrets', () => {
    const dir = path.resolve('apps/api/src/modules/auth');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else files.push(path.join(d, e.name));
      }
    };
    walk(dir);
    expect(files.length).toBeGreaterThan(8);
    for (const f of files)
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random/);
  });
  it('maps purpose-specific rejection errors', () => {
    expect(() => TokenService.reject('email_verification', 'invalid')).toThrow(
      authErrors.InvalidVerificationTokenError,
    );
    expect(() => TokenService.reject('email_verification', 'used')).toThrow(
      authErrors.InvalidVerificationTokenError,
    );
    expect(() => TokenService.reject('email_verification', 'expired')).toThrow(
      authErrors.VerificationTokenExpiredError,
    );
    expect(() => TokenService.reject('password_reset', 'invalid')).toThrow(
      authErrors.InvalidResetTokenError,
    );
    expect(() => TokenService.reject('password_reset', 'expired')).toThrow(
      authErrors.ResetTokenExpiredError,
    );
  });
});

describe('session expiry and account status rules', () => {
  const HOUR = 3600;
  const setup = (
    overrides: {
      status?: 'active' | 'suspended' | 'deleted';
      accountType?: 'guest' | 'registered';
    } = {},
  ) => {
    const clock = new TestClock(Date.UTC(2026, 0, 1));
    let row: ReturnType<typeof makeRow> | null = null;
    const makeRow = (createdAt: number) => ({
      session: {
        id: '00000000-0000-4000-8000-000000000001',
        userId: '00000000-0000-4000-8000-000000000002',
        createdAt: new Date(createdAt),
        lastSeenAt: new Date(createdAt),
        expiresAt: new Date(createdAt + HOUR * 1000),
        absoluteExpiresAt: new Date(createdAt + 4 * HOUR * 1000),
        revokedAt: null as Date | null,
        revokedReason: null,
        userAgentSummary: null,
      },
      user: {
        id: '00000000-0000-4000-8000-000000000002',
        status: overrides.status ?? 'active',
        accountType: overrides.accountType ?? 'registered',
      },
    });
    const repos = {
      sessions: {
        create: vi.fn(async (input) => {
          row = {
            ...makeRow(input.now.getTime()),
            session: {
              ...makeRow(input.now.getTime()).session,
              expiresAt: input.expiresAt,
              absoluteExpiresAt: input.absoluteExpiresAt,
            },
          };
          return row.session;
        }),
        findByTokenHash: vi.fn(async () => row),
        touch: vi.fn(async (input) => {
          if (
            !row ||
            row.session.lastSeenAt.getTime() >= input.staleBefore.getTime()
          )
            return null;
          row.session = {
            ...row.session,
            lastSeenAt: input.now,
            expiresAt: input.expiresAt,
          };
          return row.session;
        }),
      },
      users: { touchLastSeen: vi.fn(async () => undefined) },
    } as unknown as Repositories;
    const service = new SessionService({
      generator: new SecureTokenGenerator(),
      clock,
      policy: {
        idleTtlSeconds: { guest: HOUR / 2, registered: HOUR },
        absoluteTtlSeconds: 4 * HOUR,
        touchIntervalSeconds: 60,
      },
    });
    return {
      clock,
      repos,
      service,
      setRow: (fn: (r: NonNullable<typeof row>) => void) => row && fn(row),
      get row() {
        return row;
      },
    };
  };

  it('issues sessions with idle expiry per account type, capped by the absolute lifetime', async () => {
    const guest = setup({ accountType: 'guest' });
    const g = await guest.service.create(guest.repos, {
      userId: 'u',
      accountType: 'guest',
    });
    expect(g.maxAgeSeconds).toBe(HOUR / 2);
    const registered = setup();
    const r = await registered.service.create(registered.repos, {
      userId: 'u',
      accountType: 'registered',
    });
    expect(r.maxAgeSeconds).toBe(HOUR);
    expect(
      r.session.absoluteExpiresAt.getTime() - r.session.createdAt.getTime(),
    ).toBe(4 * HOUR * 1000);
  });

  it('resolves, slides the idle deadline, and never exceeds the absolute cap', async () => {
    const t = setup();
    const { token } = await t.service.create(t.repos, {
      userId: 'u',
      accountType: 'registered',
    });
    t.clock.advanceSeconds(1800);
    const slid = await t.service.resolve(t.repos, token);
    expect(slid.ok && slid.refreshedMaxAgeSeconds).toBe(HOUR);
    t.clock.advanceSeconds(3500);
    expect((await t.service.resolve(t.repos, token)).ok).toBe(true);
    t.clock.advanceSeconds(3500);
    const nearCap = await t.service.resolve(t.repos, token);
    expect(nearCap.ok).toBe(true);
    t.clock.advanceSeconds(3500); // 12300s: idle window would reach 15900s...
    const capped = await t.service.resolve(t.repos, token);
    // ...but the 14400s absolute lifetime wins: 2100s left, not 3600s.
    expect(capped.ok && capped.refreshedMaxAgeSeconds).toBe(2100);
    t.clock.advanceSeconds(3500);
    expect(await t.service.resolve(t.repos, token)).toEqual({
      ok: false,
      reason: 'expired_session',
    });
  });

  it('reports revoked, expired, suspended and deleted for internal logging only', async () => {
    for (const [status, reason] of [
      ['suspended', 'suspended_user'],
      ['deleted', 'deleted_user'],
    ] as const) {
      const t = setup({ status });
      const { token } = await t.service.create(t.repos, {
        userId: 'u',
        accountType: 'registered',
      });
      expect(await t.service.resolve(t.repos, token)).toEqual({
        ok: false,
        reason,
      });
    }
    const t = setup();
    const { token } = await t.service.create(t.repos, {
      userId: 'u',
      accountType: 'registered',
    });
    t.setRow((r) => (r.session.revokedAt = new Date()));
    expect(await t.service.resolve(t.repos, token)).toEqual({
      ok: false,
      reason: 'revoked_session',
    });
  });

  it('rejects malformed cookies without touching the database', async () => {
    const t = setup();
    for (const junk of [undefined, '', 'x', 'A'.repeat(100)])
      expect(await t.service.resolve(t.repos, junk)).toEqual({
        ok: false,
        reason: 'malformed',
      });
    expect(t.repos.sessions.findByTokenHash).not.toHaveBeenCalled();
    expect(
      await t.service.resolve(t.repos, new SecureTokenGenerator().generate()),
    ).toEqual({ ok: false, reason: 'unknown_session' });
  });

  it('attaches only minimal context (no ORM user, no hashes)', async () => {
    const t = setup();
    const { token } = await t.service.create(t.repos, {
      userId: 'u',
      accountType: 'registered',
    });
    const result = await t.service.resolve(t.repos, token);
    expect(result.ok && Object.keys(result.context).sort()).toEqual([
      'accountType',
      'roles',
      'sessionId',
      'userId',
    ]);
    expect(result.ok && result.context.roles).toEqual(['player']);
  });
});

describe('auth error contract', () => {
  it('uses only published codes, with generic messages and correct statuses', () => {
    type ErrorClass = new () => authErrors.AuthError;
    const classes = Object.values(authErrors).filter(
      (v) =>
        typeof v === 'function' &&
        v !== authErrors.AuthError &&
        v.prototype instanceof authErrors.AuthError,
    ) as unknown as ErrorClass[];
    const errors = classes.map((C) =>
      (C as unknown) === authErrors.WeakPasswordError
        ? new authErrors.WeakPasswordError('x')
        : new C(),
    );
    expect(errors.length).toBeGreaterThanOrEqual(14);
    for (const e of errors) {
      expect(AUTH_ERROR_CODES).toContain(e.code);
      expect(e.statusCode).toBeGreaterThanOrEqual(400);
      expect(e.message).not.toMatch(/sql|stack|hash|exception/i);
    }
    expect(new authErrors.InvalidCredentialsError().message).toBe(
      'Invalid email or password.',
    );
    expect(new authErrors.AuthRequiredError().statusCode).toBe(401);
    expect(new authErrors.AccountSuspendedError().message).toBe(
      'Account is temporarily unavailable.',
    );
    expect(new authErrors.EmailAlreadyInUseError().statusCode).toBe(409);
    expect(new RateLimitedError(30).code).toBe('RATE_LIMITED');
    expect(AUTH_ERROR_CODES).toContain('RATE_LIMITED');
  });
  it('does not mistake application error codes for database failures', () => {
    const app = Object.assign(new Error('boom'), {
      code: 'INVALID_RESET_TOKEN',
    });
    expect(mapDatabaseError(app)).toBe(app);
    expect(
      (
        mapDatabaseError(
          Object.assign(new Error('x'), { code: '23505' }),
        ) as object
      ).constructor.name,
    ).toBe('UniqueViolationError');
    expect(
      (
        mapDatabaseError(
          Object.assign(new Error('x'), { code: 'ECONNREFUSED' }),
        ) as object
      ).constructor.name,
    ).toBe('DatabaseConnectionError');
  });
});

describe('authentication configuration', () => {
  const dev = parseEnvironment({ NODE_ENV: 'development' });
  const prodInput = {
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://play.example.com',
    AUTH_TRUSTED_ORIGINS: 'https://play.example.com',
  };
  const prod = parseEnvironment(prodInput);

  it('has convenient but safe development defaults', () => {
    const a = parseAuthEnvironment({}, dev);
    expect(a.cookie).toMatchObject({
      name: 'cricketer_session',
      secure: false,
      sameSite: 'lax',
    });
    expect(a.trustedOrigins).toEqual(['http://localhost:3300']);
    expect(a.emailProvider).toBe('development');
    expect(a.passwordMinLength).toBe(10);
    expect(a.sessionTtlSeconds).toBe(30 * 86400);
    expect(a.sessionAbsoluteTtlSeconds).toBeGreaterThan(a.sessionTtlSeconds);
    expect(a.argon2).toMatchObject({
      memoryKib: 65536,
      passes: 3,
      parallelism: 1,
    });
    expect(a.rateLimits.guest).toEqual(AUTH_RATE_LIMIT_DEFAULTS.guest);
  });

  it('defaults to a Secure __Host- cookie in production', () => {
    const a = parseAuthEnvironment(prodInput, prod);
    expect(a.cookie).toMatchObject({
      name: '__Host-cricketer_session',
      secure: true,
    });
    expect(a.emailProvider).toBe('disabled');
  });

  it('fails fast on insecure production settings', () => {
    const bad = (
      extra: Record<string, string>,
      pattern: RegExp,
      input = prodInput,
    ) =>
      expect(
        () =>
          parseAuthEnvironment({ ...input, ...extra }, parseEnvironment(input)),
        JSON.stringify(extra),
      ).toThrow(pattern);
    bad({ AUTH_COOKIE_SECURE: 'false' }, /AUTH_COOKIE_SECURE must be true/);
    bad({ AUTH_TRUSTED_ORIGINS: '' }, /AUTH_TRUSTED_ORIGINS/);
    bad({ AUTH_TRUSTED_ORIGINS: '*' }, /AUTH_TRUSTED_ORIGINS/);
    bad({ AUTH_ARGON2_MEMORY_KIB: '1024' }, /below the production floor/);
    bad({ AUTH_ARGON2_PASSES: '1' }, /below the production floor/);
    bad({ AUTH_PASSWORD_MIN_LENGTH: '8' }, /at least 10/);
    bad(
      { EMAIL_PROVIDER: 'development' },
      /not allowed in staging\/production/,
    );
    bad({ AUTH_COOKIE_DOMAIN: 'example.com' }, /__Host-/);
    bad({ AUTH_COOKIE_SAME_SITE: 'bogus' }, /AUTH_COOKIE_SAME_SITE/);
    // trusted origins must be https and also CORS-allowed
    const http = {
      ...prodInput,
      CORS_ORIGINS: 'http://play.example.com',
      AUTH_TRUSTED_ORIGINS: 'http://play.example.com',
    };
    bad({}, /must be https/, http);
    bad(
      { AUTH_TRUSTED_ORIGINS: 'https://other.example.com' },
      /must also be listed in CORS_ORIGINS/,
    );
    expect(() =>
      parseAuthEnvironment(
        {},
        parseEnvironment({ ...prodInput, AUTH_TRUSTED_ORIGINS: undefined }),
      ),
    ).toThrow(/AUTH_TRUSTED_ORIGINS/);
  });

  it('rejects inconsistent cookie and lifetime settings in any environment', () => {
    expect(() =>
      parseAuthEnvironment({ AUTH_COOKIE_SAME_SITE: 'none' }, dev),
    ).toThrow(/requires AUTH_COOKIE_SECURE/);
    expect(() =>
      parseAuthEnvironment(
        { AUTH_COOKIE_NAME: '__Host-x', AUTH_COOKIE_SECURE: 'false' },
        dev,
      ),
    ).toThrow(/__Host-/);
    expect(() =>
      parseAuthEnvironment(
        { AUTH_SESSION_TTL: '999999', AUTH_SESSION_ABSOLUTE_TTL: '60' },
        dev,
      ),
    ).toThrow(/cannot exceed/);
    expect(() =>
      parseAuthEnvironment({ AUTH_ARGON2_MEMORY_KIB: '4' }, dev),
    ).toThrow();
    expect(
      parseAuthEnvironment(
        { AUTH_RL_LOGIN_FAILURE_MAX: '9', AUTH_RL_LOGIN_FAILURE_WINDOW: '60' },
        dev,
      ).rateLimits.login_failure,
    ).toEqual({ max: 9, windowSeconds: 60 });
  });
});

describe('session cookie attributes', () => {
  const capture = () => {
    const calls: Array<{
      method: string;
      name: string;
      value?: string;
      options: Record<string, unknown>;
    }> = [];
    const reply = {
      setCookie: (
        name: string,
        value: string,
        options: Record<string, unknown>,
      ) => calls.push({ method: 'set', name, value, options }),
      clearCookie: (name: string, options: Record<string, unknown>) =>
        calls.push({ method: 'clear', name, options }),
    };
    return { calls, reply: reply as never };
  };
  it('sets HttpOnly/Secure/SameSite/Path/Max-Age and clears with identical attributes', () => {
    const cookie = new SessionCookie({
      name: '__Host-cricketer_session',
      secure: true,
      sameSite: 'lax',
    });
    const { calls, reply } = capture();
    cookie.set(reply, 'tok', 1234);
    cookie.clear(reply);
    expect(calls[0]).toMatchObject({
      method: 'set',
      name: '__Host-cricketer_session',
      value: 'tok',
      options: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 1234,
      },
    });
    const setAttrs = { ...calls[0]?.options };
    delete setAttrs.maxAge;
    expect(calls[1]?.options).toEqual(setAttrs);
    expect(calls[0]?.options).not.toHaveProperty('domain');
  });
  it('includes a configured domain on both set and clear', () => {
    const cookie = new SessionCookie({
      name: 'cricketer_session',
      secure: false,
      sameSite: 'strict',
      domain: 'example.com',
    });
    const { calls, reply } = capture();
    cookie.set(reply, 't', 1);
    cookie.clear(reply);
    expect(
      calls.every(
        (c) =>
          c.options.domain === 'example.com' && c.options.sameSite === 'strict',
      ),
    ).toBe(true);
  });
});

describe('rate limiting primitives', () => {
  const config = {
    rateLimits: {
      ...parseAuthEnvironment(
        {
          AUTH_RL_GUEST_MAX: '2',
          AUTH_RL_GUEST_WINDOW: '60',
          AUTH_RL_LOGIN_FAILURE_MAX: '2',
          AUTH_RL_LOGIN_FAILURE_WINDOW: '600',
        },
        parseEnvironment({ NODE_ENV: 'test' }),
      ).rateLimits,
    },
    loginBlock: { baseSeconds: 10, maxSeconds: 40 },
  };
  it('counts within a window and resets after it, using the injected clock', async () => {
    const clock = new TestClock();
    const limiter = new AuthRateLimiter(
      new MemoryRateLimitStore(() => clock.now().getTime()),
      config,
    );
    await limiter.consume('guest', 'ip1');
    await limiter.consume('guest', 'ip1');
    await expect(limiter.consume('guest', 'ip1')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    await limiter.consume('guest', 'ip2');
    clock.advanceSeconds(61);
    await expect(limiter.consume('guest', 'ip1')).resolves.toBeUndefined();
  });
  it('escalates temporary login blocks up to a cap and clears pair counters on success', async () => {
    const clock = new TestClock();
    const limiter = new AuthRateLimiter(
      new MemoryRateLimitStore(() => clock.now().getTime()),
      config,
    );
    const fail = async () => {
      await limiter.recordLoginFailure('ip', 'mail');
      await limiter.recordLoginFailure('ip', 'mail');
    };
    const blockedFor = async () => {
      try {
        await limiter.assertLoginAllowed('ip', 'mail');
        return 0;
      } catch (e) {
        return (e as RateLimitedError).retryAfterSeconds;
      }
    };
    expect(await blockedFor()).toBe(0);
    await fail();
    expect(await blockedFor()).toBe(10);
    clock.advanceSeconds(11);
    expect(await blockedFor()).toBe(0);
    await fail();
    expect(await blockedFor()).toBe(20);
    clock.advanceSeconds(21);
    await fail();
    expect(await blockedFor()).toBe(40);
    clock.advanceSeconds(41);
    await fail();
    expect(await blockedFor()).toBe(40); // capped, never permanent
    clock.advanceSeconds(41);
    expect(await blockedFor()).toBe(0);
    await limiter.recordLoginFailure('ip', 'other');
    await limiter.recordLoginSuccess('ip', 'other');
    await limiter.recordLoginFailure('ip', 'other');
    expect(await limiter.assertLoginAllowed('ip', 'other')).toBeUndefined();
  });
  it('falls back to the in-process store when the primary store fails', async () => {
    const broken = {
      hit: () => Promise.reject(new Error('down')),
      block: () => Promise.reject(new Error('down')),
      blockedFor: () => Promise.reject(new Error('down')),
      clear: () => Promise.reject(new Error('down')),
    };
    const warn = vi.fn();
    const store = new ResilientRateLimitStore(
      broken,
      new MemoryRateLimitStore(),
      { ...silent, warn },
    );
    expect((await store.hit('k', 1000)).count).toBe(1);
    expect((await store.hit('k', 1000)).count).toBe(2);
    expect(warn).toHaveBeenCalled();
  });
});

describe('email adapters', () => {
  it('builds links with the token in the URL fragment so it never reaches server logs', () => {
    expect(verificationUrl('https://play.example.com', 'abc')).toBe(
      'https://play.example.com/verify-email#token=abc',
    );
    expect(passwordResetUrl('https://play.example.com', 'abc')).toBe(
      'https://play.example.com/reset-password#token=abc',
    );
  });
  it('captures development mail (bounded) and never logs links from the disabled adapter', async () => {
    const info = vi.fn();
    const dev = new DevelopmentEmailService({ ...silent, info }, 2);
    for (const to of ['a@x.com', 'b@x.com', 'c@x.com'])
      await dev.sendVerificationEmail({
        to,
        url: `https://x/verify-email#token=${to}`,
        expiresAt: new Date(),
      });
    expect(dev.outbox.map((m) => m.to)).toEqual(['b@x.com', 'c@x.com']);
    expect(dev.last('verification', 'c@x.com')?.token).toBe('c@x.com');
    const warn = vi.fn();
    await new DisabledEmailService({
      ...silent,
      warn,
    }).sendPasswordResetEmail();
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/token|http/);
  });
});

describe('authorization helpers', () => {
  const ctx = {
    userId: 'u1',
    sessionId: 's1',
    accountType: 'registered',
    roles: ['player'],
  } as const;
  it('checks roles and resource ownership by the verified user id only', () => {
    expect(hasRole(ctx, 'player')).toBe(true);
    expect(() => assertOwnsResource(ctx, 'u1')).not.toThrow();
    expect(() => assertOwnsResource(ctx, 'u2')).toThrow(/not found/i);
  });
});
