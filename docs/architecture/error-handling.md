# Errors and HTTP contracts

All server responses use { success: true, data } or { success: false, error: { code, message, requestId } }. Health data contains status/service/version/environment; /version returns all four versions. Web/admin /health is a lightweight deployment liveness response.

AppError subtypes map validation/not-found/unauthorized/forbidden/conflict/internal errors to 400/404/401/403/409/500. Unknown errors and all 5xx return safe messages. Parser/body-limit failures use a safe validation envelope; rate limiting returns 429/RATE_LIMITED. Production responses never contain stack traces.

Upstream IDs are not trusted: every request receives a new UUID, returned as x-request-id. Reverse-proxy trust remains off until deployment explicitly defines trusted hops.

The frontend client validates successful transport data, rejects malformed JSON, times out after five seconds and preserves response request IDs. UI shows unavailable status without inventing healthy results. Health is liveness. `GET /ready` (API) is dependency readiness: `{ success: true, data: { status: 'ok', checks: { database: 'ok' } } }`, or 503 `NOT_READY` naming only the failed dependency (each probe has a 3 s deadline; details go to logs only).

Persistence errors (`PersistenceError` with a stable `code`, from `@the-cricketer/database`) are translated to `AppError`s by the route modules that use repositories; raw driver/ORM errors never leave the database package. See [database-security.md](database-security.md).
