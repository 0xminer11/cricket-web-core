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
export const featureFlags = {
  'career.enabled': false,
  'training.enabled': false,
  'shop.enabled': false,
  'multiplayer.enabled': false,
  'clubs.enabled': false,
  'sponsorships.enabled': false,
} as const;
export type FeatureFlag = keyof typeof featureFlags;
const port = z.coerce.number().int().min(1).max(65535);
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
