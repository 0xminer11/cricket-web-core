# Sessions and cookies

## Model

```text
Browser cookie  =  raw opaque token (32 random bytes, base64url, 43 chars)
auth_sessions   =  SHA-256(token) + expiry + revocation          (raw token never stored)
Each request    =  read cookie -> well-formed? -> hash -> load row -> revoked? expired? -> user active? -> AuthContext
```

Tokens come from `crypto.randomBytes` (256 bits). SHA-256 is correct for them (and Argon2 would be pointless): the input is high-entropy, so brute force is infeasible, and the lookup runs on every request. Passwords are low-entropy and use Argon2id instead.

A malformed cookie is rejected before any database call. Unknown, revoked, expired, suspended and deleted all produce the same `401 AUTH_REQUIRED` (suspended: `403 ACCOUNT_SUSPENDED` once identity is established); the real reason is logged (`auth.session_rejected`, `reason`) and counted.

## Lifetimes

| Setting                       | Default   | Meaning                                   |
| ----------------------------- | --------- | ----------------------------------------- |
| `AUTH_SESSION_TTL`            | 30 days   | sliding idle window, registered accounts  |
| `AUTH_GUEST_SESSION_TTL`      | 30 days   | sliding idle window, guests               |
| `AUTH_SESSION_ABSOLUTE_TTL`   | 90 days   | hard cap from creation; never extended    |
| `AUTH_SESSION_TOUCH_INTERVAL` | 5 minutes | minimum gap between `last_seen_at` writes |

`expires_at = min(now + idle, absolute_expires_at)`. A request more than one touch interval after `last_seen_at` slides the deadline (compare-and-set UPDATE, so concurrent requests collapse into one write), updates `users.last_seen_at` and re-sends the cookie with the new `Max-Age`. Inside the interval nothing is written and no `Set-Cookie` is sent. No session is permanent.

## Rotation and revocation

A fresh token replaces the old one (old revoked) on: guest → registered, **login** (any pre-login session is revoked), **password change** (other sessions revoked too). **Password reset** revokes every session and issues none. Revocation reasons are stored (`logout`, `logout_all`, `rotated`, `upgraded`, `password_changed`, `password_reset`, `suspended`, `admin`). Suspension/deletion need no sweep: every request checks the user's status.

## Cookie

| Attribute | Value                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| Name      | `cricketer_session` (dev) · `__Host-cricketer_session` when `AUTH_COOKIE_SECURE=true` (default in staging/production) |
| HttpOnly  | always — scripts cannot read it; the web app never touches it                                                         |
| Secure    | `AUTH_COOKIE_SECURE`; **required** in staging/production (boot fails otherwise)                                       |
| SameSite  | `Lax` default (`AUTH_COOKIE_SAME_SITE`); `none` requires Secure and extra CSRF care                                   |
| Path      | `/`; no `Domain` (host-only), which the `__Host-` prefix requires                                                     |
| Max-Age   | remaining idle window                                                                                                 |

Clearing uses exactly the same attributes (browsers ignore a mismatched delete). Development runs over plain HTTP so `.env.example` sets `AUTH_COOKIE_SECURE=false`; that is accepted only outside staging/production.

## Topology

Web (`:3300`) and API (`:4300`) are different **origins** but the same **site** (`localhost`), so a Lax cookie set by the API is sent on the web app's `fetch(..., { credentials: 'include' })`. In production put both under one registrable domain (`play.example.com` + `api.example.com`) and keep `Lax`. If they must be on different registrable domains you need `SameSite=None; Secure` **and** the Origin check (already mandatory); prefer a same-site reverse proxy instead. Authenticated responses are `Cache-Control: no-store` and must never be cached by a CDN; configure CDNs to bypass `/api/*`.

## Scaling

Sessions in PostgreSQL are fine initially (one indexed lookup per request, one write per five minutes per session). Redis can later cache lookups, but PostgreSQL stays the source of truth so revocation remains reliable. `pnpm auth:cleanup-sessions [days]` deletes sessions expired/revoked more than N days ago (default 7); schedule it daily.

`GET /auth/sessions` lists active sessions (id, created/last seen, `current`, coarse device such as "Chrome on macOS"). No IP is stored.
