# Logging

Pino logs service, environment, timestamp and level. Completed requests add generated requestId, matched route template, method, statusCode and duration. Query strings, headers, bodies and user information are not logged by request middleware. Redaction is defense in depth, not permission to log arbitrary secret-bearing objects.

Production/staging/test logs are JSON; development uses pino-pretty. HTTP errors log safe codes and correlation IDs. Raw database/Redis errors are replaced with connection-specific messages without connection strings. Development stack traces are intended for debugging only; do not insert credentials in error messages.

Metrics and tracing can use Fastify hooks and request IDs later. Avoid a vendor abstraction before an actual integration exists. Shutdown closes registered onClose resources, then flushes logging; a ten-second deadline bounds stalled shutdown.
