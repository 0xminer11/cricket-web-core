import { buildApp } from '../../apps/api/src/app/index';
import type { DevelopmentEmailService } from '../../apps/api/src/modules/auth/index';
import type { TestDatabase } from '../../packages/database/src/testing/harness';
import type { Clock } from '../../packages/game-core/src/index';

export const ORIGIN = 'http://localhost:3300';
export const PASSWORD = 'correct horse battery';

/** Controllable clock: tests advance time instead of sleeping. */
export class TestClock implements Clock {
  private current: number;
  constructor(start = Date.now()) {
    this.current = start;
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current += ms;
  }
  advanceSeconds(seconds: number): void {
    this.advance(seconds * 1000);
  }
}

/** Fast Argon2id parameters; production floors apply only to staging/production. */
export const FAST_ARGON2 = {
  AUTH_ARGON2_MEMORY_KIB: '1024',
  AUTH_ARGON2_PASSES: '1',
};

export type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * What the tests read from an injected response (structurally satisfied by fastify's
 * TestResponse; fastify itself is not resolvable from the repository root).
 */
export interface TestResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string | string[] | number | undefined>;
  readonly body: string;
  readonly cookies: ReadonlyArray<{
    name: string;
    value: string;
    maxAge?: number;
    expires?: Date;
  }>;
  // Bodies are asserted structurally in tests; a precise type per endpoint would add noise.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json(): any;
}

export async function buildAuthApp(
  db: TestDatabase,
  env: Record<string, string> = {},
  options: NonNullable<Parameters<typeof buildApp>[1]> = {},
): Promise<{ app: App; clock: TestClock; mail: DevelopmentEmailService }> {
  const clock = (options.clock as TestClock | undefined) ?? new TestClock();
  const app = await buildApp(
    {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: db.url,
      DATABASE_POOL_MAX: '8',
      ...FAST_ARGON2,
      // Generous defaults so unrelated tests never trip throttles; rate-limit tests lower them.
      AUTH_RL_GUEST_MAX: '1000',
      AUTH_RL_REGISTER_MAX: '1000',
      AUTH_RL_LOGIN_IP_MAX: '1000',
      AUTH_RL_EMAIL_ACTION_MAX: '1000',
      AUTH_RL_EMAIL_ACTION_IP_MAX: '1000',
      AUTH_RL_TOKEN_ATTEMPT_MAX: '1000',
      ...env,
    },
    { ...options, clock },
  );
  // Only meaningful with the development adapter (the default outside production).
  const mail = app.auth.email as DevelopmentEmailService;
  return { app, clock, mail };
}

/** Minimal browser: keeps the session cookie, sends a trusted Origin like the web app does. */
export class Browser {
  cookie: string | undefined;
  /** Simulated client address (rate limits are per IP). */
  ip: string | undefined;
  constructor(
    private readonly app: App,
    private readonly cookieName = 'cricketer_session',
    private readonly origin: string | null = ORIGIN,
  ) {}

  private track(response: TestResponse): void {
    for (const c of response.cookies) {
      if (c.name !== this.cookieName) continue;
      const cleared =
        c.value === '' ||
        c.maxAge === 0 ||
        (c.expires && c.expires.getTime() < Date.now());
      this.cookie = cleared ? undefined : c.value;
    }
  }

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<TestResponse> {
    const response = await this.app.inject({
      method,
      url,
      ...(this.ip ? { remoteAddress: this.ip } : {}),
      ...(body !== undefined ? { payload: body as object } : {}),
      headers: {
        ...(this.origin ? { origin: this.origin } : {}),
        ...(this.cookie ? { cookie: `${this.cookieName}=${this.cookie}` } : {}),
        ...headers,
      },
    });
    this.track(response);
    return response;
  }
  get = (url: string, headers?: Record<string, string>) =>
    this.request('GET', url, undefined, headers);
  post = (url: string, body: unknown = {}, headers?: Record<string, string>) =>
    this.request('POST', url, body, headers);
  put = (url: string, body: unknown = {}, headers?: Record<string, string>) =>
    this.request('PUT', url, body, headers);
  patch = (url: string, body: unknown = {}, headers?: Record<string, string>) =>
    this.request('PATCH', url, body, headers);

  guest() {
    return this.post('/api/v1/auth/guest');
  }
  me() {
    return this.get('/api/v1/me');
  }
  register(email: string, password = PASSWORD) {
    return this.post('/api/v1/auth/register', { email, password });
  }
  login(email: string, password = PASSWORD) {
    return this.post('/api/v1/auth/login', { email, password });
  }
  logout() {
    return this.post('/api/v1/auth/logout');
  }
}

let counter = 0;
export const uniqueEmail = (prefix = 'player') =>
  `${prefix}${Date.now().toString(36)}${(counter += 1)}@example.com`;
