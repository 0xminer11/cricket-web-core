import { ApiClientError } from '../../../services/api';

export type ErrorContext = 'default' | 'change-password';

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password.',
  AUTH_REQUIRED: 'Session expired. Please sign in again.',
  ACCOUNT_SUSPENDED: 'Account is temporarily unavailable.',
  ACCOUNT_DELETED: 'Account is temporarily unavailable.',
  EMAIL_ALREADY_IN_USE:
    'An account with this email already exists. Try signing in instead.',
  ALREADY_REGISTERED: 'This account is already registered.',
  INVALID_EMAIL: 'Enter a valid email address.',
  WEAK_PASSWORD: 'Choose a password with at least 10 characters.',
  INVALID_VERIFICATION_TOKEN: 'This verification link is invalid.',
  VERIFICATION_TOKEN_EXPIRED:
    'This verification link has expired. Request a new one from your account page.',
  INVALID_RESET_TOKEN:
    'This reset link is invalid or has already been used. Request a new one.',
  RESET_TOKEN_EXPIRED: 'This reset link has expired. Request a new one.',
  GUEST_UPGRADE_REQUIRED: 'Create an account to use this feature.',
  REGISTERED_ACCOUNT_REQUIRED: 'Create an account to use this feature.',
  CSRF_ORIGIN_INVALID:
    'This request was blocked for your protection. Reload the page and try again.',
  NETWORK_ERROR:
    'Could not reach the server. Check your connection and try again.',
  CONFIGURATION_ERROR: 'The game is not configured correctly. Try again later.',
};

/** Turns any thrown value into text that is safe and useful to show. Never echoes server internals. */
export function describeAuthError(
  error: unknown,
  context: ErrorContext = 'default',
): string {
  if (!(error instanceof ApiClientError))
    return 'Something went wrong. Please try again.';
  if (error.code === 'RATE_LIMITED') {
    const minutes = error.retryAfterSeconds
      ? Math.max(1, Math.ceil(error.retryAfterSeconds / 60))
      : undefined;
    return minutes
      ? `Too many attempts. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
      : 'Too many attempts. Try again later.';
  }
  if (context === 'change-password' && error.code === 'INVALID_CREDENTIALS')
    return 'Your current password is incorrect.';
  return MESSAGES[error.code] ?? 'Something went wrong. Please try again.';
}
