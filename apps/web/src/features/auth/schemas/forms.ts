import {
  DEFAULT_PASSWORD_MIN_LENGTH,
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '@the-cricketer/shared-types';

/**
 * Client-side form checks: instant feedback only. The server re-validates everything and is
 * authoritative (including a possibly stricter minimum password length).
 */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL.test(email))
    return 'Enter a valid email address.';
  return undefined;
}
export function validateNewPassword(value: string): string | undefined {
  if (value.length < DEFAULT_PASSWORD_MIN_LENGTH)
    return `Use at least ${DEFAULT_PASSWORD_MIN_LENGTH} characters. Spaces and passphrases are welcome.`;
  if (value.length > PASSWORD_MAX_LENGTH)
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  return undefined;
}
export function validateConfirmation(
  password: string,
  confirmation: string,
): string | undefined {
  return password === confirmation ? undefined : 'Passwords do not match.';
}

export type LoginField = 'email' | 'password';
export function validateLogin(input: {
  email: string;
  password: string;
}): FieldErrors<LoginField> {
  const errors: FieldErrors<LoginField> = {};
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  if (!input.password) errors.password = 'Enter your password.';
  return errors;
}

export type RegisterField = 'email' | 'password' | 'confirmPassword';
export function validateRegistration(input: {
  email: string;
  password: string;
  confirmPassword: string;
}): FieldErrors<RegisterField> {
  const errors: FieldErrors<RegisterField> = {};
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  const password = validateNewPassword(input.password);
  if (password) errors.password = password;
  else {
    const confirm = validateConfirmation(input.password, input.confirmPassword);
    if (confirm) errors.confirmPassword = confirm;
  }
  return errors;
}

export type ResetField = 'newPassword' | 'confirmPassword';
export function validateReset(input: {
  newPassword: string;
  confirmPassword: string;
}): FieldErrors<ResetField> {
  const errors: FieldErrors<ResetField> = {};
  const password = validateNewPassword(input.newPassword);
  if (password) errors.newPassword = password;
  else {
    const confirm = validateConfirmation(
      input.newPassword,
      input.confirmPassword,
    );
    if (confirm) errors.confirmPassword = confirm;
  }
  return errors;
}

export type ChangeField = 'currentPassword' | 'newPassword' | 'confirmPassword';
export function validateChange(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): FieldErrors<ChangeField> {
  const errors: FieldErrors<ChangeField> = {};
  if (!input.currentPassword)
    errors.currentPassword = 'Enter your current password.';
  const password = validateNewPassword(input.newPassword);
  if (password) errors.newPassword = password;
  else {
    const confirm = validateConfirmation(
      input.newPassword,
      input.confirmPassword,
    );
    if (confirm) errors.confirmPassword = confirm;
  }
  return errors;
}
