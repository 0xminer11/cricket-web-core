import type { createClient } from 'redis';
import type { AuthEnvironment, AuthRateLimitName } from '@the-cricketer/config';
import { RateLimitedError } from '@the-cricketer/server-kit';
import type { AuthLogger } from './auth.types';

/** Counter/blocker primitives. Implementations must make `hit` atomic. */
export interface RateLimitStore {
  /** Increment `key`; the TTL is set by the first hit of a window and never extended. */
  hit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
  /** Mark `key` blocked for `ttlMs`. */
  block(key: string, ttlMs: number): Promise<void>;
  /** Milliseconds a block has left (0 when not blocked). */
  blockedFor(key: string): Promise<number>;
  clear(key: string): Promise<void>;
}

/** Single-process store: default for tests and for local runs without Redis. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<
    string,
    { count: number; expiresAt: number }
  >();
  constructor(private readonly now: () => number = () => Date.now()) {}

  private live(key: string) {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }
  hit(key: string, windowMs: number) {
    let entry = this.live(key);
    if (!entry) {
      entry = { count: 0, expiresAt: this.now() + windowMs };
      this.entries.set(key, entry);
    }
    entry.count += 1;
    return Promise.resolve({
      count: entry.count,
      ttlMs: entry.expiresAt - this.now(),
    });
  }
  block(key: string, ttlMs: number) {
    this.entries.set(key, { count: 1, expiresAt: this.now() + ttlMs });
    return Promise.resolve();
  }
  blockedFor(key: string) {
    const entry = this.live(key);
    return Promise.resolve(entry ? entry.expiresAt - this.now() : 0);
  }
  clear(key: string) {
    this.entries.delete(key);
    return Promise.resolve();
  }
  /** Test helper: forget everything. */
  reset(): void {
    this.entries.clear();
  }
}

type RedisClient = ReturnType<typeof createClient>;

/** Shared across API instances. Atomic via MULTI; needs Redis >= 7 for `PEXPIRE ... NX`. */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly client: Pick<
      RedisClient,
      'multi' | 'set' | 'pTTL' | 'del'
    >,
    private readonly prefix = 'cricketer:auth:rl:',
  ) {}

  async hit(key: string, windowMs: number) {
    const k = this.prefix + key;
    const replies = await this.client
      .multi()
      .incr(k)
      .pExpire(k, windowMs, 'NX')
      .pTTL(k)
      .exec();
    return {
      count: Number(replies[0]),
      ttlMs: Math.max(0, Number(replies[2])),
    };
  }
  async block(key: string, ttlMs: number) {
    await this.client.set(this.prefix + key, '1', { PX: ttlMs });
  }
  async blockedFor(key: string) {
    const ttl = await this.client.pTTL(this.prefix + key);
    return ttl > 0 ? ttl : 0;
  }
  async clear(key: string) {
    await this.client.del(this.prefix + key);
  }
}

/**
 * Availability beats strictness for a limiter: if Redis is unreachable, fall back to the
 * in-process store (per-instance limits) and log, instead of failing every login.
 */
export class ResilientRateLimitStore implements RateLimitStore {
  constructor(
    private readonly primary: RateLimitStore,
    private readonly fallback: RateLimitStore,
    private readonly log: AuthLogger,
  ) {}
  private async attempt<T>(
    op: (store: RateLimitStore) => Promise<T>,
  ): Promise<T> {
    try {
      return await op(this.primary);
    } catch {
      this.log.warn(
        { component: 'rate-limit' },
        'rate-limit store unavailable; using in-process fallback',
      );
      return op(this.fallback);
    }
  }
  hit(key: string, windowMs: number) {
    return this.attempt((s) => s.hit(key, windowMs));
  }
  block(key: string, ttlMs: number) {
    return this.attempt((s) => s.block(key, ttlMs));
  }
  blockedFor(key: string) {
    return this.attempt((s) => s.blockedFor(key));
  }
  clear(key: string) {
    return this.attempt((s) => s.clear(key));
  }
}

const DAY_MS = 86_400_000;
const retryAfter = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/**
 * Auth throttling policy over a store. Keys use hashed identifiers, never raw IPs or emails.
 *
 * Login protection layers:
 *  1. every attempt counts against the caller's IP (credential-stuffing breadth);
 *  2. failures count per IP+email and per email (a distributed guess against one account);
 *  3. crossing a failure threshold blocks that key temporarily, with the block doubling on each
 *     repeat (base -> max). Blocks always expire; nobody is locked out permanently.
 */
export class AuthRateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly config: Pick<AuthEnvironment, 'rateLimits' | 'loginBlock'>,
  ) {}

  /** Count one event and throw RateLimitedError when over the named policy's limit. */
  async consume(name: AuthRateLimitName, key: string): Promise<void> {
    const policy = this.config.rateLimits[name];
    const { count, ttlMs } = await this.store.hit(
      `${name}:${key}`,
      policy.windowSeconds * 1000,
    );
    if (count > policy.max) throw new RateLimitedError(retryAfter(ttlMs));
  }

  /** Throw if this IP+email pair, or the email overall, is currently blocked. */
  async assertLoginAllowed(ipKey: string, emailKey: string): Promise<void> {
    const remaining = Math.max(
      await this.store.blockedFor(`login_block:pair:${ipKey}:${emailKey}`),
      await this.store.blockedFor(`login_block:email:${emailKey}`),
    );
    if (remaining > 0) throw new RateLimitedError(retryAfter(remaining));
  }

  async recordLoginFailure(ipKey: string, emailKey: string): Promise<void> {
    const policy = this.config.rateLimits.login_failure;
    const window = policy.windowSeconds * 1000;
    const pair = `pair:${ipKey}:${emailKey}`;
    const email = `email:${emailKey}`;
    const pairHits = await this.store.hit(`login_fail:${pair}`, window);
    const emailHits = await this.store.hit(`login_fail:${email}`, window);
    if (pairHits.count >= policy.max) await this.escalate(pair);
    // Many IPs against one account: tolerate twice as many failures before blocking it.
    if (emailHits.count >= policy.max * 2) await this.escalate(email);
  }

  async recordLoginSuccess(ipKey: string, emailKey: string): Promise<void> {
    await this.store.clear(`login_fail:pair:${ipKey}:${emailKey}`);
  }

  private async escalate(scope: string): Promise<void> {
    const { baseSeconds, maxSeconds } = this.config.loginBlock;
    const { count: strikes } = await this.store.hit(
      `login_strike:${scope}`,
      DAY_MS,
    );
    const seconds = Math.min(maxSeconds, baseSeconds * 2 ** (strikes - 1));
    await this.store.block(`login_block:${scope}`, seconds * 1000);
    await this.store.clear(`login_fail:${scope}`);
  }
}
