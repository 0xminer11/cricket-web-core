import { z } from 'zod';
import {
  GAME_BALANCE_VERSION,
  MATCH_ENGINE_VERSION,
  DATA_SCHEMA_VERSION,
} from '@the-cricketer/game-core';
export const APP_VERSION = '0.1.0';
export const versions = {
  appVersion: APP_VERSION,
  balanceVersion: GAME_BALANCE_VERSION,
  matchEngineVersion: MATCH_ENGINE_VERSION,
  dataSchemaVersion: DATA_SCHEMA_VERSION,
} as const;
/**
 * Static switches for features that are not built yet. `career.enabled` is on since Module 6 (Career
 * Home) and `training.enabled` since Module 7 (Training).
 */
export const featureFlags = {
  'career.enabled': true,
  'training.enabled': true,
  'matches.enabled': false,
  'shop.enabled': false,
  'multiplayer.enabled': false,
  'clubs.enabled': false,
  'sponsorships.enabled': false,
} as const;
export type FeatureFlag = keyof typeof featureFlags;
const port = z.coerce.number().int().min(1).max(65535);
const flag = z.enum(['true', 'false']).transform((v) => v === 'true');
const origin = z.url().refine((v) => {
  if (!URL.canParse(v)) return false;
  const u = new URL(v);
  return ['http:', 'https:'].includes(u.protocol) && u.origin === v;
}, 'Expected an HTTP(S) origin without a path');
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).optional(),
  API_PORT: port.default(4300),
  GAME_SERVER_PORT: port.default(4310),
  WEB_PORT: port.default(3300),
  ADMIN_PORT: port.default(3301),
  CORS_ORIGINS: z.string().optional(),
  /** Set only behind a trusted reverse proxy; it makes req.ip honour X-Forwarded-For (rate limits). */
  TRUST_PROXY: flag.default(false),
  NEXT_PUBLIC_API_URL: origin.optional(),
  NEXT_PUBLIC_GAME_SERVER_URL: origin.optional(),
  COMMIT_SHA: z
    .string()
    .regex(/^[a-f0-9]{7,40}$/i)
    .optional(),
  BUILD_TIME: z.iso.datetime().optional(),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),
  APP_VERSION: z.string().min(1).default(APP_VERSION),
});
export function parseEnvironment(input: Record<string, unknown>) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      'Invalid environment: ' +
        result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
    );
  const env = result.data;
  const environment = env.APP_ENV ?? env.NODE_ENV;
  const deployed = environment === 'staging' || environment === 'production';
  if (deployed && env.NODE_ENV !== 'production')
    throw new Error('NODE_ENV must be production for staging/production');
  if (deployed && !env.CORS_ORIGINS)
    throw new Error('CORS_ORIGINS is required for staging/production');
  const origins = (
    env.CORS_ORIGINS ?? 'http://localhost:3300,http://localhost:3301'
  )
    .split(',')
    .map((v) => v.trim());
  if (!z.array(origin).min(1).safeParse(origins).success)
    throw new Error(
      'CORS_ORIGINS must contain explicit HTTP(S) origins; wildcards are not allowed',
    );
  if (
    new Set([env.API_PORT, env.GAME_SERVER_PORT, env.WEB_PORT, env.ADMIN_PORT])
      .size !== 4
  )
    throw new Error('Service ports must be distinct');
  return { ...env, environment, origins, deployed };
}
export type Environment = ReturnType<typeof parseEnvironment>;
export function parseConnectionEnvironment(input: Record<string, unknown>) {
  const result = z
    .object({
      DATABASE_URL: z
        .url()
        .refine(
          (v) =>
            URL.canParse(v) &&
            ['postgres:', 'postgresql:'].includes(new URL(v).protocol),
          'Expected a PostgreSQL connection string',
        ),
      REDIS_URL: z
        .url()
        .refine(
          (v) =>
            URL.canParse(v) &&
            ['redis:', 'rediss:'].includes(new URL(v).protocol),
          'Expected a Redis connection string',
        ),
    })
    .safeParse(input);
  if (!result.success)
    throw new Error(
      'Invalid connection environment: ' +
        result.error.issues
          .map(
            (i) =>
              `${i.path.join('.')}: expected a valid ${i.path[0] === 'DATABASE_URL' ? 'PostgreSQL' : 'Redis'} connection string`,
          )
          .join('; '),
    );
  return result.data;
}

/** Build metadata is supplied at release time; no runtime Git invocation. */
export function getBuildInfo(env: Environment) {
  return {
    appVersion: env.APP_VERSION,
    environment: env.environment,
    ...(env.COMMIT_SHA ? { commitSha: env.COMMIT_SHA } : {}),
    ...(env.BUILD_TIME ? { buildTime: env.BUILD_TIME } : {}),
  };
}

