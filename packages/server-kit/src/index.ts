import { randomUUID } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Environment } from '@the-cricketer/config';
import { versions } from '@the-cricketer/config';
import { createLogger } from '@the-cricketer/logger';
import type {
  Health,
  ApiResponse,
  Readiness,
} from '@the-cricketer/shared-types';
import { AppError, NotFoundError } from './errors';
export * from './errors';
/** Dependency probes for /ready. Each resolves when healthy and rejects when not; failures are never serialised. */
export type ReadinessChecks = Readonly<Record<string, () => Promise<void>>>;
export interface ServiceOptions {
  readonly readiness?: ReadinessChecks;
  /** Per-check deadline (default 3000 ms). */
  readonly readinessTimeoutMs?: number;
}

export async function createService(
  service: 'api' | 'game-server',
  env: Environment,
  options: ServiceOptions = {},
) {
  const app = Fastify({
    loggerInstance: createLogger(service, env.environment, env.LOG_LEVEL),
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    trustProxy: false,
    bodyLimit: 64 * 1024,
    requestTimeout: 15000,
    connectionTimeout: 10000,
    forceCloseConnections: 'idle',
  });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });
  app.addHook('onResponse', async (req, reply) => {
    req.log.info(
      {
        requestId: req.id,
        route: req.routeOptions.url ?? 'unmatched',
        method: req.method,
        statusCode: reply.statusCode,
        duration: reply.elapsedTime,
      },
      'request completed',
    );
  });
  await app.register(helmet);
  await app.register(cors, {
    origin: env.origins,
    credentials: false,
    exposedHeaders: ['x-request-id'],
  });
  await app.register(rateLimit, {
    max: env.deployed ? 120 : 1000,
    timeWindow: '1 minute',
  });
  app.setNotFoundHandler(() => {
    throw new NotFoundError();
  });
  app.setErrorHandler((error, req, reply) => {
    const known = error instanceof AppError;
    const status = known
      ? error.statusCode
      : typeof error === 'object' &&
          error !== null &&
          'statusCode' in error &&
          typeof error.statusCode === 'number' &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ? error.statusCode
        : 500;
    const code = known
      ? error.code
      : status === 429
        ? 'RATE_LIMITED'
        : status < 500
          ? 'VALIDATION_ERROR'
          : 'INTERNAL_ERROR';
    // Never serialize arbitrary errors: database/driver messages can embed credentials.
    req.log[status >= 500 ? 'error' : 'warn'](
      {
        requestId: req.id,
        code,
        ...(env.environment === 'development' && error instanceof Error
          ? {
              stack: error.stack
                ?.split('\n')
                .filter((line) => /^\s+at /.test(line))
                .join('\n'),
            }
          : {}),
      },
      'request failed',
    );
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code,
        message:
          known && status < 500
            ? error.message
            : status === 429
              ? 'Too many requests'
              : status < 500
                ? 'Invalid request'
                : 'Internal server error',
        requestId: req.id,
      },
    };
    void reply.status(status).send(response);
  });
  app.get('/health', async (): Promise<ApiResponse<Health>> => ({
    success: true,
    data: {
      status: 'ok',
      service,
      version: env.APP_VERSION,
      environment: env.environment,
    },
  }));
  // Liveness is /health (process is up). Readiness additionally proves dependencies such as
  // PostgreSQL respond, without exposing hosts, credentials or driver messages.
  const readinessTimeout = options.readinessTimeoutMs ?? 3000;
  app.get('/ready', async (req, reply): Promise<ApiResponse<Readiness>> => {
    const checks: Record<string, 'ok' | 'unavailable'> = {};
    await Promise.all(
      Object.entries(options.readiness ?? {}).map(async ([name, probe]) => {
        let timer: NodeJS.Timeout | undefined;
        try {
          await Promise.race([
            probe(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('timeout')),
                readinessTimeout,
              );
            }),
          ]);
          checks[name] = 'ok';
        } catch {
          checks[name] = 'unavailable';
          req.log.error(
            { requestId: req.id, dependency: name },
            'readiness check failed',
          );
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    const failed = Object.entries(checks).filter(([, v]) => v !== 'ok');
    if (failed.length > 0) {
      void reply.status(503);
      return {
        success: false,
        error: {
          code: 'NOT_READY',
          message: `Not ready: ${failed.map(([name]) => name).join(', ')}`,
          requestId: req.id,
        },
      };
    }
    return {
      success: true,
      data: { status: 'ok', checks: checks as Readiness['checks'] },
    };
  });
  app.get('/version', async () => ({
    success: true,
    data: { ...versions, appVersion: env.APP_VERSION },
  }));
  return app;
}
export async function startService(
  app: Awaited<ReturnType<typeof createService>>,
  env: Environment,
  port: number,
): Promise<void> {
  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    const deadline = setTimeout(() => {
      process.exitCode = 1;
      process.exit(1);
    }, 10000);
    deadline.unref();
    try {
      await app.close();
      app.log.flush();
    } catch {
      app.log.error('Service shutdown failed');
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
      process.off('SIGTERM', onTerm);
      process.off('SIGINT', onInt);
    }
  };
  const onTerm = (): void => {
    void shutdown('SIGTERM');
  };
  const onInt = (): void => {
    void shutdown('SIGINT');
  };
  process.on('SIGTERM', onTerm);
  process.on('SIGINT', onInt);
  try {
    await app.listen({ host: env.deployed ? '0.0.0.0' : '127.0.0.1', port });
    app.log.info(
      { port, ...versions, appVersion: env.APP_VERSION },
      'The Cricketer service ready',
    );
  } catch (error) {
    await shutdown('startup failure');
    throw error;
  }
}
