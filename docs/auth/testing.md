# Testing authentication

```bash
pnpm test                 # unit tests only (database-free)
pnpm test:integration     # + PostgreSQL/Redis integration (needs `docker compose up -d --wait`)
pnpm db:test              # database suites only
pnpm test:e2e             # Playwright: real browser against the dev servers
```

Integration suites create throwaway `cricketer_test_*` databases from a migrated template (Module 2 harness) and never touch the development database. Redis tests use unique key prefixes.

| Suite                                                  | Covers                                                                                                                                                                                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/auth/unit.test.ts`                              | email normalisation, password policy, Argon2id wrapper, token generation/hash, session expiry & status rules (fake repos), error contract, config validation, cookie attributes, limiter escalation, email adapters, authorization helpers                       |
| `tests/auth/guest-registration.test.ts`                | guest creation/idempotence, token hashing, registration, validation, duplicates, **guest-upgrade acceptance flow (same id, progress intact, rotated session, login returns same account)**, failed-upgrade rollback, concurrent upgrade, concurrent registration |
| `tests/auth/login-sessions.test.ts`                    | login, enumeration parity, suspended/deleted, tampered cookies, idle/absolute expiry with a test clock, throttled `last_seen`, logout (idempotent), logout-all, rotation, session list, rehash                                                                   |
| `tests/auth/recovery.test.ts`                          | verification (valid/expired/used/invalid/repeat/resend/limits/purpose crossover/mail failure), forgot/reset (no leaks, sessions revoked, single-use, concurrency, superseded tokens), change password, audit content                                             |
| `tests/auth/security.test.ts`                          | CSRF, CORS, no-store, injection/oversize, role/user-id smuggling, rate limits, ownership isolation, production cookie, dev mailbox guard                                                                                                                         |
| `tests/auth/redis-and-logging.test.ts`                 | Redis limiter (atomicity, expiry), shared limits across instances, Redis outage fallback, no secrets in logs                                                                                                                                                     |
| `tests/db/auth.test.ts`, `tests/db/migrations.test.ts` | constraints, triggers, CAS/idempotency, cascade, indexes, fresh and incremental migration with existing users                                                                                                                                                    |
| `tests/auth-client.test.ts`                            | web client (cookies, no tokens, error mapping), form validation, storage-free hygiene, autocomplete attributes                                                                                                                                                   |
| `e2e/auth.spec.ts`                                     | guest → upgrade → verify → sign out → sign in (same user id), invalid credentials and a11y attributes, registration, full reset flow with two devices, session loss, mobile layout                                                                               |

## Conventions

- **Time**: `TestClock` (`tests/support/auth.ts`) is injected into the database, sessions, tokens and limiter; tests call `advanceSeconds`, never sleep.
- **Randomness**: production uses `crypto.randomBytes`; the `TokenGenerator` port can be replaced for deterministic tests.
- **Speed**: tests pass `AUTH_ARGON2_MEMORY_KIB=1024`, `AUTH_ARGON2_PASSES=1`; production floors apply only to staging/production.
- **Isolation**: each test builds its own app (own in-memory limiter, own mailbox) on a shared per-file database; unique emails avoid collisions.
- After changing a workspace package, rebuild before running vitest directly (`pnpm prepare:dev`); `pnpm test` does it for you.