const poolInt = (min: number, max: number, fallback: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);
/** Pool/timeouts for the single per-process PostgreSQL pool. Defaults are conservative. */
export function parseDatabaseEnvironment(input: Record<string, unknown>) {
  const result = z
    .object({
      DATABASE_URL: z
        .url()
        .refine(
          (v) =>
            URL.canParse(v) &&
            ['postgres:', 'postgresql:'].includes(new URL(v).protocol),
          'Expected a PostgreSQL connection string',
        ),
      DATABASE_POOL_MAX: poolInt(1, 100, 10),
      DATABASE_IDLE_TIMEOUT_MS: poolInt(1000, 600000, 30000),
      DATABASE_CONNECTION_TIMEOUT_MS: poolInt(500, 60000, 5000),
      DATABASE_STATEMENT_TIMEOUT_MS: poolInt(500, 300000, 15000),
      /** 0 disables slow-operation logging. */
      DATABASE_SLOW_QUERY_MS: poolInt(0, 60000, 0),
    })
    .safeParse(input);
  if (!result.success)
    throw new Error(
      'Invalid database environment: ' +
        result.error.issues
          .map((i) =>
            i.path[0] === 'DATABASE_URL'
              ? 'DATABASE_URL: expected a valid PostgreSQL connection string'
              : `${i.path.join('.')}: ${i.message}`,
          )
          .join('; '),
    );
  return result.data;
}
export type DatabaseEnvironment = ReturnType<typeof parseDatabaseEnvironment>;

/** Named authentication throttles. Each has `AUTH_RL_<NAME>_MAX` and `AUTH_RL_<NAME>_WINDOW` (seconds). */
export const AUTH_RATE_LIMIT_DEFAULTS = {
  /** POST /auth/guest, per IP. */
  guest: { max: 10, windowSeconds: 3600 },
  /** POST /auth/register, per IP. */
  register: { max: 10, windowSeconds: 3600 },
  /** Every login attempt, per IP (credential-stuffing breadth). */
  login_ip: { max: 30, windowSeconds: 900 },
  /** Failed logins before a temporary block, per IP+email (the per-email limit is twice this). */
  login_failure: { max: 5, windowSeconds: 900 },
  /** Verification resend / forgot-password, per target account or address. */
  email_action: { max: 5, windowSeconds: 3600 },
  /** The same actions, per IP. */
  email_action_ip: { max: 20, windowSeconds: 3600 },
  /** Verify / reset / change-password attempts, per IP (token guessing) or per user. */
  token_attempt: { max: 20, windowSeconds: 900 },
} as const;
export type AuthRateLimitName = keyof typeof AUTH_RATE_LIMIT_DEFAULTS;
export interface AuthRateLimitPolicy {
  readonly max: number;
  readonly windowSeconds: number;
}

const seconds = (min: number, max: number, fallback: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);
const DAY = 86400;
/** Defaults: 64 MiB, 3 passes (RFC 9106 second recommendation, single lane). ~100 ms on a laptop core. */
export const ARGON2_DEFAULTS = { memoryKib: 65536, passes: 3 } as const;
/** Argon2id floor for deployed environments (OWASP: m=19 MiB, t=2, p=1 as the minimum). */
export const ARGON2_PRODUCTION_FLOOR = { memoryKib: 19456, passes: 2 } as const;

/**
 * Authentication settings. Development gets convenient defaults; staging/production fail fast
 * on anything that would weaken cookies, hashing or origin checks.
 */
