import type { AuthEnvironment } from '@the-cricketer/config';
import {
  InvalidStateTransitionError,
  RecordNotFoundError,
  UniqueViolationError,
} from '@the-cricketer/database';
import type {
  Database,
  Repositories,
  UserOrigin,
} from '@the-cricketer/database';
import type { Clock } from '@the-cricketer/game-core';
import { RateLimitedError } from '@the-cricketer/server-kit';
import type { CurrentUser } from '@the-cricketer/shared-types';
import {
  AlreadyRegisteredError,
  AuthRequiredError,
  AccountSuspendedError,
  EmailAlreadyInUseError,
  GuestUpgradeRequiredError,
  InvalidCredentialsError,
  InvalidResetTokenError,
  InvalidVerificationTokenError,
  WeakPasswordError,
} from './auth.errors';
import { cleanupAuthData } from './auth.cleanup';
import type { AuthTelemetry } from './auth.telemetry';
import type { AuthContext, IssuedSession, RequestMeta } from './auth.types';
import type { EmailService } from './email.service';
import { passwordResetUrl, verificationUrl } from './email.service';
import {
  hashIdentifier,
  normalizeEmail,
  summarizeUserAgent,
} from './identifiers';
import type { PasswordService } from './password.service';
import { EmailPasswordProvider } from './providers/email-password.provider';
import type { AuthRateLimiter } from './rate-limit';
import type { SessionService } from './session.service';
import { TokenService } from './token.service';

export interface AuthServiceDeps {
  readonly database: Database;
  readonly passwords: PasswordService;
  readonly sessions: SessionService;
  readonly tokens: TokenService;
  readonly email: EmailService;
  readonly limiter: AuthRateLimiter;
  readonly telemetry: AuthTelemetry;
  readonly clock: Clock;
  readonly config: AuthEnvironment;
  /** Stamped on new users so development/test rows can never be mistaken for real ones. */
  readonly userOrigin: UserOrigin;
}

export interface AuthResult {
  readonly user: CurrentUser;
  /** Present when a cookie must be (re)issued. */
  readonly session?: IssuedSession;
}

type AuditAction =
  | 'auth.guest_created'
  | 'auth.registered'
  | 'auth.login_success'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.password_changed'
  | 'auth.password_reset_requested'
  | 'auth.password_reset_completed'
  | 'auth.email_verified'
  | 'auth.session_revoked';

export const GENERIC_RECOVERY_MESSAGE =
  'If an eligible account exists, recovery instructions have been sent.';

/**
 * Authentication workflows. HTTP concerns live in the controller, persistence in the database
 * package, secrets handling in the password/token/session services; this class orders them.
 *
 * Rules every workflow follows: no external I/O (email) inside a transaction; secrets are never
 * logged or audited; failures the client can probe (login, recovery) answer identically.
 */
export class AuthService {
  private readonly pendingDeliveries = new Set<Promise<void>>();
  private readonly passwordProvider: EmailPasswordProvider;

  constructor(private readonly deps: AuthServiceDeps) {
    this.passwordProvider = new EmailPasswordProvider(
      () => this.repos(),
      deps.passwords,
    );
  }

  private repos(): Repositories {
    return this.deps.database.repositories();
  }
  private txRepos(tx: Parameters<Database['repositories']>[0]): Repositories {
    return this.deps.database.repositories(tx);
  }

  /** Await outstanding email sends (tests, graceful shutdown). */
  async drainDeliveries(): Promise<void> {
    await Promise.allSettled([...this.pendingDeliveries]);
  }
  /**
   * Send mail after the database commit, without making the HTTP response wait for the provider.
   * Waiting would both slow requests and leak (through latency) whether an address has an account.
   * Failures are logged without the message and never undo account creation.
   */
  private deliver(meta: RequestMeta, task: () => Promise<void>): void {
    const promise: Promise<void> = task()
      .catch((error: unknown) => {
        meta.log.error(
          {
            requestId: meta.requestId,
            component: 'email',
            errorType: error instanceof Error ? error.name : 'Error',
          },
          'email delivery failed',
        );
      })
      .finally(() => this.pendingDeliveries.delete(promise));
    this.pendingDeliveries.add(promise);
  }

