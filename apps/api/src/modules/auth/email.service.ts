import type { AuthLogger } from './auth.types';

export interface VerificationEmail {
  readonly to: string;
  /** Full link containing the raw token (in the URL fragment, so it never reaches server logs). */
  readonly url: string;
  readonly expiresAt: Date;
}
export interface PasswordResetEmail {
  readonly to: string;
  readonly url: string;
  readonly expiresAt: Date;
}

/**
 * Outbound mail port. The auth domain depends on this interface only; Resend, Postmark, SES or
 * SendGrid adapters implement it later with no change to auth code.
 */
export interface EmailService {
  sendVerificationEmail(message: VerificationEmail): Promise<void>;
  sendPasswordResetEmail(message: PasswordResetEmail): Promise<void>;
}

export const verificationUrl = (webBaseUrl: string, token: string): string =>
  `${webBaseUrl}/verify-email#token=${token}`;
export const passwordResetUrl = (webBaseUrl: string, token: string): string =>
  `${webBaseUrl}/reset-password#token=${token}`;

export interface CapturedEmail {
  readonly kind: 'verification' | 'password_reset';
  readonly to: string;
  readonly url: string;
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Development/test adapter: keeps messages in memory (tests and the dev-only inspection
 * endpoint read them) and prints the link to the terminal. It must never be wired up in
 * staging/production; config validation rejects that combination.
 */
export class DevelopmentEmailService implements EmailService {
  private readonly messages: CapturedEmail[] = [];
  constructor(
    private readonly log: AuthLogger,
    private readonly capacity = 100,
  ) {}

  private capture(message: CapturedEmail): Promise<void> {
    this.messages.push(message);
    if (this.messages.length > this.capacity) this.messages.shift();
    this.log.info(
      { to: message.to, url: message.url },
      `[dev email] ${message.kind} link`,
    );
    return Promise.resolve();
  }
  private static tokenOf(url: string): string {
    return url.slice(url.indexOf('#token=') + '#token='.length);
  }
  sendVerificationEmail(message: VerificationEmail): Promise<void> {
    return this.capture({
      kind: 'verification',
      ...message,
      token: DevelopmentEmailService.tokenOf(message.url),
    });
  }
  sendPasswordResetEmail(message: PasswordResetEmail): Promise<void> {
    return this.capture({
      kind: 'password_reset',
      ...message,
      token: DevelopmentEmailService.tokenOf(message.url),
    });
  }
  get outbox(): readonly CapturedEmail[] {
    return this.messages;
  }
  last(kind: CapturedEmail['kind'], to?: string): CapturedEmail | undefined {
    return [...this.messages]
      .reverse()
      .find((m) => m.kind === kind && (to === undefined || m.to === to));
  }
  clear(): void {
    this.messages.length = 0;
  }
}

/** Used when no real provider is configured: drops the message and says so, without the link. */
export class DisabledEmailService implements EmailService {
  constructor(private readonly log: AuthLogger) {}
  private drop(kind: string): Promise<void> {
    this.log.warn(
      { kind },
      'email delivery is not configured; message dropped',
    );
    return Promise.resolve();
  }
  sendVerificationEmail(): Promise<void> {
    return this.drop('verification');
  }
  sendPasswordResetEmail(): Promise<void> {
    return this.drop('password_reset');
  }
}
