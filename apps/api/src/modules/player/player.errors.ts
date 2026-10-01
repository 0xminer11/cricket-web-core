import { AppError } from '@the-cricketer/server-kit';
import type { PlayerErrorCode } from '@the-cricketer/shared-types';

/** Base class: codes are constrained to the published PLAYER_ERROR_CODES contract. */
export class PlayerError extends AppError {
  constructor(code: PlayerErrorCode, message: string, statusCode: number) {
    super(code, message, statusCode);
  }
}
export class CricketerAlreadyExistsError extends PlayerError {
  constructor() {
    super('CRICKETER_ALREADY_EXISTS', 'You already have a cricketer.', 409);
  }
}
export class CricketerNotFoundError extends PlayerError {
  constructor() {
    super('CRICKETER_NOT_FOUND', 'You have not created a cricketer yet.', 404);
  }
}
export class InvalidPlayerNameError extends PlayerError {
  constructor(message = 'Choose a different name.') {
    super('INVALID_PLAYER_NAME', message, 400);
  }
}
/** A creation choice refused by the Module 0 rules (country, role, style, appearance...). */
export class CreationChoiceError extends PlayerError {
  constructor(code: PlayerErrorCode, message: string) {
    super(code, message, 400);
  }
}
export class IdempotencyKeyReusedError extends PlayerError {
  constructor() {
    super(
      'IDEMPOTENCY_KEY_REUSED',
      'That request key was already used for a different cricketer.',
      422,
    );
  }
}
export class CreationConfigChangedError extends PlayerError {
  constructor() {
    super(
      'CREATION_CONFIG_CHANGED',
      'The available options changed. Review your choices and try again.',
      409,
    );
  }
}
/** Deliberately generic: persistence details never reach clients (they are logged with the request id). */
export class PlayerCreationFailedError extends PlayerError {
  constructor() {
    super(
      'PLAYER_CREATION_FAILED',
      'We could not create your cricketer. Please try again.',
      500,
    );
  }
}

// ---- Module 5: equipment and appearance -------------------------------------------------------
/** Also returned for another player's item and for unknown ids: ownership is never revealed. */
export class ItemNotOwnedError extends PlayerError {
  constructor() {
    super('ITEM_NOT_OWNED', 'You do not own that item.', 404);
  }
}
export class InvalidEquipmentSlotError extends PlayerError {
  constructor() {
    super(
      'INVALID_EQUIPMENT_SLOT',
      'That equipment slot is not available.',
      400,
    );
  }
}
export class ItemSlotMismatchError extends PlayerError {
  constructor() {
    super('ITEM_SLOT_MISMATCH', 'That item does not fit this slot.', 409);
  }
}
export class ItemUnavailableError extends PlayerError {
  constructor() {
    super('ITEM_UNAVAILABLE', 'That item cannot be equipped right now.', 409);
  }
}
export class ItemRequirementNotMetError extends PlayerError {
  constructor(level: number) {
    super('ITEM_REQUIREMENT_NOT_MET', `Requires level ${level}.`, 403);
  }
}
