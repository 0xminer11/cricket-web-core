import { AppError } from '@the-cricketer/server-kit';
import type { TrainingErrorCode } from '@the-cricketer/shared-types';

/** Codes are constrained to the published TRAINING_ERROR_CODES contract. */
export class TrainingError extends AppError {
  constructor(code: TrainingErrorCode, message: string, statusCode: number) {
    super(code, message, statusCode);
  }
}
export class TrainingNotFoundError extends TrainingError {
  constructor() {
    super('TRAINING_NOT_FOUND', 'That training does not exist.', 404);
  }
}
export class TrainingLockedError extends TrainingError {
  constructor(message = 'That training is locked.') {
    super('TRAINING_LOCKED', message, 403);
  }
}
export class TrainingRoleRestrictedError extends TrainingError {
  constructor() {
    super(
      'TRAINING_ROLE_RESTRICTED',
      'That training is not available for your role.',
      403,
    );
  }
}
export class TrainingStyleRestrictedError extends TrainingError {
  constructor() {
    super(
      'TRAINING_STYLE_RESTRICTED',
      'That training does not suit your bowling style.',
      403,
    );
  }
}
export class TrainingOnCooldownError extends TrainingError {
  constructor() {
    super('TRAINING_ON_COOLDOWN', 'That training is on cooldown.', 409);
  }
}
export class FatigueTooHighError extends TrainingError {
  constructor() {
    super(
      'FATIGUE_TOO_HIGH',
      'You are too tired to train. Rest to recover first.',
      409,
    );
  }
}
export class AlreadyFreshError extends TrainingError {
  constructor() {
    super('ALREADY_FRESH', 'You are already fully rested.', 409);
  }
}
export class InsufficientCurrencyError extends TrainingError {
  constructor() {
    super(
      'INSUFFICIENT_CURRENCY',
      'You do not have enough coins for that training.',
      409,
    );
  }
}
export class SkillMaxedError extends TrainingError {
  constructor() {
    super('SKILL_MAXED', 'Those skills are already at their maximum.', 409);
  }
}
export class TrainingAlreadyProcessedError extends TrainingError {
  constructor() {
    super(
      'TRAINING_ALREADY_PROCESSED',
      'That request key was already used for a different training.',
      422,
    );
  }
}
/** Another change to the same skill landed mid-request; nothing was applied, retrying is safe. */
export class TrainingConflictError extends TrainingError {
  constructor() {
    super(
      'TRAINING_CONFLICT',
      'Your progress changed while training. Please try again.',
      409,
    );
  }
}
/** Deliberately generic: causes are logged with the request id and never returned. */
export class TrainingFailedError extends TrainingError {
  constructor() {
    super(
      'TRAINING_FAILED',
      'We could not complete that training. Please try again.',
      500,
    );
  }
}
