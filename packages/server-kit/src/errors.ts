export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class ValidationError extends AppError {
  constructor(message = 'Invalid request') {
    super('VALIDATION_ERROR', message, 400);
  }
}
export class UnauthorizedError extends AppError {
  constructor() {
    super('UNAUTHORIZED', 'Authentication required', 401);
  }
}
export class ForbiddenError extends AppError {
  constructor() {
    super('FORBIDDEN', 'Access denied', 403);
  }
}
export class NotFoundError extends AppError {
  constructor() {
    super('NOT_FOUND', 'Resource not found', 404);
  }
}
export class ConflictError extends AppError {
  constructor() {
    super('CONFLICT', 'Resource conflict', 409);
  }
}
export class InternalServerError extends AppError {
  constructor() {
    super('INTERNAL_ERROR', 'Internal server error', 500);
  }
}
/** 429 with a Retry-After hint (seconds). The generic message reveals nothing about which limit tripped. */
export class RateLimitedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }
}
