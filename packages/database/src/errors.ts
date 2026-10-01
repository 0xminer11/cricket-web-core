/**
 * Domain-facing persistence errors. Raw driver/ORM errors (which can embed SQL, parameters or
 * connection details) never leave this package: callers get these stable codes instead.
 * Messages are generic; the optional `constraint` is a schema identifier, never user data.
 */
export type PersistenceErrorCode =
  | 'UNIQUE_VIOLATION'
  | 'FOREIGN_KEY_VIOLATION'
  | 'CHECK_VIOLATION'
  | 'NOT_NULL_VIOLATION'
  | 'NOT_FOUND'
  | 'TRANSACTION_CONFLICT'
  | 'CONNECTION_ERROR'
  | 'QUERY_TIMEOUT'
  | 'INSUFFICIENT_BALANCE'
  | 'OWNERSHIP_VIOLATION'
  | 'INVALID_STATE_TRANSITION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'UNKNOWN_DEFINITION'
  | 'INVALID_INPUT'
  | 'INVALID_CURSOR'
  | 'STALE_WRITE'
  | 'INTEGRITY_ERROR'
  | 'UNKNOWN_DATABASE_ERROR';

export class PersistenceError extends Error {
  constructor(
    readonly code: PersistenceErrorCode,
    message: string,
    readonly constraint?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
export class UniqueViolationError extends PersistenceError {
  constructor(constraint?: string) {
    super('UNIQUE_VIOLATION', 'Record already exists', constraint);
  }
}
export class ForeignKeyViolationError extends PersistenceError {
  constructor(constraint?: string) {
    super(
      'FOREIGN_KEY_VIOLATION',
      'Referenced record does not exist or is in use',
      constraint,
    );
  }
}
export class CheckViolationError extends PersistenceError {
  constructor(constraint?: string) {
    super(
      'CHECK_VIOLATION',
      'Value violates a data integrity rule',
      constraint,
    );
  }
}
export class NotNullViolationError extends PersistenceError {
  constructor(constraint?: string) {
    super('NOT_NULL_VIOLATION', 'A required value is missing', constraint);
  }
}
export class RecordNotFoundError extends PersistenceError {
  constructor(entity: string) {
    super('NOT_FOUND', `${entity} not found`);
  }
}
export class TransactionConflictError extends PersistenceError {
  constructor() {
    super(
      'TRANSACTION_CONFLICT',
      'Concurrent update conflict; retry the operation',
    );
  }
}
export class DatabaseConnectionError extends PersistenceError {
  constructor() {
    super('CONNECTION_ERROR', 'Database unavailable');
  }
}
export class QueryTimeoutError extends PersistenceError {
  constructor() {
    super('QUERY_TIMEOUT', 'Database operation timed out');
  }
}
export class InsufficientBalanceError extends PersistenceError {
  constructor() {
    super('INSUFFICIENT_BALANCE', 'Insufficient balance');
  }
}
/** The addressed row does not belong to the acting player. Deliberately indistinguishable from missing. */
export class OwnershipViolationError extends PersistenceError {
  constructor(entity: string) {
    super('OWNERSHIP_VIOLATION', `${entity} not found for this player`);
  }
}
export class InvalidStateTransitionError extends PersistenceError {
  constructor(entity: string, from: string, to: string) {
    super(
      'INVALID_STATE_TRANSITION',
      `${entity} cannot move from ${from} to ${to}`,
    );
  }
}
export class IdempotencyConflictError extends PersistenceError {
  constructor() {
    super(
      'IDEMPOTENCY_CONFLICT',
      'Idempotency key was already used for a different operation',
    );
  }
}
export class UnknownDefinitionError extends PersistenceError {
  constructor(kind: string, id: string) {
    super('UNKNOWN_DEFINITION', `Unknown ${kind} definition: ${id}`);
  }
}
export class InvalidInputError extends PersistenceError {
  constructor(message: string) {
    super('INVALID_INPUT', message);
  }
}
export class InvalidCursorError extends PersistenceError {
  constructor() {
    super('INVALID_CURSOR', 'Invalid pagination cursor');
  }
}
/** Optimistic-concurrency check failed: the row changed since it was read. */
export class StaleWriteError extends PersistenceError {
  constructor(entity: string) {
    super('STALE_WRITE', `${entity} was modified concurrently`);
  }
}
/** A stored aggregate disagrees with the records it summarises (detected, never auto-fixed). */
export class IntegrityError extends PersistenceError {
  constructor(message: string) {
    super('INTEGRITY_ERROR', message);
  }
}
export class UnknownDatabaseError extends PersistenceError {
  constructor(readonly sqlState?: string) {
    super('UNKNOWN_DATABASE_ERROR', 'Database operation failed');
  }
}

interface PgErrorShape {
  code?: unknown;
  constraint?: unknown;
  errno?: unknown;
}

/**
 * Driver error codes are 5-character SQLSTATEs ('23505') or bare Node system errors
 * ('ECONNREFUSED'). Application errors also carry a string `code` (e.g. 'RATE_LIMITED'); the
 * pattern keeps those from being mistaken for database failures when they are thrown inside a
 * transaction callback.
 */
const DRIVER_CODE = /^(?:[0-9A-Z]{5}|E[A-Z]+)$/;

/** Find the driver-level error (Drizzle wraps pg errors as `cause`). */
function findDriverError(error: unknown): PgErrorShape | undefined {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && typeof current === 'object' && current !== null;
    depth += 1
  ) {
    const candidate = current as PgErrorShape & { cause?: unknown };
    if (typeof candidate.code === 'string' && DRIVER_CODE.test(candidate.code))
      return candidate;
    current = candidate.cause;
  }
  return undefined;
}

/**
 * Translate any thrown value. PersistenceErrors pass through; errors that are not database
 * errors at all (programmer/domain errors thrown inside a transaction callback) are returned
 * unchanged so callers can still see them.
 */
export function mapDatabaseError(error: unknown): unknown {
  if (error instanceof PersistenceError) return error;
  const driver = findDriverError(error);
  if (!driver || typeof driver.code !== 'string') return error;
  const code = driver.code;
  const constraint =
    typeof driver.constraint === 'string' ? driver.constraint : undefined;
  switch (code) {
    case '23505':
      return new UniqueViolationError(constraint);
    case '23503':
      return new ForeignKeyViolationError(constraint);
    case '23514':
      return new CheckViolationError(constraint);
    case '23502':
      return new NotNullViolationError(constraint);
    case '22P02': // invalid_text_representation (e.g. malformed uuid)
    case '22003': // numeric_value_out_of_range
    case '22001': // string_data_right_truncation
      return new InvalidInputError(
        'Value has an invalid format or is out of range',
      );
    case '40001': // serialization_failure
    case '40P01': // deadlock_detected
      return new TransactionConflictError();
    case '57014': // query_canceled (statement_timeout)
    case '25P03': // idle_in_transaction_session_timeout
      return new QueryTimeoutError();
    case '55000': // object_not_in_prerequisite_state (append-only / ledger guard triggers)
      return new IntegrityError('Operation is not permitted on this record');
    default:
      break;
  }
  if (
    code.startsWith('08') || // connection_exception class
    code === '57P01' || // admin_shutdown
    code === '57P02' ||
    code === '57P03' || // cannot_connect_now
    code === '53300' || // too_many_connections
    ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE'].includes(
      code,
    )
  )
    return new DatabaseConnectionError();
  return new UnknownDatabaseError(code);
}

export const isUniqueViolation = (
  error: unknown,
  constraint?: string,
): boolean => {
  const mapped = mapDatabaseError(error);
  return (
    mapped instanceof UniqueViolationError &&
    (constraint === undefined || mapped.constraint === constraint)
  );
};
