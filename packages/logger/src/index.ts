import pino from 'pino';
export function createLogger(
  service: string,
  environment: string,
  level = 'info',
) {
  return pino({
    level,
    base: { service, environment },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'password',
        'token',
        'authorization',
        'cookie',
        'secret',
        'DATABASE_URL',
        'REDIS_URL',
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.token',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
    ...(environment === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, singleLine: true },
          },
        }
      : {}),
  });
}
export type { Logger } from 'pino';