  private audit(
    repos: Repositories,
    meta: RequestMeta,
    entry: {
      readonly actor: 'user' | 'system';
      readonly action: AuditAction;
      readonly userId: string;
      readonly metadata?: Record<string, unknown>;
    },
  ): Promise<unknown> {
    return repos.audit.record({
      actorType: entry.actor,
      ...(entry.actor === 'user' ? { actorId: entry.userId } : {}),
      action: entry.action,
      targetType: 'user',
      targetId: entry.userId,
      requestId: meta.requestId,
      metadata: entry.metadata ?? {},
    });
  }

  async currentUser(
    userId: string,
    repos: Repositories = this.repos(),
  ): Promise<CurrentUser> {
    const user = await repos.users.findById(userId);
    if (!user) throw new AuthRequiredError();
    const [identity, player] = await Promise.all([
      repos.auth.findEmailIdentityByUserId(userId),
      repos.players.findByUserId(userId),
    ]);
    return {
      id: user.id,
      accountType: user.accountType,
      email: identity?.email ?? null,
      emailVerified: Boolean(identity?.emailVerifiedAt),
      hasCricketer: Boolean(player),
    };
  }

  // ---------------------------------------------------------------- guest

  async createGuest(
    meta: RequestMeta,
    current: AuthContext | null,
  ): Promise<AuthResult> {
    // A caller who already holds a valid session keeps it: no pointless extra guest rows.
    if (current) return { user: await this.currentUser(current.userId) };
    await this.deps.limiter.consume('guest', hashIdentifier(meta.ip));
    const { database, sessions } = this.deps;
    const issued = await database.transaction(
      async (tx) => {
        const repos = this.txRepos(tx);
        const user = await repos.auth.createGuestUser(this.deps.userOrigin);
        const session = await sessions.create(repos, {
          userId: user.id,
          accountType: 'guest',
          userAgentSummary: summarizeUserAgent(meta.userAgent),
        });
        await this.audit(repos, meta, {
          actor: 'user',
          action: 'auth.guest_created',
          userId: user.id,
          metadata: { sessionId: session.session.id },
        });
        return { user, session };
      },
      { operation: 'auth.guest_created', requestId: meta.requestId },
    );
    this.deps.telemetry.track('auth_guest_created', { userId: issued.user.id });
    this.deps.telemetry.count('guest_created');
    return {
      user: {
        id: issued.user.id,
        accountType: 'guest',
        email: null,
        emailVerified: false,
        hasCricketer: false,
      },
      session: {
        token: issued.session.token,
        maxAgeSeconds: issued.session.maxAgeSeconds,
      },
    };
  }

  // ----------------------------------------------------------- registration

