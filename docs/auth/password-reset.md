# Password recovery

## Forgot

`POST /auth/password/forgot` `{ email }` always answers `200 { message: "If an eligible account exists, recovery instructions have been sent." }` — same body, status and (by construction) comparable timing whether the address is registered, unknown, suspended or deleted. Rate limits apply identically to all addresses (`email_action` keyed by a hash of the address, plus `email_action_ip`), so a 429 reveals nothing either. Only **active** accounts with an email identity get a token and an email; the send is fire-and-forget after the DB write, so provider latency is not a side channel. Ineligible requests are logged as `auth.password_reset_ignored` with a hashed identifier only.

## Reset

`POST /auth/password/reset` `{ token, newPassword }`:

1. per-IP `token_attempt` throttle;
2. read-only token inspection **before** hashing (bad tokens never cost an Argon2 computation);
3. one transaction: atomically consume the token → set the new hash → mark the address verified (the link proved mailbox control) → **revoke every session** → retire all other reset tokens → audit `auth.password_reset_completed` and `auth.session_revoked`;
4. **no session is issued**; the user signs in again (a deliberate choice: a stolen session can never survive a reset, and the new session is created by a normal login).

Properties (all tested): single-use under concurrency (5 parallel resets → 1 success), expiry `AUTH_RESET_TOKEN_TTL` (default 1 h, shorter than verification), an older email cannot reset after a newer one was requested or after a reset succeeded, tokens are hashed and purpose-bound, the old password stops working immediately, other devices are signed out.

## Change password (signed in)

`POST /auth/password/change` `{ currentPassword, newPassword }` for registered accounts: verifies the current password (wrong → `400 INVALID_CREDENTIALS` with a specific message; it is the user's own session), rejects reusing it, revokes all **other** sessions, rotates the current one, audits `auth.password_changed`. Guests: `GUEST_UPGRADE_REQUIRED`.

## Enumeration policy by route

| Route                 | Reveals existence?                                                     |
| --------------------- | ---------------------------------------------------------------------- |
| register              | yes — `EMAIL_ALREADY_IN_USE` (the user asked to create that account)   |
| login                 | no — one message for unknown, wrong password, deleted, malformed input |
| forgot password       | no — identical response, throttle and timing class                     |
| verify / reset tokens | tokens are unguessable; error codes distinguish only invalid/expired   |
