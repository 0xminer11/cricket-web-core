# Security notes

## Passwords

- **Argon2id** via Node's built-in `crypto.argon2` (OpenSSL), no native dependency. PHC format `$argon2id$v=19$m=…,t=…,p=…$salt$hash`; 16-byte random salt per hash; 32-byte tag; constant-time comparison. Malformed or foreign hashes verify as `false`, never throw; a tampered row cannot request more than 1 GiB.
- **Parameters** (`AUTH_ARGON2_MEMORY_KIB`/`PASSES`/`PARALLELISM`, `AUTH_HASH_CONCURRENCY`): default 64 MiB, 3 passes, 1 lane (RFC 9106 second recommendation, ≈90 ms on a laptop core). Staging/production refuse anything below the OWASP floor of 19 MiB / 2 passes.
- **Tuning**: run `pnpm auth:benchmark-hash` on the real API instance. Aim for roughly 50–250 ms per hash and keep `memory × AUTH_HASH_CONCURRENCY` well inside RAM. Stronger settings raise login latency and CPU/memory per login; weaker ones lower attacker cost. Raising parameters later is safe: old hashes keep verifying (parameters are in the string) and are upgraded transparently at the next successful login (`needsRehash`).
- **No pepper.** A pepper only helps with an operational secret-management story (rotation, HSM/KMS) that does not exist yet; Argon2id with a unique salt is sufficient and a half-managed pepper is a liability.
- **Timing**: unknown emails verify against a throwaway hash so response time does not reveal which addresses exist.
- **bcrypt?** Not needed: Node 24.21 ships Argon2id, so the stronger algorithm costs no dependency.

## Secrets at rest

Only hashes are stored: password hashes (Argon2id), session/verification/reset token hashes (SHA-256). Raw tokens exist only in the cookie / email link. Raw passwords and tokens are never logged or audited (tested by scanning logs and audit rows). API responses never contain hashes (tested). The Module 1 logger already redacts `password`, `token`, `authorization`, `cookie`.

## Logging and audit

Audit (`audit_logs`, actor `user` or `system`): `auth.guest_created`, `auth.registered`, `auth.login_success`, `auth.login_failed` (only for known accounts — unknown identifiers are logged, not stored, so an attacker cannot grow the table), `auth.logout`, `auth.logout_all`, `auth.password_changed`, `auth.password_reset_requested`, `auth.password_reset_completed`, `auth.email_verified`, `auth.session_revoked`. Metadata holds ids, counts and categories only. Structured logs carry `requestId`, an internal `reason` (`bad_password`, `unknown_identity`, `deleted_user`, `suspended_user`, `expired_session`, `revoked_session`, …) and a 16-hex hash of the identifier — never the email, IP, password or token. Analytics events (`auth_guest_created`, `auth_registration_completed`, `auth_login_completed`, `auth_logout_completed`, `auth_guest_upgraded`, `auth_email_verified`, `auth_password_reset_completed`) carry only the user id. `LogAuthTelemetry` keeps counters for registration/login success and failure, blocked logins, guest creation, guest upgrades (conversion), session validation errors and reset requests; no monitoring vendor is bundled.

## Account status

`active`, `suspended`, `deleted` (Module 2). Suspension is enforced on every request, so existing sessions stop working immediately; an admin tool only has to call `users.changeStatus` (it may additionally revoke sessions with reason `suspended`). Deleted accounts cannot sign in or use a session; the privacy-deletion workflow itself is future work (see [authorization](authorization.md)).

## Other controls

- Strict zod schemas; unknown fields rejected; password ≤ 128 chars; bodies ≤ 4 KiB; email ≤ 254.
- Parameterised queries only (Drizzle); injection strings are exercised in tests.
- Database CHECKs/triggers: token hash shape, session expiry ordering, revocation pairing, email identity shape, no registered → guest, identities never reassigned.
- Headers: Module 1 helmet, `Cache-Control: no-store` on all `/api/v1` responses, noindex on the web app.
- Dev-only utilities are guarded: `/api/v1/dev/emails` (development/test + loopback), `auth:create-test-user` (refuses staging/production).
- Next.js dev servers bind to 127.0.0.1.

## Config that must be right in production

`NODE_ENV=production`, `AUTH_TRUSTED_ORIGINS` (https, also in `CORS_ORIGINS`), `AUTH_COOKIE_SECURE=true` (default), Argon2 at or above the floor, `EMAIL_PROVIDER` ≠ `development`, `TRUST_PROXY` only behind a trusted proxy. The API refuses to start otherwise.

## Manual security acceptance review (Module 3)

| Check                                      | Result | Evidence                                                                        |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------- |
| No plaintext passwords stored or logged    | ✓      | identity CHECK requires an Argon2 hash; log/audit scan tests                    |
| No raw session token stored                | ✓      | `auth_sessions.token_hash` CHECK `^[0-9a-f]{64}$`; test compares cookie to rows |
| No access token in localStorage            | ✓      | web hygiene test (no storage APIs in `apps/web/src`); e2e asserts empty storage |
| No client-controlled user identity or role | ✓      | strict schemas, `/me` ignores ids, role/userId bodies → 400                     |
| No wildcard credentialed CORS              | ✓      | CORS matrix test                                                                |
| Tokens short-lived, hashed, single-use     | ✓      | reset 1 h, verification 24 h, atomic consume, concurrency tests                 |
| No guest-upgrade data loss                 | ✓      | same id + seeded player/career/wallet/inventory assertions                      |
| Password reset kills sessions              | ✓      | reset tests + e2e                                                               |
| No enumeration on login / recovery         | ✓      | identical bodies/status; throttle parity                                        |