  /**
   * Email/password sign-up. For a caller holding a guest session this is an in-place upgrade:
   * the same `users.id` gains a login identity, so the player, career, wallet and inventory
   * attached to that id are untouched. Without a session it creates a new registered user.
   */
  async register(
    meta: RequestMeta,
    current: AuthContext | null,
    input: { readonly email: string; readonly password: string },
  ): Promise<AuthResult> {
    if (current?.accountType === 'registered')
      throw new AlreadyRegisteredError();
    await this.deps.limiter.consume('register', hashIdentifier(meta.ip));

    const email = input.email.trim();
    const emailNormalized = normalizeEmail(email);
    // Courtesy pre-check so the common conflict is cheap. The unique index below is the real
    // guarantee and also decides concurrent races.
    if (await this.repos().auth.findCredentialByEmail(emailNormalized)) {
      this.deps.telemetry.count('registration_conflict');
      throw new EmailAlreadyInUseError();
    }
    const passwordHash = await this.deps.passwords.hash(input.password);
    const { database, sessions, tokens } = this.deps;

    let outcome;
    try {
      outcome = await database.transaction(
        async (tx) => {
          const repos = this.txRepos(tx);
          const credentials = { email, emailNormalized, passwordHash };
          let userId: string;
          let session;
          if (current) {
            const upgraded = await repos.auth.upgradeGuest(
              current.userId,
              credentials,
            );
            userId = upgraded.user.id;
            // New identity of the session: the guest-era token is dead from this commit on.
            session = await sessions.rotate(
              repos,
              { sessionId: current.sessionId },
              {
                userId,
                accountType: 'registered',
                reason: 'upgraded',
                userAgentSummary: summarizeUserAgent(meta.userAgent),
              },
            );
          } else {
            const created = await repos.auth.createRegisteredUser({
              ...credentials,
              origin: this.deps.userOrigin,
            });
            userId = created.user.id;
            session = await sessions.create(repos, {
              userId,
              accountType: 'registered',
              userAgentSummary: summarizeUserAgent(meta.userAgent),
            });
          }
          const verification = await tokens.issue(repos, {
            userId,
            purpose: 'email_verification',
            emailNormalized,
          });
          await this.audit(repos, meta, {
            actor: 'user',
            action: 'auth.registered',
            userId,
            metadata: {
              method: current ? 'guest_upgrade' : 'direct',
              sessionId: session.session.id,
            },
          });
          return { userId, session, verification };
        },
        { operation: 'auth.register', requestId: meta.requestId },
      );
    } catch (error) {
      if (error instanceof UniqueViolationError) {
        this.deps.telemetry.count('registration_conflict');
        throw new EmailAlreadyInUseError();
      }
      // The guest row was upgraded (or vanished) by a concurrent request.
      if (error instanceof InvalidStateTransitionError)
        throw new AlreadyRegisteredError();
      if (error instanceof RecordNotFoundError) throw new AuthRequiredError();
      throw error;
    }

    const { userId, session, verification } = outcome;
    this.deliver(meta, () =>
      this.deps.email.sendVerificationEmail({
        to: email,
        url: verificationUrl(this.deps.config.webBaseUrl, verification.raw),
        expiresAt: verification.record.expiresAt,
      }),
    );
    this.deps.telemetry.track('auth_registration_completed', { userId });
    this.deps.telemetry.count('registration_success');
    if (current) {
      this.deps.telemetry.track('auth_guest_upgraded', { userId });
      this.deps.telemetry.count('guest_upgraded');
    }
    return {
      user: await this.currentUser(userId),
      session: {
        token: session.token,
        maxAgeSeconds: session.maxAgeSeconds,
      },
    };
  }

  // ------------------------------------------------------------------ login

  async login(
    meta: RequestMeta,
    current: AuthContext | null,
    input: { readonly email: string; readonly password: string },
  ): Promise<AuthResult> {
    const emailNormalized = normalizeEmail(input.email);
    const ipKey = hashIdentifier(meta.ip);
    const emailKey = hashIdentifier(emailNormalized);
    try {
      await this.deps.limiter.consume('login_ip', ipKey);
      await this.deps.limiter.assertLoginAllowed(ipKey, emailKey);
    } catch (error) {
      if (error instanceof RateLimitedError) {
        this.deps.telemetry.count('login_blocked');
        meta.log.warn(
          {
            requestId: meta.requestId,
            event: 'auth.login_blocked',
            identifierHash: emailKey,
          },
          'login throttled',
        );
      }
      throw error;
    }

    const result = await this.passwordProvider.authenticate({
      emailNormalized,
      password: input.password,
    });
    if (!result.ok)
      return this.failLogin(
        meta,
        ipKey,
        emailKey,
        result.reason,
        result.userId,
      );
    const { user } = result;
    // Deleted accounts look like accounts that never existed.
    if (user.status === 'deleted')
      return this.failLogin(meta, ipKey, emailKey, 'deleted_user', user.id);
    if (user.status === 'suspended') {
      meta.log.warn(
        {
          requestId: meta.requestId,
          event: 'auth.login_failed',
          reason: 'suspended_user',
          userId: user.id,
        },
        'login refused',
      );
      this.deps.telemetry.count('login_failure');
      throw new AccountSuspendedError();
    }

    const { database, sessions } = this.deps;
    const session = await database.transaction(
      async (tx) => {
        const repos = this.txRepos(tx);
        // Never keep the pre-login session alive (fixation): replace it with a fresh token.
        if (current) await sessions.revoke(repos, current.sessionId, 'rotated');
        const issued = await sessions.create(repos, {
          userId: user.id,
          accountType: user.accountType,
          userAgentSummary: summarizeUserAgent(meta.userAgent),
        });
        if (result.upgradedPasswordHash)
          await repos.auth.rehashPassword(user.id, result.upgradedPasswordHash);
        await repos.users.touchLastSeen(user.id);
        await this.audit(repos, meta, {
          actor: 'user',
          action: 'auth.login_success',
          userId: user.id,
          metadata: { sessionId: issued.session.id },
        });
        return issued;
      },
      { operation: 'auth.login', requestId: meta.requestId },
    );
    await this.deps.limiter.recordLoginSuccess(ipKey, emailKey);
    this.deps.telemetry.track('auth_login_completed', { userId: user.id });
    this.deps.telemetry.count('login_success');
    return {
      user: await this.currentUser(user.id),
      session: { token: session.token, maxAgeSeconds: session.maxAgeSeconds },
    };
  }

