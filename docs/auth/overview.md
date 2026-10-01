# Authentication overview (Module 3)

Players can start instantly as a **guest**, later **register** with email and password without losing anything, **sign in** from other devices, **sign out**, and **recover** a lost password. Authentication knows nothing about cricket: an **account** (`users`) is not a **cricketer** (`player_profiles`), and the two ids are always different.

```text
Open game -> GET /api/v1/me
   |-- 401 -> Entry screen: Continue as Guest | Sign in | Create account
   |-- 200 -> account restored -> /career (has cricketer) or /create-player
Continue as Guest -> POST /auth/guest -> server creates user + session -> Set-Cookie (HttpOnly)
Register while a guest -> SAME users.id gains an email identity (in-place upgrade)
```

## Architecture

| Concern                  | Choice                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session model            | Opaque 256-bit token in an HttpOnly cookie; only its SHA-256 is stored in `auth_sessions` ([sessions](sessions.md))                              |
| Password hashing         | Argon2id (Node's built-in OpenSSL binding), PHC strings, per-hash salt ([security](security.md))                                                 |
| Account vs login methods | `users` is the account; `auth_identities` holds login methods (email today; Google/Apple later) ([future-oauth](future-oauth.md))                |
| Account types            | `guest`, `registered` (stable; providers never create new types)                                                                                 |
| Authorisation            | Caller id always comes from the verified session; ownership helpers answer 404 for foreign ids ([authorization](authorization.md))               |
| CSRF                     | SameSite=Lax cookie + mandatory trusted `Origin`/`Referer` on every unsafe request ([csrf](csrf.md))                                             |
| Throttling               | Per-IP, per-account and escalating temporary login blocks; Redis-backed with in-process fallback ([rate-limiting](rate-limiting.md))             |
| Email                    | `EmailService` port + development adapter; no vendor coupling ([email-verification](email-verification.md), [password-reset](password-reset.md)) |
| Audit/analytics/metrics  | Module 2 `audit_logs` (new `user` actor), pseudonymous analytics events, in-process counters                                                     |

## Code map

| Area             | Location                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Persistence      | `packages/database` — `schema/auth.ts`, `repositories/{auth,session,auth-token}.repository.ts`, migrations `0002`/`0003` |
| API module       | `apps/api/src/modules/auth/` — controller, service, session/password/token services, middleware, rate limiter, email     |
| Settings         | `packages/config` — `parseAuthEnvironment`                                                                               |
| Shared contracts | `packages/shared-types/src/auth.ts` (request schemas, DTOs, error codes)                                                 |
| Web              | `apps/web/src/features/auth/{api,components,hooks,schemas,state,types,utils}` + routes under `apps/web/src/app`          |
| CLI              | `pnpm auth:cleanup-sessions`, `pnpm auth:create-test-user`, `pnpm auth:benchmark-hash`                                   |

Persistence lives in `packages/database` (not in the API module) because Module 2 established that the ORM never leaves that package and that repositories return plain records; the auth repositories follow that rule.

## API surface (all under `/api/v1`)

| Method | Path                               | Auth                  | Notes                                                     |
| ------ | ---------------------------------- | --------------------- | --------------------------------------------------------- |
| POST   | `/auth/guest`                      | optional              | 201 new guest; 200 (no new account) when a session exists |
| POST   | `/auth/register`                   | optional              | guest session = in-place upgrade; none = new account      |
| POST   | `/auth/login`                      | optional              | rotates the session                                       |
| POST   | `/auth/logout`                     | optional              | idempotent; always clears the cookie                      |
| POST   | `/auth/logout-all`                 | registered            | revokes every device                                      |
| GET    | `/me`                              | required              | sanitised `CurrentUserDto`                                |
| GET    | `/auth/sessions`                   | required              | device list foundation (no tokens)                        |
| POST   | `/auth/email/verification/request` | registered            | resend                                                    |
| POST   | `/auth/email/verify`               | none (token)          | idempotent                                                |
| POST   | `/auth/password/forgot`            | none                  | identical answer for every address                        |
| POST   | `/auth/password/reset`             | none (token)          | revokes all sessions                                      |
| POST   | `/auth/password/change`            | registered            | other devices signed out, this session rotated            |
| GET    | `/dev/emails`                      | development/test only | loopback only; absent in staging/production               |

Envelope and codes follow Module 1: `{ success: true, data }` / `{ success: false, error: { code, message, requestId } }`. Codes: `AUTH_REQUIRED`, `INVALID_CREDENTIALS`, `ACCOUNT_SUSPENDED`, `ACCOUNT_DELETED`, `EMAIL_ALREADY_IN_USE`, `ALREADY_REGISTERED`, `INVALID_EMAIL`, `WEAK_PASSWORD`, `INVALID_VERIFICATION_TOKEN`, `VERIFICATION_TOKEN_EXPIRED`, `INVALID_RESET_TOKEN`, `RESET_TOKEN_EXPIRED`, `RATE_LIMITED` (with `Retry-After`), `GUEST_UPGRADE_REQUIRED`, `REGISTERED_ACCOUNT_REQUIRED`, `CSRF_ORIGIN_INVALID`, `VALIDATION_ERROR`.

## Inconsistencies with earlier modules (documented, not redesigned)

1. **Module 1 environment notes** said `JWT_SECRET`/`SESSION_SECRET` would arrive with Module 3. They do not: opaque server-side sessions need no signing secret, and passwords use no pepper. No such variables exist.
2. **`mapDatabaseError` (Module 2)** treated any thrown value with a string `code` as a driver error, so application errors thrown inside a transaction callback (all `AppError`s carry `code`) became `UnknownDatabaseError`/500. Driver codes are now matched by shape (5-character SQLSTATE or `E…` system code).
3. **`AUDIT_ACTOR_TYPES`** had no end-user actor. `user` was added (CHECK relaxed in migration 0002); existing rows are unaffected.
4. **Module 1 CORS** was credential-less and global. Cookie auth needs credentials for exact origins only, so `/api/*` gets credentialed CORS for `AUTH_TRUSTED_ORIGINS` while every other route keeps the old behaviour.
5. **Module 1 `trustProxy: false`** is now `TRUST_PROXY` (default `false`) because per-IP limits are meaningless behind a proxy otherwise.
6. **Module 2 `users`** gained `account_type` and `registered_at`; existing rows become `guest` accounts with no credentials.
