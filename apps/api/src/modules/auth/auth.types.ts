import type {
  AccountType,
  AuthProviderId,
  UserRecord,
} from '@the-cricketer/database';

export type { AccountType };

/**
 * Coarse authorisation roles for player accounts. Deliberately a single value: staff/admin
 * access is NOT a flag on a player account. It will be a separate, explicitly granted,
 * strongly-authenticated, audited concept (see docs/auth/security.md).
 */
export const ACCOUNT_ROLES = ['player'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** Everything a route handler may know about the caller. Never carries the ORM user row. */
export interface AuthContext {
  readonly userId: string;
  readonly sessionId: string;
  readonly accountType: AccountType;
  readonly roles: readonly AccountRole[];
}

/** Structural logger (pino-compatible); never receives secrets. */
export interface AuthLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

/** Per-request facts the service needs, independent of Fastify. */
export interface RequestMeta {
  readonly requestId: string;
  readonly ip: string;
  readonly userAgent: string | undefined;
  readonly log: AuthLogger;
}

/** A freshly issued session. `token` goes into the cookie and nowhere else. */
export interface IssuedSession {
  readonly token: string;
  readonly maxAgeSeconds: number;
}

/**
 * Login methods plug in behind this. Today: email/password. Later: Google, Apple, passkeys,
 * magic links. A provider only proves "who is this?"; account linking, session issuance and
 * status checks stay in AuthService so every provider applies identical rules.
 */
export interface AuthProvider<TCredentials> {
  readonly id: AuthProviderId;
  authenticate(credentials: TCredentials): Promise<ProviderAuthResult>;
}
/** `reason` is for internal logs only; the API answers every failure identically. */
export type ProviderAuthResult =
  | {
      readonly ok: true;
      readonly provider: AuthProviderId;
      readonly user: UserRecord;
      /** Set when the stored credential uses outdated parameters and should be replaced. */
      readonly upgradedPasswordHash?: string;
    }
  | {
      readonly ok: false;
      readonly reason: 'unknown_identity' | 'bad_password';
      /** Known account behind a failed attempt (for the audit trail), if any. */
      readonly userId?: string;
    };

/**
 * FUTURE (types only): short-lived signed token the API will mint for the realtime game server
 * (POST /api/v1/game/session-token). The game server verifies the signature and never sees the
 * long-lived session cookie. See docs/auth/security.md.
 */
export interface GameConnectionTokenClaims {
  readonly sub: string;
  readonly sid: string;
  readonly aud: 'game-server';
  readonly iat: number;
  /** 1-5 minutes after iat. */
  readonly exp: number;
  readonly jti: string;
}
export interface GameConnectionTokenIssuer {
  issue(context: AuthContext): Promise<{ token: string; expiresAt: Date }>;
}
