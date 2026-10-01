import { z } from 'zod';

/**
 * Authentication contracts shared by the API and the web client. Policy numbers that the server
 * can tune (minimum password length) are factories; the server stays authoritative.
 */
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MAX_LENGTH = 128;
export const DEFAULT_PASSWORD_MIN_LENGTH = 10;
/** Generous cap for opaque tokens in request bodies; real tokens are 43 characters. */
export const TOKEN_MAX_LENGTH = 256;

export const ACCOUNT_TYPES = ['guest', 'registered'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Stable machine-readable codes. Messages may change; codes are the contract. */
export const AUTH_ERROR_CODES = [
  'AUTH_REQUIRED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_DELETED',
  'EMAIL_ALREADY_IN_USE',
  'ALREADY_REGISTERED',
  'INVALID_EMAIL',
  'WEAK_PASSWORD',
  'INVALID_VERIFICATION_TOKEN',
  'VERIFICATION_TOKEN_EXPIRED',
  'INVALID_RESET_TOKEN',
  'RESET_TOKEN_EXPIRED',
  'RATE_LIMITED',
  'GUEST_UPGRADE_REQUIRED',
  'REGISTERED_ACCOUNT_REQUIRED',
  'CSRF_ORIGIN_INVALID',
  'VALIDATION_ERROR',
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(EMAIL_MAX_LENGTH)
  .pipe(z.email());
/** Passwords are never trimmed or normalised: spaces and password-manager output are valid. */
export const newPasswordSchema = (
  minLength: number = DEFAULT_PASSWORD_MIN_LENGTH,
) => z.string().min(minLength).max(PASSWORD_MAX_LENGTH);
const tokenSchema = z.string().min(1).max(TOKEN_MAX_LENGTH);

export const registerRequestSchema = (minLength?: number) =>
  z.strictObject({
    email: emailSchema,
    password: newPasswordSchema(minLength),
  });
export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export const forgotPasswordRequestSchema = z.strictObject({
  email: emailSchema,
});
export const resetPasswordRequestSchema = (minLength?: number) =>
  z.strictObject({
    token: tokenSchema,
    newPassword: newPasswordSchema(minLength),
  });
export const changePasswordRequestSchema = (minLength?: number) =>
  z.strictObject({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: newPasswordSchema(minLength),
  });
export const verifyEmailRequestSchema = z.strictObject({ token: tokenSchema });
export const emptyRequestSchema = z.strictObject({});

export type RegisterRequest = z.infer<ReturnType<typeof registerRequestSchema>>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** The only account data the API returns about the caller. */
export const currentUserSchema = z.object({
  id: z.uuid(),
  accountType: z.enum(ACCOUNT_TYPES),
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  hasCricketer: z.boolean(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;
export const userEnvelopeSchema = z.object({ user: currentUserSchema });
export const messageSchema = z.object({ message: z.string() });
export const verifyEmailResultSchema = z.object({
  verified: z.literal(true),
  alreadyVerified: z.boolean(),
});
export const sessionSummarySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  current: z.boolean(),
  device: z.string().nullable(),
});
export const sessionListSchema = z.object({
  sessions: z.array(sessionSummarySchema),
});
