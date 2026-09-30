import { it, expect } from 'vitest';
import { buildApp } from '../apps/api/src/app/index';
import { buildApp as buildGame } from '../apps/game-server/src/app/index';
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from '../packages/server-kit/src/errors';
for (const [service, build] of [
  ['api', buildApp],
  ['game-server', buildGame],
] as const) {
  it(`${service} serves health and versions with unique request IDs`, async () => {
    const app = await build({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
    try {
      const response = await app.inject({
        url: '/health',
        headers: { 'x-request-id': 'attacker-supplied' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        success: true,
        data: { service, status: 'ok', environment: 'test' },
      });
      expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
      const next = await app.inject('/version');
      expect(next.headers['x-request-id']).not.toBe(
        response.headers['x-request-id'],
      );
      expect(next.json()).toMatchObject({
        success: true,
        data: { balanceVersion: '1', dataSchemaVersion: 2 },
      });
    } finally {
      await app.close();
    }
  });
}
it('maps errors safely, applies security headers and allows only configured CORS origins', async () => {
  const app = await buildApp({
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://example.com',
    LOG_LEVEL: 'silent',
  });
  app.get('/fail', () => {
    throw new Error('secret database password');
  });
  for (const [path, error] of [
    ['validation', new ValidationError()],
    ['unauthorized', new UnauthorizedError()],
    ['forbidden', new ForbiddenError()],
    ['conflict', new ConflictError()],
  ] as const)
    app.get(`/${path}`, () => {
      throw error;
    });
  try {
    const fail = await app.inject('/fail');
    expect(fail.statusCode).toBe(500);
    expect(fail.body).not.toMatch(/password|stack/);
    for (const [path, code] of [
      ['missing', 404],
      ['validation', 400],
      ['unauthorized', 401],
      ['forbidden', 403],
      ['conflict', 409],
    ] as const)
      expect((await app.inject(`/${path}`)).statusCode).toBe(code);
    const allowed = await app.inject({
      url: '/health',
      headers: { origin: 'https://example.com' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://example.com',
    );
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(
      (
        await app.inject({
          url: '/health',
          headers: { origin: 'https://evil.example' },
        })
      ).headers['access-control-allow-origin'],
    ).toBeUndefined();
  } finally {
    await app.close();
  }
});
it('limits abusive traffic with a consistent error envelope', async () => {
  const app = await buildApp({
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://example.com',
    LOG_LEVEL: 'silent',
  });
  try {
    for (let i = 0; i < 120; i++) await app.inject('/health');
    const response = await app.inject('/health');
    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED' },
    });
  } finally {
    await app.close();
  }
});
it('reports readiness of injected dependencies without leaking failure details', async () => {
  const { createService } = await import('../packages/server-kit/src/index');
  const { parseEnvironment } = await import('../packages/config/src/index');
  const env = parseEnvironment({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  let healthy = true;
  const app = await createService('api', env, {
    readiness: {
      database: async () => {
        if (!healthy)
          throw new Error(
            'connect ECONNREFUSED postgres://user:secret@10.0.0.5:5432/db',
          );
      },
      slow: () => new Promise<void>(() => undefined),
    },
    readinessTimeoutMs: 50,
  });
  try {
    const slow = await app.inject('/ready');
    expect(slow.statusCode).toBe(503);
    expect(slow.json()).toMatchObject({
      success: false,
      error: { code: 'NOT_READY', message: 'Not ready: slow' },
    });
    healthy = false;
    const down = await app.inject('/ready');
    expect(down.statusCode).toBe(503);
    expect(down.body).not.toMatch(/secret|10\.0\.0\.5|ECONNREFUSED|postgres:/);
    expect(down.json().error.message).toContain('database');
  } finally {
    await app.close();
  }
  const ok = await createService('api', env, {
    readiness: { database: async () => undefined },
  });
  try {
    const response = await ok.inject('/ready');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: { status: 'ok', checks: { database: 'ok' } },
    });
  } finally {
    await ok.close();
  }
});
it.runIf(process.env.INTEGRATION_TESTS === '1')(
  'api /ready reports PostgreSQL through the shared pool',
  async () => {
    const app = await buildApp({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: process.env.DATABASE_URL,
    });
    try {
      const response = await app.inject('/ready');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: { checks: { database: 'ok' } },
      });
    } finally {
      await app.close();
    }
    const broken = await buildApp({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://nobody:hunter2@127.0.0.1:1/none',
      DATABASE_CONNECTION_TIMEOUT_MS: '500',
    });
    try {
      const response = await broken.inject('/ready');
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toMatch(/hunter2|127\.0\.0\.1|nobody/);
    } finally {
      await broken.close();
    }
  },
);
