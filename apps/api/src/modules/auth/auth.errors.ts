import { AppError } from '@the-cricketer/server-kit';
import type { AuthErrorCode } from '@the-cricketer/shared-types';

/** Base class: the code is constrained to the published AUTH_ERROR_CODES contract. */
export class AuthError extends AppError {
  constructor(code: AuthErrorCode, message: string, statusCode: number) {
    super(code, message, statusCode);
  }
}

export class AuthRequiredError extends AuthError {
  constructor() {
    super('AUTH_REQUIRED', 'Authentication required.', 401);
  }
}
/** One message for unknown email, wrong password and deleted accounts: no account enumeration. */
export class InvalidCredentialsError extends AuthError {
  constructor(message = 'Invalid email or password.', statusCode = 401) {
    super('INVALID_CREDENTIALS', message, statusCode);
  }
}
export class AccountSuspendedError extends AuthError {
  constructor() {
    super('ACCOUNT_SUSPENDED', 'Account is temporarily unavailable.', 403);
  }
}
export class AccountDeletedError extends AuthError {
  constructor() {
    super('ACCOUNT_DELETED', 'This account is no longer available.', 403);
  }
}
export class EmailAlreadyInUseError extends AuthError {
  constructor() {
    super(
      'EMAIL_ALREADY_IN_USE',
      'An account with this email already exists.',
      409,
    );
  }
}
export class AlreadyRegisteredError extends AuthError {
  constructor() {
    super('ALREADY_REGISTERED', 'This account is already registered.', 409);
  }
}
export class InvalidEmailError extends AuthError {
  constructor() {
    super('INVALID_EMAIL', 'Enter a valid email address.', 400);
  }
}
export class WeakPasswordError extends AuthError {
  constructor(message: string) {
    super('WEAK_PASSWORD', message, 400);
  }
}
export class InvalidVerificationTokenError extends AuthError {
  constructor() {
    super(
      'INVALID_VERIFICATION_TOKEN',
      'This verification link is invalid.',
      400,
    );
  }
}
export class VerificationTokenExpiredError extends AuthError {
  constructor() {
    super(
      'VERIFICATION_TOKEN_EXPIRED',
      'This verification link has expired. Request a new one.',
      400,
    );
  }
}
export class InvalidResetTokenError extends AuthError {
  constructor() {
    super('INVALID_RESET_TOKEN', 'This reset link is invalid.', 400);
  }
}
export class ResetTokenExpiredError extends AuthError {
  constructor() {
    super(
      'RESET_TOKEN_EXPIRED',
      'This reset link has expired. Request a new one.',
      400,
    );
  }
}
export class GuestUpgradeRequiredError extends AuthError {
  constructor() {
    super(
      'GUEST_UPGRADE_REQUIRED',
      'Create an account to use this feature.',
      403,
    );
  }
}
export class RegisteredAccountRequiredError extends AuthError {
  constructor() {
    super(
      'REGISTERED_ACCOUNT_REQUIRED',
      'A registered account is required.',
      403,
    );
  }
}
export class CsrfOriginError extends AuthError {
  constructor() {
    super('CSRF_ORIGIN_INVALID', 'Request origin is not allowed.', 403);
  }
}