  private async failLogin(
    meta: RequestMeta,
    ipKey: string,
    emailKey: string,
    reason: 'unknown_identity' | 'bad_password' | 'deleted_user',
    userId: string | undefined,
  ): Promise<never> {
    await this.deps.limiter.recordLoginFailure(ipKey, emailKey);
    this.deps.telemetry.count('login_failure');
    // The distinction below exists only in logs/audit; the client always sees the same answer.
    meta.log.warn(
      {
        requestId: meta.requestId,
        event: 'auth.login_failed',
        reason,
        identifierHash: emailKey,
      },
      'login failed',
    );
    if (userId)
      await this.audit(this.repos(), meta, {
        actor: 'system',
        action: 'auth.login_failed',
        userId,
        metadata: { reason },
      });
    throw new InvalidCredentialsError();
  }

  // ----------------------------------------------------------------- logout

  /** Idempotent: no session, an expired one, or an already-revoked one all succeed. */
  async logout(meta: RequestMeta, current: AuthContext | null): Promise<void> {
    if (!current) return;
    const repos = this.repos();
    const revoked = await this.deps.sessions.revoke(
      repos,
      current.sessionId,
      'logout',
    );
    if (revoked) {
      await this.audit(repos, meta, {
        actor: 'user',
        action: 'auth.logout',
        userId: current.userId,
        metadata: { sessionId: current.sessionId },
      });
      this.deps.telemetry.track('auth_logout_completed', {
        userId: current.userId,
      });
    }
  }

  async logoutAll(meta: RequestMeta, current: AuthContext): Promise<number> {
    const repos = this.repos();
    const count = await this.deps.sessions.revokeAllForUser(
      repos,
      current.userId,
      'logout_all',
    );
    await this.audit(repos, meta, {
      actor: 'user',
      action: 'auth.logout_all',
      userId: current.userId,
      metadata: { revokedSessions: count },
    });
    await this.audit(repos, meta, {
      actor: 'user',
      action: 'auth.session_revoked',
      userId: current.userId,
      metadata: { reason: 'logout_all', revokedSessions: count },
    });
    this.deps.telemetry.track('auth_logout_completed', {
      userId: current.userId,
    });
    return count;
  }

