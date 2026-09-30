import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { InvalidCursorError } from './errors';
import { isUuid } from './ids';

export interface PageRequest {
  readonly limit?: number;
  /** Opaque token from a previous page's nextCursor. */
  readonly cursor?: string | undefined;
}
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export function clampLimit(
  limit: number | undefined,
  max = MAX_PAGE_SIZE,
): number {
  if (limit === undefined) return Math.min(DEFAULT_PAGE_SIZE, max);
  if (!Number.isInteger(limit) || limit < 1)
    return Math.min(DEFAULT_PAGE_SIZE, max);
  return Math.min(limit, max);
}

interface TimeKey {
  readonly t: number;
  readonly id: string;
}
export const encodeTimeCursor = (createdAt: Date, id: string): string =>
  Buffer.from(
    JSON.stringify({ t: createdAt.getTime(), id } satisfies TimeKey),
  ).toString('base64url');

export function decodeTimeCursor(cursor: string): TimeKey {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      't' in parsed &&
      'id' in parsed &&
      typeof parsed.t === 'number' &&
      Number.isFinite(parsed.t) &&
      typeof parsed.id === 'string' &&
      isUuid(parsed.id)
    )
      return { t: parsed.t, id: parsed.id };
  } catch {
    // fall through
  }
  throw new InvalidCursorError();
}

export const encodeSequenceCursor = (sequence: number): string =>
  Buffer.from(JSON.stringify({ s: sequence })).toString('base64url');
export function decodeSequenceCursor(cursor: string): number {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      's' in parsed &&
      typeof parsed.s === 'number' &&
      Number.isInteger(parsed.s) &&
      parsed.s >= 0
    )
      return parsed.s;
  } catch {
    // fall through
  }
  throw new InvalidCursorError();
}

/**
 * Keyset condition for `ORDER BY created_at DESC, id DESC`: rows strictly after the cursor.
 * Timestamps are TIMESTAMPTZ(3) so millisecond cursors are lossless.
 */
export function keysetDesc(
  createdAt: AnyPgColumn,
  id: AnyPgColumn,
  cursor: string | undefined,
): SQL | undefined {
  if (!cursor) return undefined;
  const key = decodeTimeCursor(cursor);
  return sql`(${createdAt}, ${id}) < (${new Date(key.t).toISOString()}::timestamptz, ${key.id}::uuid)`;
}
export function keysetAsc(
  createdAt: AnyPgColumn,
  id: AnyPgColumn,
  cursor: string | undefined,
): SQL | undefined {
  if (!cursor) return undefined;
  const key = decodeTimeCursor(cursor);
  return sql`(${createdAt}, ${id}) > (${new Date(key.t).toISOString()}::timestamptz, ${key.id}::uuid)`;
}

/** Turn `limit + 1` fetched rows into a page. */
export function toPage<T>(
  rows: readonly T[],
  limit: number,
  cursorOf: (row: T) => string,
): Page<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      rows.length > limit && last !== undefined ? cursorOf(last) : null,
  };
}
