import { AppError } from '@the-cricketer/server-kit';
import type { CareerErrorCode } from '@the-cricketer/shared-types';

/** Codes are constrained to the published CAREER_ERROR_CODES contract. Messages are player-safe. */
export class CareerError extends AppError {
  constructor(code: CareerErrorCode, message: string, statusCode: number) {
    super(code, message, statusCode);
  }
}
export class CareerNotInitializedError extends CareerError {
  constructor() {
    super(
      'CAREER_NOT_INITIALIZED',
      'Your career is not ready yet. Please try again in a moment.',
      409,
    );
  }
}
export class FixtureNotFoundError extends CareerError {
  constructor() {
    super('FIXTURE_NOT_FOUND', 'That fixture was not found.', 404);
  }
}
export class CareerEventNotFoundError extends CareerError {
  constructor() {
    super('CAREER_EVENT_NOT_FOUND', 'That career event was not found.', 404);
  }
}
export class OnboardingStepUnknownError extends CareerError {
  constructor() {
    super('ONBOARDING_STEP_UNKNOWN', 'Unknown onboarding step.', 400);
  }
}
/** Deliberately generic: the underlying failure is logged with the request id, never returned. */
export class CareerDataUnavailableError extends CareerError {
  constructor() {
    super(
      'CAREER_DATA_UNAVAILABLE',
      'We could not load your career right now. Please try again.',
      503,
    );
  }
}