export function parseAuthEnvironment(
  input: Record<string, unknown>,
  env: Environment,
) {
  const limitShape: Record<string, z.ZodType> = {};
  for (const [name, policy] of Object.entries(AUTH_RATE_LIMIT_DEFAULTS)) {
    const key = `AUTH_RL_${name.toUpperCase()}`;
    limitShape[`${key}_MAX`] = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .default(policy.max);
    limitShape[`${key}_WINDOW`] = seconds(1, DAY, policy.windowSeconds);
  }
  const result = z
    .object({
      /** Sliding idle window for registered sessions (seconds). */
      AUTH_SESSION_TTL: seconds(60, 365 * DAY, 30 * DAY),
      /** Sliding idle window for guest sessions (seconds). */
      AUTH_GUEST_SESSION_TTL: seconds(60, 365 * DAY, 30 * DAY),
      /** Hard cap on any session's life, however active (seconds). */
      AUTH_SESSION_ABSOLUTE_TTL: seconds(60, 730 * DAY, 90 * DAY),
      /** Minimum gap between last_seen_at writes / cookie refreshes (seconds). */
      AUTH_SESSION_TOUCH_INTERVAL: seconds(1, DAY, 300),
      AUTH_PASSWORD_MIN_LENGTH: z.coerce
        .number()
        .int()
        .min(8)
        .max(64)
        .default(10),
      AUTH_VERIFICATION_TOKEN_TTL: seconds(60, 14 * DAY, DAY),
      AUTH_RESET_TOKEN_TTL: seconds(60, DAY, 3600),
      AUTH_COOKIE_NAME: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,64}$/)
        .optional(),
      AUTH_COOKIE_SECURE: flag.optional(),
      AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
      AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),
      AUTH_TRUSTED_ORIGINS: z.string().optional(),
      AUTH_WEB_BASE_URL: origin.optional(),
      AUTH_ARGON2_MEMORY_KIB: z.coerce
        .number()
        .int()
        .min(8)
        .max(1048576)
        .default(ARGON2_DEFAULTS.memoryKib),
      AUTH_ARGON2_PASSES: z.coerce
        .number()
        .int()
        .min(1)
        .max(20)
        .default(ARGON2_DEFAULTS.passes),
      AUTH_ARGON2_PARALLELISM: z.coerce
        .number()
        .int()
        .min(1)
        .max(16)
        .default(1),
      /** Max password hashes computed at once (each holds AUTH_ARGON2_MEMORY_KIB). */
      AUTH_HASH_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(2),
      EMAIL_PROVIDER: z.enum(['development', 'disabled']).optional(),
      AUTH_RL_LOGIN_BLOCK_BASE: seconds(1, DAY, 60),
      AUTH_RL_LOGIN_BLOCK_MAX: seconds(1, DAY, 3600),
      ...limitShape,
    })
    .safeParse(input);
  if (!result.success)
    throw new Error(
      'Invalid auth environment: ' +
        result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
    );
  const a = result.data;
  const raw = result.data as unknown as Record<string, number>;
  const secure = a.AUTH_COOKIE_SECURE ?? env.deployed;
  const sameSite = a.AUTH_COOKIE_SAME_SITE;
  const name =
    a.AUTH_COOKIE_NAME ??
    (secure ? '__Host-cricketer_session' : 'cricketer_session');
  if (name.startsWith('__Host-') && (!secure || a.AUTH_COOKIE_DOMAIN))
    throw new Error(
      'Invalid auth environment: a __Host- cookie requires AUTH_COOKIE_SECURE=true and no AUTH_COOKIE_DOMAIN',
    );
  if (name.startsWith('__Secure-') && !secure)
    throw new Error(
      'Invalid auth environment: a __Secure- cookie requires AUTH_COOKIE_SECURE=true',
    );
  if (sameSite === 'none' && !secure)
    throw new Error(
      'Invalid auth environment: AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true',
    );
  const trustedOrigins = (
    a.AUTH_TRUSTED_ORIGINS ??
    (env.deployed ? '' : (env.origins[0] ?? 'http://localhost:3300'))
  )
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (!z.array(origin).min(1).safeParse(trustedOrigins).success)
    throw new Error(
      'Invalid auth environment: AUTH_TRUSTED_ORIGINS must list explicit HTTP(S) origins' +
        (env.deployed ? ' (required for staging/production)' : ''),
    );
  for (const trusted of trustedOrigins)
    if (!env.origins.includes(trusted))
      throw new Error(
        `Invalid auth environment: trusted origin ${trusted} must also be listed in CORS_ORIGINS`,
      );
  const emailProvider =
    a.EMAIL_PROVIDER ?? (env.deployed ? 'disabled' : 'development');
  if (env.deployed) {
    if (!secure)
      throw new Error(
        'Invalid auth environment: AUTH_COOKIE_SECURE must be true in staging/production',
      );
    if (trustedOrigins.some((o) => !o.startsWith('https://')))
      throw new Error(
        'Invalid auth environment: AUTH_TRUSTED_ORIGINS must be https in staging/production',
      );
    if (
      a.AUTH_ARGON2_MEMORY_KIB < ARGON2_PRODUCTION_FLOOR.memoryKib ||
      a.AUTH_ARGON2_PASSES < ARGON2_PRODUCTION_FLOOR.passes
    )
      throw new Error(
        `Invalid auth environment: Argon2id parameters are below the production floor (memory >= ${ARGON2_PRODUCTION_FLOOR.memoryKib} KiB, passes >= ${ARGON2_PRODUCTION_FLOOR.passes})`,
      );
    if (a.AUTH_PASSWORD_MIN_LENGTH < 10)
      throw new Error(
        'Invalid auth environment: AUTH_PASSWORD_MIN_LENGTH must be at least 10 in staging/production',
      );
    if (emailProvider === 'development')
      throw new Error(
        'Invalid auth environment: EMAIL_PROVIDER=development is not allowed in staging/production',
      );
  }
  if (a.AUTH_ARGON2_MEMORY_KIB < 8 * a.AUTH_ARGON2_PARALLELISM)
    throw new Error(
      'Invalid auth environment: AUTH_ARGON2_MEMORY_KIB must be at least 8 x AUTH_ARGON2_PARALLELISM',
    );
  if (a.AUTH_SESSION_TTL > a.AUTH_SESSION_ABSOLUTE_TTL)
    throw new Error(
      'Invalid auth environment: AUTH_SESSION_TTL cannot exceed AUTH_SESSION_ABSOLUTE_TTL',
    );
  const rateLimits = Object.fromEntries(
    Object.keys(AUTH_RATE_LIMIT_DEFAULTS).map((limitName) => {
      const key = `AUTH_RL_${limitName.toUpperCase()}`;
      return [
        limitName,
        {
          max: raw[`${key}_MAX`] as number,
          windowSeconds: raw[`${key}_WINDOW`] as number,
        },
      ];
    }),
  ) as Record<AuthRateLimitName, AuthRateLimitPolicy>;
  return {
    sessionTtlSeconds: a.AUTH_SESSION_TTL,
    guestSessionTtlSeconds: a.AUTH_GUEST_SESSION_TTL,
    sessionAbsoluteTtlSeconds: a.AUTH_SESSION_ABSOLUTE_TTL,
    sessionTouchIntervalSeconds: a.AUTH_SESSION_TOUCH_INTERVAL,
    passwordMinLength: a.AUTH_PASSWORD_MIN_LENGTH,
    verificationTokenTtlSeconds: a.AUTH_VERIFICATION_TOKEN_TTL,
    resetTokenTtlSeconds: a.AUTH_RESET_TOKEN_TTL,
    cookie: {
      name,
      secure,
      sameSite,
      ...(a.AUTH_COOKIE_DOMAIN ? { domain: a.AUTH_COOKIE_DOMAIN } : {}),
    },
    trustedOrigins,
    webBaseUrl:
      a.AUTH_WEB_BASE_URL ?? trustedOrigins[0] ?? 'http://localhost:3300',
    argon2: {
      memoryKib: a.AUTH_ARGON2_MEMORY_KIB,
      passes: a.AUTH_ARGON2_PASSES,
      parallelism: a.AUTH_ARGON2_PARALLELISM,
      concurrency: a.AUTH_HASH_CONCURRENCY,
    },
    emailProvider,
    rateLimits,
    loginBlock: {
      baseSeconds: a.AUTH_RL_LOGIN_BLOCK_BASE,
      maxSeconds: a.AUTH_RL_LOGIN_BLOCK_MAX,
    },
  } as const;
}
export type AuthEnvironment = ReturnType<typeof parseAuthEnvironment>;

