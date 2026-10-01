import fastifyCookie from '@fastify/cookie';
import { createClient } from 'redis';
import type { AuthEnvironment } from '@the-cricketer/config';
import type { Database, UserOrigin } from '@the-cricketer/database';
import { SystemClock } from '@the-cricketer/game-core';
import type { Clock } from '@the-cricketer/game-core';
import type { Environment } from '@the-cricketer/config';
import type { createService } from '@the-cricketer/server-kit';
import { SessionCookie } from './auth.cookies';
import { AuthController } from './auth.controller';
import { createAuthGuards } from './auth.middleware';
import type { AuthGuards } from './auth.middleware';
import { authRoutes } from './auth.routes';
import { AuthService } from './auth.service';
import { LogAuthTelemetry } from './auth.telemetry';
import type { AuthTelemetry } from './auth.telemetry';
import { DevelopmentEmailService, DisabledEmailService } from './email.service';
import type { EmailService } from './email.service';
import { Argon2PasswordService } from './password.service';
import type { PasswordService } from './password.service';
import {
  AuthRateLimiter,
  MemoryRateLimitStore,
  RedisRateLimitStore,
  ResilientRateLimitStore,
} from './rate-limit';
import type { RateLimitStore } from './rate-limit';
import { SessionService } from './session.service';
import { SecureTokenGenerator, TokenService } from './token.service';
import type { TokenGenerator } from './token.service';
import { OwnershipGuard } from './authorization';

export * from './auth.cleanup';
export * from './auth.errors';
export * from './auth.types';
export * from './authorization';
export type { AuthGuards } from './auth.middleware';
export * from './email.service';
export * from './identifiers';
export * from './password.service';
export * from './rate-limit';
export * from './session.service';
export * from './token.service';
export { AuthService, GENERIC_RECOVERY_MESSAGE } from './auth.service';
export { LogAuthTelemetry } from './auth.telemetry';

type Service = Awaited<ReturnType<typeof createService>>;

/** Seams for tests and future adapters; production wiring needs none of these. */
export interface AuthModuleOptions {
  readonly clock?: Clock;
  readonly tokenGenerator?: TokenGenerator;
  readonly emailService?: EmailService;
  readonly rateLimitStore?: RateLimitStore;
  readonly passwordService?: PasswordService;
  readonly telemetry?: AuthTelemetry;
}

export interface AuthModule {
  readonly service: AuthService;
  readonly sessions: SessionService;
  readonly tokens: TokenService;
  readonly passwords: PasswordService;
  readonly email: EmailService;
  readonly limiter: AuthRateLimiter;
  readonly telemetry: AuthTelemetry;
  readonly ownership: OwnershipGuard;
  readonly config: AuthEnvironment;
  /** Reusable hooks for later modules (player, career...). */
  readonly guards: AuthGuards;
}

declare module 'fastify' {
  interface FastifyInstance {
    auth: AuthModule;
  }
}

const userOriginFor = (environment: Environment['environment']): UserOrigin =>
  environment === 'development'
    ? 'development'
    : environment === 'test'
      ? 'test'
      : 'organic';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Redis when REDIS_URL is set (shared limits across instances), else per-process memory. */
function createRateLimitStore(
  input: Record<string, unknown>,
  app: Service,
  memory: MemoryRateLimitStore,
): RateLimitStore {
  const url = input.REDIS_URL;
  if (typeof url !== 'string' || url === '') return memory;
  const client = createClient({
    url,
    // Fail fast instead of queueing commands while Redis is down; the resilient store falls back.
    disableOfflineQueue: true,
    socket: { reconnectStrategy: (retries) => Math.min(retries * 250, 5000) },
  });
  client.on('error', () => undefined);
  void client.connect().catch(() => undefined);
  app.addHook('onClose', async () => {
    // A client that never connected cannot quit gracefully; tear it down instead of hanging.
    if (!client.isReady) return client.destroy();
    try {
      await client.quit();
    } catch {
      client.destroy();
    }
  });
  return new ResilientRateLimitStore(
    new RedisRateLimitStore(client),
    memory,
    app.log,
  );
}

export async function registerAuth(
  app: Service,
  deps: {
    readonly database: Database;
    readonly env: Environment;
    readonly authEnv: AuthEnvironment;
    readonly input: Record<string, unknown>;
    readonly options?: AuthModuleOptions;
  },
): Promise<AuthModule> {
  const { database, env, authEnv: config, input } = deps;
  const options = deps.options ?? {};
  const clock = options.clock ?? new SystemClock();
  const generator = options.tokenGenerator ?? new SecureTokenGenerator();

  const passwords =
    options.passwordService ??
    new Argon2PasswordService({
      memoryKib: config.argon2.memoryKib,
      passes: config.argon2.passes,
      parallelism: config.argon2.parallelism,
      concurrency: config.argon2.concurrency,
    });
  const sessions = new SessionService({
    generator,
    clock,
    policy: {
      idleTtlSeconds: {
        guest: config.guestSessionTtlSeconds,
        registered: config.sessionTtlSeconds,
      },
      absoluteTtlSeconds: config.sessionAbsoluteTtlSeconds,
      touchIntervalSeconds: config.sessionTouchIntervalSeconds,
    },
  });
  const tokens = new TokenService({
    generator,
    clock,
    verificationTtlSeconds: config.verificationTokenTtlSeconds,
    resetTtlSeconds: config.resetTokenTtlSeconds,
  });
  const email =
    options.emailService ??
    (config.emailProvider === 'development'
      ? new DevelopmentEmailService(app.log)
      : new DisabledEmailService(app.log));
  const memoryStore = new MemoryRateLimitStore(() => clock.now().getTime());
  const limiter = new AuthRateLimiter(
    options.rateLimitStore ?? createRateLimitStore(input, app, memoryStore),
    config,
  );
  const telemetry = options.telemetry ?? new LogAuthTelemetry(app.log);
  const service = new AuthService({
    database,
    passwords,
    sessions,
    tokens,
    email,
    limiter,
    telemetry,
    clock,
    config,
    userOrigin: userOriginFor(env.environment),
  });
  const cookie = new SessionCookie(config.cookie);
  const guards = createAuthGuards({
    database,
    sessions,
    cookie,
    telemetry,
    trustedOrigins: config.trustedOrigins,
  });
  const controller = new AuthController(
    service,
    cookie,
    config.passwordMinLength,
  );

  await app.register(fastifyCookie);
  app.decorateRequest('auth', null);
  app.decorateRequest('authFailure', null);
  app.decorateRequest('authResolved', false);
  await app.register(
    async (scope) => {
      await authRoutes(scope, { controller, guards });
      // Development-only mailbox: lets a developer (or browser test) read verification/reset
      // links without a mail provider. Registered ONLY outside staging/production, and then
      // only answers loopback callers.
      if (
        email instanceof DevelopmentEmailService &&
        (env.environment === 'development' || env.environment === 'test')
      ) {
        scope.get('/dev/emails', async (request, reply) => {
          if (!LOOPBACK.has(request.ip)) {
            void reply.status(404);
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Resource not found' },
            };
          }
          return { success: true, data: { emails: email.outbox } };
        });
      }
    },
    { prefix: '/api/v1' },
  );
  app.addHook('onClose', async () => {
    await service.drainDeliveries();
  });

  const module: AuthModule = {
    service,
    sessions,
    tokens,
    passwords,
    email,
    limiter,
    telemetry,
    ownership: new OwnershipGuard(() => database.repositories()),
    config,
    guards,
  };
  app.decorate('auth', module);
  return module;
}
