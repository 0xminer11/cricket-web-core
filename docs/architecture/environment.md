# Environment

Copy .env.example to root .env. Environment is loaded once by server commands, the frontend launcher and test runner. Existing process values take precedence. Turbo includes declared environment values and .env in cache inputs.

| Variable                                                  | Module 1 use                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| NODE_ENV                                                  | development, test or production (Next builds/start use production)                                                             |
| APP_ENV                                                   | deployment label: development/test/staging/production                                                                          |
| WEB_PORT / ADMIN_PORT                                     | 3300 / 3301                                                                                                                    |
| API_PORT / GAME_SERVER_PORT                               | 4300 / 4310                                                                                                                    |
| CORS_ORIGINS                                              | comma-separated explicit origins; required for staging/production                                                              |
| LOG_LEVEL                                                 | Pino level; info by default                                                                                                    |
| DATABASE_URL / REDIS_URL                                  | PostgreSQL / Redis connection strings; the API enables its pool and /ready when DATABASE_URL is set                            |
| DATABASE_POOL_MAX                                         | max pooled connections per process (default 10; .env.example uses 5)                                                           |
| DATABASE_IDLE_TIMEOUT_MS / DATABASE_CONNECTION_TIMEOUT_MS | idle client eviction (30000) / connect deadline (5000)                                                                         |
| DATABASE_STATEMENT_TIMEOUT_MS                             | per-statement timeout (15000); idle-in-transaction is twice this                                                               |
| DATABASE_SLOW_QUERY_MS                                    | log transactions at least this slow; 0 disables (never logs SQL)                                                               |
| TEST_DATABASE_URL                                         | optional server for integration tests; only cricketer_test_* databases are created/dropped                                     |
| TRUST_PROXY                                               | `true` only behind a trusted reverse proxy so `req.ip` (used by per-IP rate limits) honours `X-Forwarded-For`; default `false` |
| APP_VERSION                                               | release identifier override for backend                                                                                        |
| NEXT_PUBLIC_API_URL / NEXT_PUBLIC_GAME_SERVER_URL         | public service locations; no credentials                                                                                       |

Staging uses NODE_ENV=production and APP_ENV=staging. Deployment must supply CORS origins. Never use local Compose credentials in deployment. Module 3 uses opaque, hashed, server-side sessions, so no JWT_SECRET/SESSION_SECRET (or password pepper) exists; see the authentication variables below. Balance/engine/schema versions come from source-controlled game-core, not mutable environment values.

Next public values are release configuration: rebuild after changing them. Docker runtime must be configured explicitly. Admin is a development preview even when compiled using a production build command.

## Authentication variables (Module 3)

Parsed by `parseAuthEnvironment` in `packages/config`; defaults are development-friendly and staging/production fail fast on insecure values. Durations are seconds. Full semantics: [docs/auth](../auth/overview.md).

| Variable                                                                                                       | Default                                                                                                                          | Notes                                                                         |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| AUTH_TRUSTED_ORIGINS                                                                                           | first CORS origin (dev only)                                                                                                     | **required** in staging/production; https; each must also be in CORS_ORIGINS  |
| AUTH_SESSION_TTL / AUTH_GUEST_SESSION_TTL                                                                      | 2592000 (30 d)                                                                                                                   | sliding idle window                                                           |
| AUTH_SESSION_ABSOLUTE_TTL                                                                                      | 7776000 (90 d)                                                                                                                   | hard cap                                                                      |
| AUTH_SESSION_TOUCH_INTERVAL                                                                                    | 300                                                                                                                              | minimum gap between `last_seen_at` writes                                     |
| AUTH_PASSWORD_MIN_LENGTH                                                                                       | 10                                                                                                                               | 8–64; production ≥ 10; maximum is fixed at 128                                |
| AUTH_VERIFICATION_TOKEN_TTL / AUTH_RESET_TOKEN_TTL                                                             | 86400 / 3600                                                                                                                     |                                                                               |
| AUTH_COOKIE_NAME / AUTH_COOKIE_SECURE / AUTH_COOKIE_SAME_SITE / AUTH_COOKIE_DOMAIN                             | `cricketer_session` (secure: `__Host-cricketer_session`) / false in dev, **true required** in staging/production / `lax` / unset | `__Host-` forbids a domain; `none` requires secure                            |
| AUTH_WEB_BASE_URL                                                                                              | first trusted origin                                                                                                             | base of emailed links                                                         |
| AUTH_ARGON2_MEMORY_KIB / AUTH_ARGON2_PASSES / AUTH_ARGON2_PARALLELISM                                          | 65536 / 3 / 1                                                                                                                    | production floor 19456 KiB and 2 passes; tune with `pnpm auth:benchmark-hash` |
| AUTH_HASH_CONCURRENCY                                                                                          | 2                                                                                                                                | max simultaneous hashes                                                       |
| EMAIL_PROVIDER                                                                                                 | `development` (dev/test), `disabled` (deployed)                                                                                  | `development` is rejected in staging/production                               |
| AUTH_RL_<GUEST\|REGISTER\|LOGIN_IP\|LOGIN_FAILURE\|EMAIL_ACTION\|EMAIL_ACTION_IP\|TOKEN_ATTEMPT>_MAX / _WINDOW | see [rate-limiting](../auth/rate-limiting.md)                                                                                    | `.env.example` relaxes guest/register/login for local work                    |
| AUTH_RL_LOGIN_BLOCK_BASE / AUTH_RL_LOGIN_BLOCK_MAX                                                             | 60 / 3600                                                                                                                        | escalating temporary login blocks                                             |

Turborepo runs tasks in strict environment mode, so `turbo.json` lists `AUTH_*`, `TRUST_PROXY` and `EMAIL_PROVIDER` in `globalEnv`.

## Player variables (Module 4)

| Variable                  | Default | Notes                                                                                                               |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| PLAYER_NAME_BLOCKED_TERMS | empty   | comma-separated whole-word terms refused in cricketer names                                                         |
| PLAYER_NAME_RESERVED      | empty   | extra reserved names (exact match after case/diacritic/spacing folding); staff and system names are always reserved |

`turbo.json` lists `PLAYER_*` in `globalEnv`. Details: [docs/player-creation/security.md](../player-creation/security.md).

## Asset variables (Module 5)

| Variable                   | Default             | Notes                                                                                                                                                                                     |
| -------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NEXT_PUBLIC_ASSET_BASE_URL | empty (same origin) | optional CDN prefix for `/game-assets/...` GLB and icon URLs; inlined at build time, no trailing slash. It is configuration, never user input; the registry only prefixes manifest paths. |

Turborepo's Next.js framework inference already hashes `NEXT_PUBLIC_*` for the web package, so `turbo.json` needs no new entry. Production serves `/game-assets/*` with `Cache-Control: public, max-age=31536000, immutable` (development: `no-store`); versioned file names make that safe. See [docs/character-3d](../character-3d/overview.md).
