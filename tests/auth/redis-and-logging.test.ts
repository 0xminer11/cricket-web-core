import { createClient } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  parseAuthEnvironment,
  parseEnvironment,
} from '../../packages/config/src/index';
import {
  AuthRateLimiter,
  RedisRateLimitStore,
} from '../../apps/api/src/modules/auth/index';
import { describeDb, integration } from '../support/db';
import { Browser, buildAuthApp, PASSWORD, uniqueEmail } from '../support/auth';

const redisUrl = process.env.REDIS_URL;

describe.runIf(integration && redisUrl)('Redis-backed rate limiting', () => {
  const client = createClient({ url: redisUrl as string });
  const prefix = `test:${Date.now().toString(36)}:`;
  beforeAll(async () => {
    await client.connect();
  });
  afterAll(async () => {
    const keys = await client.keys(`${prefix}*`);
    if (keys.length) await client.del(keys);
    await client.quit();
  });

  it('increments atomically, expires, blocks and clears', async () => {
    const store = new RedisRateLimitStore(client, prefix);
    const hits = await Promise.all(
      Array.from({ length: 40 }, () => store.hit('burst', 5000)),
    );
    expect(new Set(hits.map((h) => h.count)).size).toBe(40);
    expect(Math.max(...hits.map((h) => h.count))).toBe(40);
    expect(hits[0]?.ttlMs).toBeGreaterThan(0);
    expect(hits[0]?.ttlMs).toBeLessThanOrEqual(5000);
    // the window is fixed by the first hit and never extended
    await new Promise((r) => setTimeout(r, 30));
    expect((await store.hit('burst', 60_000)).ttlMs).toBeLessThanOrEqual(5000);
    expect(await store.blockedFor('b')).toBe(0);
    await store.block('b', 2000);
    expect(await store.blockedFor('b')).toBeGreaterThan(0);
    await store.clear('b');
    expect(await store.blockedFor('b')).toBe(0);
  });

  it('drives the auth limiter, and the window really expires', async () => {
    const store = new RedisRateLimitStore(client, `${prefix}lim:`);
    const config = parseAuthEnvironment(
      { AUTH_RL_GUEST_MAX: '2', AUTH_RL_GUEST_WINDOW: '1' },
      parseEnvironment({ NODE_ENV: 'test' }),
    );
    const limiter = new AuthRateLimiter(store, config);
    await limiter.consume('guest', 'ip');
    await limiter.consume('guest', 'ip');
    await expect(limiter.consume('guest', 'ip')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    await new Promise((r) => setTimeout(r, 1100));
    await expect(limiter.consume('guest', 'ip')).resolves.toBeUndefined();
  });
});

describeDb('shared limits and degraded Redis', (ctx) => {
  it.runIf(redisUrl)(
    'shares limits between API instances through Redis',
    async () => {
      const scope = `shared-${Date.now().toString(36)}`;
      const env = {
        REDIS_URL: redisUrl as string,
        AUTH_RL_GUEST_MAX: '2',
        AUTH_RL_GUEST_WINDOW: '60',
      };
      const one = await buildAuthApp(ctx(), env);
      const two = await buildAuthApp(ctx(), env);
      try {
        const ip = `10.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}.1`;
        const call = (app: typeof one.app) => {
          const b = new Browser(app);
          b.ip = ip;
          return b.guest();
        };
        expect(scope).toBeTruthy();
        await new Promise((r) => setTimeout(r, 200)); // let both Redis clients connect
        expect((await call(one.app)).statusCode).toBe(201);
        expect((await call(two.app)).statusCode).toBe(201);
        // a third request on EITHER instance is limited: the counter lives in Redis
        expect((await call(one.app)).statusCode).toBe(429);
        expect((await call(two.app)).statusCode).toBe(429);
      } finally {
        await one.app.close();
        await two.app.close();
      }
    },
  );

  it('keeps authenticating (with per-instance limits) when Redis is unreachable', async () => {
    const { app } = await buildAuthApp(ctx(), {
      REDIS_URL: 'redis://127.0.0.1:1',
      AUTH_RL_GUEST_MAX: '2',
    });
    try {
      const results = [];
      for (let i = 0; i < 3; i += 1)
        results.push((await new Browser(app).guest()).statusCode);
      expect(results).toEqual([201, 201, 429]);
    } finally {
      await app.close();
    }
  });
});

describeDb('security logging', (ctx) => {
  it('never logs passwords, raw emails or tokens from auth workflows', async () => {
    const { app } = await buildAuthApp(ctx());
    try {
      const lines: string[] = [];
      const capture = (obj: Record<string, unknown>, msg: string) =>
        lines.push(JSON.stringify({ obj, msg }));
      const meta = {
        requestId: 'req-1',
        ip: '203.0.113.7',
        userAgent: 'test',
        log: { info: capture, warn: capture, error: capture },
      };
      const email = uniqueEmail('Logs');
      const service = app.auth.service;
      const registered = await service.register(meta, null, {
        email,
        password: PASSWORD,
      });
      await service
        .login(meta, null, { email, password: 'wrong wrong wrong' })
        .catch(() => undefined);
      await service
        .login(meta, null, {
          email: uniqueEmail('ghost'),
          password: 'ghost password',
        })
        .catch(() => undefined);
      const ok = await service.login(meta, null, { email, password: PASSWORD });
      await service.forgotPassword(meta, { email });
      await service.forgotPassword(meta, { email: 'nobody@example.com' });
      await service.drainDeliveries();
      const everything = lines.join('\n');
      expect(lines.length).toBeGreaterThan(0);
      for (const secret of [
        PASSWORD,
        'wrong wrong wrong',
        'ghost password',
        email,
        email.toLowerCase(),
        registered.session?.token,
        ok.session?.token,
        '203.0.113.7',
      ])
        expect(everything, String(secret)).not.toContain(String(secret));
      // but failures are observable by hashed identifier and internal reason
      expect(everything).toMatch(/identifierHash/);
      expect(everything).toMatch(/bad_password/);
      expect(everything).toMatch(/unknown_identity/);
    } finally {
      await app.close();
    }
  });
});
