import type { Clock } from '@the-cricketer/game-core';
import type { DefinitionCatalog } from '../definitions';
import {
  InvalidInputError,
  mapDatabaseError,
  RecordNotFoundError,
} from '../errors';
import { isUuid } from '../ids';

export interface RepositoryContext {
  readonly catalog: DefinitionCatalog;
  readonly clock: Clock;
}

/**
 * Non-generic base: only error translation. Every public repository method runs through `run`
 * so callers never see raw driver/ORM errors, even outside Database.transaction().
 */
export abstract class Repository {
  protected async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }
}

export function requireRow<T>(
  rows: readonly (T | undefined)[],
  entity: string,
): T {
  const row = rows[0];
  if (row === undefined) throw new RecordNotFoundError(entity);
  return row;
}

export function assertSafeInt(
  value: number,
  field: string,
  bounds: { min?: number; max?: number } = {},
): void {
  const { min = 0, max = Number.MAX_SAFE_INTEGER } = bounds;
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new InvalidInputError(
      `${field} must be an integer between ${min} and ${max}`,
    );
}

export function assertUuid(value: string, field: string): void {
  if (!isUuid(value)) throw new InvalidInputError(`${field} must be a UUID`);
}

export const toNumber = (value: string | number): number => Number(value);
export const toNumberOrNull = (value: string | number | null): number | null =>
  value === null ? null : Number(value);
