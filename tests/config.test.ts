import { it, expect } from 'vitest';
import {
  parseEnvironment,
  parseConnectionEnvironment,
} from '../packages/config/src/index';
import { healthSchema } from '../packages/shared-types/src/index';
it('rejects invalid ports, duplicate ports and wildcard CORS', () => {
  expect(() => parseEnvironment({ API_PORT: 'bad' })).toThrow('API_PORT');
  expect(() => parseEnvironment({ API_PORT: 3300 })).toThrow('distinct');
  expect(() => parseEnvironment({ CORS_ORIGINS: '*' })).toThrow('CORS_ORIGINS');
});
it('fails closed for deployed environments', () => {
  expect(() => parseEnvironment({ NODE_ENV: 'production' })).toThrow(
    'CORS_ORIGINS',
  );
  expect(() => parseEnvironment({ APP_ENV: 'staging' })).toThrow('NODE_ENV');
  expect(
    parseEnvironment({
      NODE_ENV: 'production',
      APP_ENV: 'staging',
      CORS_ORIGINS: 'https://example.com',
    }).environment,
  ).toBe('staging');
});
it('allows local health-only servers without unused future secrets', () => {
  expect(parseEnvironment({}).API_PORT).toBe(4300);
});
it('requires valid explicit database and Redis URLs when connecting', () => {
  expect(() => parseConnectionEnvironment({})).toThrow('DATABASE_URL');
  expect(() =>
    parseConnectionEnvironment({
      DATABASE_URL: 'https://invalid',
      REDIS_URL: 'https://invalid',
    }),
  ).toThrow('PostgreSQL');
});
it('validates transport contracts at runtime', () => {
  expect(
    healthSchema.safeParse({
      status: 'ok',
      service: 'api',
      version: '0.1.0',
      environment: 'test',
    }).success,
  ).toBe(true);
  expect(healthSchema.safeParse({ status: 'ready' }).success).toBe(false);
});
it('rejects unsafe public service URLs and malformed release metadata', () => {
  expect(() =>
    parseEnvironment({
      NEXT_PUBLIC_API_URL: 'https://user:password@example.com',
    }),
  ).toThrow('NEXT_PUBLIC_API_URL');
  expect(() => parseEnvironment({ COMMIT_SHA: 'not-a-sha' })).toThrow(
    'COMMIT_SHA',
  );
});