  async listSessions(current: AuthContext) {
    const sessions = await this.deps.sessions.listActive(
      this.repos(),
      current.userId,
    );
    return sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      current: s.id === current.sessionId,
      device: s.userAgentSummary,
    }));
  }

  // ------------------------------------------------------ email verification

  async requestEmailVerification(
    meta: RequestMeta,
    current: AuthContext,
  ): Promise<void> {
    if (current.accountType !== 'registered')
      throw new GuestUpgradeRequiredError();
    await this.deps.limiter.consume('email_action', `verify:${current.userId}`);
    await this.deps.limiter.consume('email_action_ip', hashIdentifier(meta.ip));
    const repos = this.repos();
    const identity = await repos.auth.findEmailIdentityByUserId(current.userId);
    if (!identity?.email || !identity.emailNormalized)
      throw new GuestUpgradeRequiredError();
    if (identity.emailVerifiedAt) return;
    const verification = await this.deps.tokens.issue(repos, {
      userId: current.userId,
      purpose: 'email_verification',
      emailNormalized: identity.emailNormalized,
    });
    this.deliver(meta, () =>
      this.deps.email.sendVerificationEmail({
        to: identity.email as string,
        url: verificationUrl(this.deps.config.webBaseUrl, verification.raw),
        expiresAt: verification.record.expiresAt,
      }),
    );
  }

  async verifyEmail(
    meta: RequestMeta,
    input: { readonly token: string },
  ): Promise<{ verified: true; alreadyVerified: boolean }> {
    await this.deps.limiter.consume(
      'token_attempt',
      `ip:${hashIdentifier(meta.ip)}`,
    );
    const { tokens } = this.deps;
    const result = await this.deps.database.transaction(
      async (tx) => {
        const repos = this.txRepos(tx);
        const inspection = await tokens.inspect(
          repos,
          input.token,
          'email_verification',
        );
        if (inspection.state === 'invalid' || inspection.state === 'expired')
          return TokenService.reject('email_verification', inspection.state);
        const { record } = inspection;
        if (inspection.state === 'used') {
          // Re-clicking a link (or a mail scanner pre-fetching it) after success is harmless.
          // A used token for an address that is NOT verified stays invalid (e.g. superseded).
          const identity = await repos.auth.findEmailIdentityByUserId(
            record.userId,
          );
          if (
            identity?.emailVerifiedAt &&
            identity.emailNormalized === record.emailNormalized
          )
            return { userId: record.userId, alreadyVerified: true };
          return TokenService.reject('email_verification', 'used');
        }
        if (!(await tokens.consume(repos, record)))
          throw new InvalidVerificationTokenError();
        const verified = record.emailNormalized
          ? await repos.auth.markEmailVerified(
              record.userId,
              record.emailNormalized,
            )
          : null;
        if (!verified) throw new InvalidVerificationTokenError();
        await repos.authTokens.invalidateAllForUser(
          record.userId,
          'email_verification',
          this.deps.clock.now(),
        );
        await this.audit(repos, meta, {
          actor: 'user',
          action: 'auth.email_verified',
          userId: record.userId,
        });
        return { userId: record.userId, alreadyVerified: false };
      },
      { operation: 'auth.verify_email', requestId: meta.requestId },
    );
    if (!result.alreadyVerified)
      this.deps.telemetry.track('auth_email_verified', {
        userId: result.userId,
      });
    return { verified: true, alreadyVerified: result.alreadyVerified };
  }

  // -------------------------------------------------------- password recovery

  /** Always answers with the same message and does comparable work whether or not the account exists. */
  async forgotPassword(
    meta: RequestMeta,
    input: { readonly email: string },
  ): Promise<string> {
    const emailNormalized = normalizeEmail(input.email);
    await this.deps.limiter.consume('email_action_ip', hashIdentifier(meta.ip));
    await this.deps.limiter.consume(
      'email_action',
      `forgot:${hashIdentifier(emailNormalized)}`,
    );
    const repos = this.repos();
    const credential = await repos.auth.findCredentialByEmail(emailNormalized);
    const user = credential
      ? await repos.users.findById(credential.userId)
      : null;
    if (credential?.email && user?.status === 'active') {
      const reset = await this.deps.tokens.issue(repos, {
        userId: user.id,
        purpose: 'password_reset',
      });
      await this.audit(repos, meta, {
        actor: 'system',
        action: 'auth.password_reset_requested',
        userId: user.id,
      });
      this.deps.telemetry.count('password_reset_requested');
      const to = credential.email;
      this.deliver(meta, () =>
        this.deps.email.sendPasswordResetEmail({
          to,
          url: passwordResetUrl(this.deps.config.webBaseUrl, reset.raw),
          expiresAt: reset.record.expiresAt,
        }),
      );
    } else {
      meta.log.info(
        {
          requestId: meta.requestId,
          event: 'auth.password_reset_ignored',
          identifierHash: hashIdentifier(emailNormalized),
        },
        'password reset requested for ineligible identifier',
      );
    }
    return GENERIC_RECOVERY_MESSAGE;
  }

  async resetPassword(
    meta: RequestMeta,
    input: { readonly token: string; readonly newPassword: string },
  ): Promise<void> {
    await this.deps.limiter.consume(
      'token_attempt',
      `ip:${hashIdentifier(meta.ip)}`,
    );
    const { tokens, sessions } = this.deps;
    // Reject bad tokens before spending ~100 ms of Argon2id on them.
    const inspection = await tokens.inspect(
      this.repos(),
      input.token,
      'password_reset',
    );
    if (inspection.state !== 'valid')
      return TokenService.reject('password_reset', inspection.state);
    const passwordHash = await this.deps.passwords.hash(input.newPassword);
    const userId = await this.deps.database.transaction(
      async (tx) => {
        const repos = this.txRepos(tx);
        // The conditional UPDATE makes the token single-use even under concurrent attempts.
        if (!(await tokens.consume(repos, inspection.record)))
          throw new InvalidResetTokenError();
        const { userId: id } = inspection.record;
        const user = await repos.users.findById(id);
        const credential = await repos.auth.findCredentialByUserId(id);
        if (!user || user.status === 'deleted' || !credential?.emailNormalized)
          throw new InvalidResetTokenError();
        await repos.auth.setPasswordHash(id, passwordHash);
        // Receiving the link proves control of the mailbox.
        await repos.auth.markEmailVerified(id, credential.emailNormalized);
        // A stolen session must not survive a reset.
        const revoked = await sessions.revokeAllForUser(
          repos,
          id,
          'password_reset',
        );
        await repos.authTokens.invalidateAllForUser(
          id,
          'password_reset',
          this.deps.clock.now(),
        );
        await this.audit(repos, meta, {
          actor: 'user',
          action: 'auth.password_reset_completed',
          userId: id,
          metadata: { revokedSessions: revoked },
        });
        await this.audit(repos, meta, {
          actor: 'user',
          action: 'auth.session_revoked',
          userId: id,
          metadata: { reason: 'password_reset', revokedSessions: revoked },
        });
        return id;
      },
      { operation: 'auth.reset_password', requestId: meta.requestId },
    );
    this.deps.telemetry.track('auth_password_reset_completed', { userId });
    this.deps.telemetry.count('password_reset_completed');
  }

  async changePassword(
    meta: RequestMeta,
    current: AuthContext,
    input: { readonly currentPassword: string; readonly newPassword: string },
  ): Promise<AuthResult> {
    if (current.accountType !== 'registered')
      throw new GuestUpgradeRequiredError();
    await this.deps.limiter.consume('token_attempt', `user:${current.userId}`);
    const credential = await this.repos().auth.findCredentialByUserId(
      current.userId,
    );
    if (!credential?.passwordHash) throw new GuestUpgradeRequiredError();
    if (
      !(await this.deps.passwords.verify(
        credential.passwordHash,
        input.currentPassword,
      ))
    )
      throw new InvalidCredentialsError('Current password is incorrect.', 400);
    if (input.currentPassword === input.newPassword)
      throw new WeakPasswordError(
        'Choose a password different from your current one.',
      );
    const passwordHash = await this.deps.passwords.hash(input.newPassword);
    const { sessions } = this.deps;
    const session = await this.deps.database.transaction(
      async (tx) => {
        const repos = this.txRepos(tx);
        await repos.auth.setPasswordHash(current.userId, passwordHash);
        // Sign out every other device, and give this one a fresh token.
        const revoked = await sessions.revokeAllForUser(
          repos,
          current.userId,
          'password_changed',
          {
            exceptSessionId: current.sessionId,
          },
        );
        const issued = await sessions.rotate(
          repos,
          { sessionId: current.sessionId },
          {
            userId: current.userId,
            accountType: current.accountType,
            reason: 'password_changed',
            userAgentSummary: summarizeUserAgent(meta.userAgent),
          },
        );
        await this.audit(repos, meta, {
          actor: 'user',
          action: 'auth.password_changed',
          userId: current.userId,
          metadata: { revokedOtherSessions: revoked },
        });
        return issued;
      },
      { operation: 'auth.change_password', requestId: meta.requestId },
    );
    return {
      user: await this.currentUser(current.userId),
      session: { token: session.token, maxAgeSeconds: session.maxAgeSeconds },
    };
  }

  // -------------------------------------------------------------- housekeeping

  /** Delete long-dead sessions and tokens. Run on a schedule (`pnpm auth:cleanup-sessions`). */
  cleanup(options: { retentionDays?: number } = {}) {
    return cleanupAuthData(
      this.repos(),
      this.deps.clock.now(),
      options.retentionDays ?? 7,
    );
  }
}