/**
 * Cricketer display-name moderation foundation. Defaults block only impersonation of staff or the
 * game itself (exact match after case/diacritic folding). `PLAYER_NAME_BLOCKED_TERMS` (comma
 * separated) adds whole-word terms; whole-word matching avoids blocking legitimate names that
 * merely contain a term. A real profanity service can replace this behind the same policy port.
 */
export const DEFAULT_RESERVED_PLAYER_NAMES = [
  'admin',
  'administrator',
  'moderator',
  'support',
  'staff',
  'system',
  'root',
  'thecricketer',
  'cricketersupport',
] as const;
export function parsePlayerEnvironment(input: Record<string, unknown>) {
  const list = z
    .string()
    .max(4000)
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    );
  const result = z
    .object({
      PLAYER_NAME_BLOCKED_TERMS: list,
      PLAYER_NAME_RESERVED: list,
    })
    .safeParse(input);
  if (!result.success)
    throw new Error(
      'Invalid player environment: ' +
        result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
    );
  return {
    blockedNameTerms: result.data.PLAYER_NAME_BLOCKED_TERMS,
    reservedNames: [
      ...DEFAULT_RESERVED_PLAYER_NAMES,
      ...result.data.PLAYER_NAME_RESERVED,
    ],
  } as const;
}
export type PlayerEnvironment = ReturnType<typeof parsePlayerEnvironment>;
