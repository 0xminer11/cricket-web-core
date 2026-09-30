import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYER_CONFIG } from '../packages/game-core/src/index';
import { parseDatabaseEnvironment } from '../packages/config/src/index';
import {
  CheckViolationError,
  DatabaseConnectionError,
  ForeignKeyViolationError,
  InvalidCursorError,
  LIMITS,
  QueryTimeoutError,
  TransactionConflictError,
  UniqueViolationError,
  battingAverage,
  bowlingAverage,
  clampLimit,
  createDefinitionCatalog,
  decodeSequenceCursor,
  decodeTimeCursor,
  economyRate,
  encodeSequenceCursor,
  encodeTimeCursor,
  isUuid,
  mapDatabaseError,
  oversBowled,
  schema,
  strikeRate,
  uuidv7,
} from '../packages/database/src/index';

const pgError = (code: string, constraint?: string) =>
  Object.assign(new Error('driver text with secrets'), { code, constraint });

describe('database package (no database required)', () => {
  it('mirrors Module 0 limits used by CHECK constraints', () => {
    expect(LIMITS.statMin).toBe(PLAYER_CONFIG.statMin);
    expect(LIMITS.statMax).toBe(PLAYER_CONFIG.statMax);
    expect(LIMITS.levelCap).toBe(PLAYER_CONFIG.levelCap);
    expect(LIMITS.formMin).toBe(PLAYER_CONFIG.form.min);
    expect(LIMITS.formMax).toBe(PLAYER_CONFIG.form.max);
    expect(LIMITS.fatigueMin).toBe(PLAYER_CONFIG.fatigue.min);
    expect(LIMITS.fatigueMax).toBe(PLAYER_CONFIG.fatigue.max);
  });

  it('generates well-formed, increasing UUIDv7 identifiers', () => {
    const ids = Array.from({ length: 2000 }, () => uuidv7());
    for (const id of ids) {
      expect(isUuid(id)).toBe(true);
      expect(id[14]).toBe('7');
      expect('89ab').toContain(id[19]);
    }
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(uuidv7(Date.UTC(2026, 0, 1)).startsWith('019')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });

  it('maps driver errors to domain errors without leaking driver text', () => {
    const cases: [string, unknown][] = [
      ['23505', UniqueViolationError],
      ['23503', ForeignKeyViolationError],
      ['23514', CheckViolationError],
      ['40001', TransactionConflictError],
      ['40P01', TransactionConflictError],
      ['57014', QueryTimeoutError],
      ['08006', DatabaseConnectionError],
      ['ECONNREFUSED', DatabaseConnectionError],
    ];
    for (const [code, expected] of cases) {
      const mapped = mapDatabaseError(pgError(code, 'some_constraint'));
      expect(mapped).toBeInstanceOf(expected);
      expect((mapped as Error).message).not.toContain('secrets');
    }
    // Drizzle wraps driver errors in `cause`.
    expect(
      mapDatabaseError(
        Object.assign(new Error('Failed query: select ... params: 1,2'), {
          cause: pgError('23505', 'uniq'),
        }),
      ),
    ).toMatchObject({ code: 'UNIQUE_VIOLATION', constraint: 'uniq' });
    const plain = new Error('a domain problem');
    expect(mapDatabaseError(plain)).toBe(plain);
    expect(mapDatabaseError(pgError('99999'))).toMatchObject({
      code: 'UNKNOWN_DATABASE_ERROR',
    });
  });

  it('round-trips and rejects pagination cursors', () => {
    const at = new Date('2026-05-05T10:11:12.345Z');
    const id = uuidv7();
    expect(decodeTimeCursor(encodeTimeCursor(at, id))).toEqual({
      t: at.getTime(),
      id,
    });
    expect(decodeSequenceCursor(encodeSequenceCursor(42))).toBe(42);
    for (const bad of [
      '',
      'garbage',
      Buffer.from('{"t":"x","id":"y"}').toString('base64url'),
      Buffer.from('{"t":1,"id":"1; DROP TABLE users"}').toString('base64url'),
    ])
      expect(() => decodeTimeCursor(bad)).toThrow(InvalidCursorError);
    expect(() => decodeSequenceCursor('nope')).toThrow(InvalidCursorError);
    expect([
      clampLimit(undefined),
      clampLimit(0),
      clampLimit(-3),
      clampLimit(7),
      clampLimit(5000),
      clampLimit(1.5),
    ]).toEqual([25, 25, 25, 7, 100, 25]);
  });

  it('derives batting and bowling figures from base counters', () => {
    const s = {
      runs: 300,
      inningsBatted: 12,
      notOuts: 2,
      ballsFaced: 200,
      wickets: 5,
      runsConceded: 60,
      ballsBowled: 30,
    };
    expect(battingAverage(s)).toBe(30);
    expect(strikeRate(s)).toBe(150);
    expect(bowlingAverage(s)).toBe(12);
    expect(economyRate(s)).toBe(12);
    expect(oversBowled(14)).toBe('2.2');
    expect(battingAverage({ ...s, notOuts: 12 })).toBeNull();
    expect(strikeRate({ ...s, ballsFaced: 0 })).toBeNull();
    expect(bowlingAverage({ ...s, wickets: 0 })).toBeNull();
  });

  it('validates static definition ids against game-core', () => {
    const catalog = createDefinitionCatalog();
    expect(catalog.item('item.bat.pro_willow_01').slot).toBe('bat');
    expect(catalog.training('training.batting.timing').cost).toEqual({
      currency: 'coins',
      amount: 60,
    });
    expect(() => catalog.item('item.bat.nope')).toThrow(
      /Unknown item definition/,
    );
    expect(() => catalog.team('team.academy.nope')).toThrow(
      /Unknown team definition/,
    );
  });

  it('parses connection pool settings with conservative defaults', () => {
    const env = parseDatabaseEnvironment({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    });
    expect(env).toMatchObject({
      DATABASE_POOL_MAX: 10,
      DATABASE_STATEMENT_TIMEOUT_MS: 15000,
      DATABASE_SLOW_QUERY_MS: 0,
    });
    expect(() =>
      parseDatabaseEnvironment({ DATABASE_URL: 'mysql://x' }),
    ).toThrow(/PostgreSQL/);
    expect(() =>
      parseDatabaseEnvironment({
        DATABASE_URL: 'postgresql://u:p@localhost/db',
        DATABASE_POOL_MAX: '0',
      }),
    ).toThrow(/DATABASE_POOL_MAX/);
    try {
      parseDatabaseEnvironment({
        DATABASE_URL: 'postgresql://user:hunter2@bad host/db',
      });
    } catch (error) {
      expect((error as Error).message).not.toContain('hunter2');
    }
  });

  it('models exactly the planned tables and no static definition tables', () => {
    const exported = Object.keys(schema).filter(
      (k) => !k.endsWith('Constants'),
    );
    expect(exported.length).toBe(30);
    for (const forbidden of [
      'shots',
      'deliveries',
      'pitches',
      'items',
      'attributeDefinitions',
      'trainingDefinitions',
      'achievementDefinitions',
      'teamStrengths',
    ])
      expect(exported).not.toContain(forbidden);
  });

  it('keeps game logic out of the schema and the web apps away from the database', () => {
    const dir = path.resolve('packages/database/src/schema');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(path.join(dir, file), 'utf8');
      expect(source, file).not.toMatch(
        /\$onUpdate|\$onInsert|xpToNextLevel|ROLE_WEIGHTS|Math\.(random|pow)/,
      );
      expect(source, file).not.toMatch(/@the-cricketer\/game-core/); // schema must not depend on config values
    }
    for (const app of ['web', 'admin', 'game-server']) {
      const manifest = JSON.parse(
        readFileSync(path.resolve(`apps/${app}/package.json`), 'utf8'),
      ) as { dependencies?: Record<string, string> };
      expect(Object.keys(manifest.dependencies ?? {})).not.toContain(
        '@the-cricketer/database',
      );
      expect(Object.keys(manifest.dependencies ?? {})).not.toContain('pg');
    }
  });
});
