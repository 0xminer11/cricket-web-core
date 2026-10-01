import { createHash, randomBytes } from 'node:crypto';
import type {
  AuthTokenPurpose,
  AuthTokenRecord,
  Repositories,
} from '@the-cricketer/database';
import type { Clock } from '@the-cricketer/game-core';
import {
  InvalidResetTokenError,
  InvalidVerificationTokenError,
  ResetTokenExpiredError,
  VerificationTokenExpiredError,
} from './auth.errors';

/** Source of opaque secrets. Production uses CSPRNG bytes; tests may inject a predictable one. */
export interface TokenGenerator {
  generate(): string;
}
/** 256 bits from the platform CSPRNG, base64url (43 characters, no padding). */
export class SecureTokenGenerator implements TokenGenerator {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }
}

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const isWellFormedToken = (raw: unknown): raw is string =>
  typeof raw === 'string' && TOKEN_PATTERN.test(raw);

/**
 * SHA-256 of a high-entropy random token. A fast hash is correct here (and a slow password hash
 * would be pointless): the input has 256 bits of entropy, so brute force is infeasible, and the
 * lookup must be cheap because it runs on every authenticated request. Passwords are low
 * entropy and use Argon2id instead (see password.service.ts).
 */
export const hashToken = (raw: string): string =>
  createHash('sha256').update(raw, 'utf8').digest('hex');

export type TokenInspection =
  | { readonly state: 'valid'; readonly record: AuthTokenRecord }
  | { readonly state: 'used'; readonly record: AuthTokenRecord }
  | { readonly state: 'expired'; readonly record: AuthTokenRecord }
  | { readonly state: 'invalid' };

export interface TokenServiceOptions {
  readonly generator: TokenGenerator;
  readonly clock: Clock;
  readonly verificationTtlSeconds: number;
  readonly resetTtlSeconds: number;
}

/**
 * Email-verification and password-reset tokens: random, hashed at rest, purpose-bound, expiring
 * and single-use. The raw value exists only in the email link.
 */
export class TokenService {
  constructor(private readonly options: TokenServiceOptions) {}

  /** Issue a token (retiring earlier ones for the same user/purpose). Returns the raw secret once. */
  async issue(
    repos: Repositories,
    input: {
      readonly userId: string;
      readonly purpose: AuthTokenPurpose;
      readonly emailNormalized?: string;
    },
  ): Promise<{ raw: string; record: AuthTokenRecord }> {
    const now = this.options.clock.now();
    const ttl =
      input.purpose === 'email_verification'
        ? this.options.verificationTtlSeconds
        : this.options.resetTtlSeconds;
    const raw = this.options.generator.generate();
    const record = await repos.authTokens.issue({
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: hashToken(raw),
      ...(input.emailNormalized
        ? { emailNormalized: input.emailNormalized }
        : {}),
      now,
      expiresAt: new Date(now.getTime() + ttl * 1000),
    });
    return { raw, record };
  }

  /** Read-only classification. The purpose is part of the lookup, so tokens never cross over. */
  async inspect(
    repos: Repositories,
    raw: string,
    purpose: AuthTokenPurpose,
  ): Promise<TokenInspection> {
    if (!isWellFormedToken(raw)) return { state: 'invalid' };
    const record = await repos.authTokens.findByTokenHash(
      hashToken(raw),
      purpose,
    );
    if (!record) return { state: 'invalid' };
    if (record.consumedAt) return { state: 'used', record };
    if (record.expiresAt.getTime() <= this.options.clock.now().getTime())
      return { state: 'expired', record };
    return { state: 'valid', record };
  }

  /** Spend a valid token. The conditional UPDATE decides races: only one caller gets `true`. */
  consume(repos: Repositories, record: AuthTokenRecord): Promise<boolean> {
    return repos.authTokens.consume(record.id, this.options.clock.now());
  }

  /** Throw the purpose-specific error for a token that cannot be redeemed. */
  static reject(
    purpose: AuthTokenPurpose,
    state: 'invalid' | 'used' | 'expired',
  ): never {
    if (purpose === 'email_verification')
      throw state === 'expired'
        ? new VerificationTokenExpiredError()
        : new InvalidVerificationTokenError();
    throw state === 'expired'
      ? new ResetTokenExpiredError()
      : new InvalidResetTokenError();
  }
}
