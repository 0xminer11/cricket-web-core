import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { timestamp, uuid } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { DEFINITION_ID_PATTERN } from '../enums';
import { uuidv7 } from '../ids';

/** UUID primary key: app-generated UUIDv7, gen_random_uuid() as SQL-level fallback. */
export const pk = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`)
    .$defaultFn(uuidv7);

export const uuidRef = (name: string) => uuid(name);

/**
 * All timestamps are TIMESTAMPTZ(3): stored as UTC instants, millisecond precision so JS
 * Dates round-trip losslessly (required for stable cursor pagination).
 */
export const ts = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3, mode: 'date' });
export const createdAt = () => ts('created_at').notNull().defaultNow();
/** Kept current by the touch_updated_at() trigger (migration 0001), not by ORM hooks. */
export const updatedAt = () => ts('updated_at').notNull().defaultNow();

const quote = (v: string): string => `'${v.replaceAll("'", "''")}'`;
/** `col IN ('a','b')` from a constant list (DDL cannot use bind parameters). */
export const inList = (col: AnyPgColumn, list: readonly string[]): SQL =>
  sql`${col} IN (${sql.raw(list.map(quote).join(', '))})`;
export const range = (col: AnyPgColumn, min: number, max: number): SQL =>
  sql`${col} BETWEEN ${sql.raw(String(min))} AND ${sql.raw(String(max))}`;
export const nonNegative = (col: AnyPgColumn): SQL => sql`${col} >= 0`;
export const positive = (col: AnyPgColumn): SQL => sql`${col} > 0`;
/** Static Module 0 definition IDs: namespaced lower snake-case, e.g. item.bat.pro_willow_01. */
export const definitionId = (col: AnyPgColumn): SQL =>
  sql`${col} ~ ${sql.raw(quote(DEFINITION_ID_PATTERN))}`;
export const definitionIdIn = (col: AnyPgColumn, prefix: string): SQL =>
  sql`${col} ~ ${sql.raw(quote(`^${prefix}\\.[a-z0-9_.]+$`))}`;
/** Nullable-aware "either both or neither" helper. */
export const iff = (a: SQL, b: SQL): SQL => sql`((${a}) = (${b}))`;
