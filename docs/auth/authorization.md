# Authorization

Authentication answers "who is this?"; authorization answers "may they touch this?".

## Rules

1. **The caller's id comes from the session only.** Handlers read `request.auth` (`{ userId, sessionId, accountType, roles }`). Bodies, queries, paths and headers never choose the acting user; `/me?userId=x` and `x-user-id` are ignored (tested).
2. **Guards** (`auth.middleware.ts`): `optionalAuth` (never rejects), `requireAuth` (guest or registered), `requireRegisteredUser` (guests get `REGISTERED_ACCOUNT_REQUIRED`).
3. **Status is enforced on every request.** Suspended → `403 ACCOUNT_SUSPENDED`; deleted → treated as signed out. Suspension needs no session sweep.
4. **Foreign resources are 404, not 403.** `OwnershipGuard.assertPlayerOwnership(userId, playerId)` returns the profile only if it belongs to `userId`; a missing player, someone else's player and a malformed id are indistinguishable (`NOT_FOUND`), so ids cannot be probed.
5. **Prefer self-service routes.** Use `GET /api/v1/player` (resolved with `requireOwnPlayer(userId)`) rather than `GET /players/:playerId` or `/users/:userId`. Where a path id is unavoidable, route it through `assertPlayerOwnership`.
6. **Account id ≠ player id.** They are different UUIDs and no code may assume otherwise (tested).

## Roles

`roles` is currently the constant `['player']`. It is deliberately not a database column on `users`: staff privileges must never be a field on a player account. Future `support`/`moderator`/`admin`/`super_admin` will be explicit grants in their own table, issued by admins, audited, and (for admin) behind strong authentication. The client can never choose a role (strict request schemas reject the attempt).

## Future work

- **Re-authentication** for high-risk actions (change email, link/unlink provider, delete account): require a recent password check or provider re-login; record `authenticated_at` on the session when needed.
- **Admin auth** is out of scope. `apps/admin` stays a development preview ("NOT PRODUCTION READY") until it has separate credentials, MFA, role checks and audit logging; it must not reuse player sessions.
- **Service identity** (workers, bots, the game server) needs its own credentials and a separate trust boundary; never reuse a player session.
- **Account deletion**: `deleted` already blocks all access. A privacy deletion workflow must anonymise the email identity (so the address is freed), revoke sessions, and decide what happens to game rows (retained under an anonymised user for ledger integrity, per Module 2).
- **Change email** (not implemented): authenticated + password re-check → send a verification token bound to the _new_ address (`auth_tokens.email_normalized`) → switch `provider_subject`/`email_normalized` atomically on success → notify the old address. The unique index already prevents the duplicate race.

## Game server (design only)

The realtime server must not invent a second login system and must never see the long-lived cookie. Planned flow: the authenticated web client calls `POST /api/v1/game/session-token`; the API signs a 1–5 minute token (`GameConnectionTokenClaims`: `sub`, `sid`, `aud: 'game-server'`, `iat`, `exp`, `jti`); the client presents it when connecting; the game server verifies the signature (and optionally `jti` single-use) and can re-check session revocation via the API. Only the types exist in Module 3.
