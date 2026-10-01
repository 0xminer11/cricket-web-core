import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAuthClient } from '../apps/web/src/features/auth/api/auth-client';
import { ApiClientError } from '../apps/web/src/services/api/index';
import {
  validateChange,
  validateConfirmation,
  validateEmail,
  validateLogin,
  validateNewPassword,
  validateRegistration,
  validateReset,
} from '../apps/web/src/features/auth/schemas/forms';
import { describeAuthError } from '../apps/web/src/features/auth/utils/error-messages';
import { destinationFor } from '../apps/web/src/features/auth/utils/routing';

const USER = {
  id: '0190a000-0000-7000-8000-000000000001',
  accountType: 'guest',
  email: null,
  emailVerified: false,
  hasCricketer: false,
} as const;
const ok = (data: unknown, status = 200) =>
  Response.json({ success: true, data }, { status });
const fail = (
  code: string,
  status: number,
  headers: Record<string, string> = {},
) =>
  Response.json(
    { success: false, error: { code, message: 'server text' } },
    { status, headers },
  );

function recorder(respond: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: URL | string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return respond();
  }) as typeof fetch;
  return { calls, client: createAuthClient('http://localhost:4300', fetcher) };
}

describe('auth client', () => {
  it('reads the session from /me and treats 401 as signed out', async () => {
    const authed = recorder(() => ok({ user: USER }));
    expect(await authed.client.getMe()).toEqual(USER);
    expect(authed.calls[0]?.url).toBe('http://localhost:4300/api/v1/me');
    const anonymous = recorder(() => fail('AUTH_REQUIRED', 401));
    expect(await anonymous.client.getMe()).toBeNull();
    // anything else (server down, 500) is an error, not "signed out"
    await expect(
      recorder(() => fail('INTERNAL_ERROR', 500)).client.getMe(),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    await expect(
      recorder(() => {
        throw new TypeError('network');
      }).client.getMe(),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('sends cookies, JSON bodies and nothing else: no tokens, no authorization header', async () => {
    const r = recorder(() => ok({ user: USER }));
    await r.client.login({ email: 'a@b.co', password: 'secret pass phrase' });
    await r.client.register({
      email: 'a@b.co',
      password: 'secret pass phrase',
    });
    await r.client.createGuest();
    for (const { init } of r.calls) {
      expect(init.credentials).toBe('include');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain(
        'authorization',
      );
      expect(JSON.parse(String(init.body))).toBeTypeOf('object');
    }
    expect(JSON.parse(String(r.calls[0]?.init.body))).toEqual({
      email: 'a@b.co',
      password: 'secret pass phrase',
    });
    expect(JSON.parse(String(r.calls[2]?.init.body))).toEqual({});
    expect(r.calls.map((c) => new URL(c.url).pathname)).toEqual([
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/auth/guest',
    ]);
  });

  it('exposes error codes, status and Retry-After without trusting server text', async () => {
    const r = recorder(() =>
      fail('RATE_LIMITED', 429, {
        'retry-after': '120',
        'x-request-id': 'req-9',
      }),
    );
    const error = await r.client
      .login({ email: 'a@b.co', password: 'x' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 120,
      requestId: 'req-9',
      message: 'Service request failed',
    });
  });

  it('covers recovery and verification calls', async () => {
    const r = recorder(() =>
      ok({ message: 'x', verified: true, alreadyVerified: true }),
    );
    expect(await r.client.verifyEmail('tok')).toEqual({
      alreadyVerified: true,
    });
    await r.client.requestPasswordReset('a@b.co');
    await r.client.resetPassword('tok', 'a new passphrase');
    await r.client.requestEmailVerification();
    await r.client.logout();
    expect(r.calls.map((c) => new URL(c.url).pathname)).toEqual([
      '/api/v1/auth/email/verify',
      '/api/v1/auth/password/forgot',
      '/api/v1/auth/password/reset',
      '/api/v1/auth/email/verification/request',
      '/api/v1/auth/logout',
    ]);
    expect(JSON.parse(String(r.calls[2]?.init.body))).toEqual({
      token: 'tok',
      newPassword: 'a new passphrase',
    });
  });

  it('refuses to run without a configured API address', async () => {
    await expect(createAuthClient(undefined).getMe()).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
    });
  });

  it('rejects malformed success responses', async () => {
    await expect(
      recorder(() => ok({ user: { id: 'not-a-uuid' } })).client.getMe(),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('web auth hygiene', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk('apps/web/src');

  it('never touches browser storage or document.cookie anywhere in the web app', () => {
    expect(files.length).toBeGreaterThan(20);
    // Comments may mention these APIs to say they are NOT used; only code counts.
    const code = (f: string) =>
      readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const f of files)
      expect(code(f), f).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie/,
      );
  });

  it('keeps fetch calls out of components (only the API layer fetches)', () => {
    for (const f of files.filter((x) => x.endsWith('.tsx')))
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/\bfetch\(/);
  });

  it('declares correct autocomplete attributes on every credential field', () => {
    const forms = readFileSync(
      'apps/web/src/features/auth/components/forms.tsx',
      'utf8',
    );
    expect(forms).toContain('autoComplete="current-password"');
    expect(forms).toContain('autoComplete="new-password"');
    expect(forms).toContain('autoComplete="email"');
    expect(forms.match(/<PasswordField/g)?.length).toBe(
      forms.match(/autoComplete="(?:current|new)-password"/g)?.length,
    );
  });
});

describe('form validation and messages', () => {
  it('validates email and passwords like the server (length-based, no composition rules)', () => {
    expect(validateEmail('')).toBeDefined();
    expect(validateEmail('nope')).toBeDefined();
    expect(validateEmail(' a@b.co ')).toBeUndefined();
    expect(validateNewPassword('short')).toMatch(/at least 10/);
    expect(validateNewPassword('x'.repeat(129))).toMatch(/at most 128/);
    expect(validateNewPassword('this has spaces in it')).toBeUndefined();
    expect(validateConfirmation('a', 'b')).toBe('Passwords do not match.');
  });
  it('flags each field and keeps confirmPassword out of the payload model', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: expect.any(String),
      password: expect.any(String),
    });
    expect(validateLogin({ email: 'a@b.co', password: 'x' })).toEqual({});
    expect(
      validateRegistration({
        email: 'a@b.co',
        password: 'long enough pw',
        confirmPassword: 'different',
      }),
    ).toEqual({ confirmPassword: 'Passwords do not match.' });
    expect(
      validateRegistration({
        email: 'a@b.co',
        password: 'long enough pw',
        confirmPassword: 'long enough pw',
      }),
    ).toEqual({});
    expect(
      validateReset({
        newPassword: 'long enough pw',
        confirmPassword: 'long enough pw',
      }),
    ).toEqual({});
    expect(
      Object.keys(
        validateChange({
          currentPassword: '',
          newPassword: 'x',
          confirmPassword: '',
        }),
      ),
    ).toEqual(['currentPassword', 'newPassword']);
  });
  it('maps codes to friendly text and never echoes server internals', () => {
    const e = (code: string, retry?: number) =>
      new ApiClientError('x', code, undefined, 400, retry);
    expect(describeAuthError(e('INVALID_CREDENTIALS'))).toBe(
      'Invalid email or password.',
    );
    expect(describeAuthError(e('INVALID_CREDENTIALS'), 'change-password')).toBe(
      'Your current password is incorrect.',
    );
    expect(describeAuthError(e('AUTH_REQUIRED'))).toBe(
      'Session expired. Please sign in again.',
    );
    expect(describeAuthError(e('ACCOUNT_SUSPENDED'))).toBe(
      'Account is temporarily unavailable.',
    );
    expect(describeAuthError(e('RATE_LIMITED', 90))).toBe(
      'Too many attempts. Try again in about 2 minutes.',
    );
    expect(describeAuthError(e('RATE_LIMITED'))).toBe(
      'Too many attempts. Try again later.',
    );
    expect(describeAuthError(e('SOMETHING_NEW'))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(describeAuthError(new Error('SQL: SELECT * FROM users'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
  it('routes by whether the account already has a cricketer', () => {
    const base = {
      id: '0190a000-0000-7000-8000-000000000001',
      accountType: 'registered',
      email: 'a@b.co',
      emailVerified: true,
    } as const;
    expect(destinationFor({ ...base, hasCricketer: false })).toBe(
      '/create-player',
    );
    expect(destinationFor({ ...base, hasCricketer: true })).toBe('/career');
  });
});
