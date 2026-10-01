# Guest accounts

`POST /api/v1/auth/guest` lets a visitor play immediately. It creates a real, server-generated identity: a `users` row with `account_type = 'guest'` and a session. Nothing the client holds (local storage, a query string, a body field) is ever authoritative.

## Behaviour

- **No session / invalid session** → create the user and session in one transaction (audit `auth.guest_created`), return **201** and `Set-Cookie`.
- **Valid session already present** → return **200** with the current user and create nothing. Repeated clicks or tabs never mint extra guests.
- Guests have **no password and no identity row**. There is no empty hash anywhere; `account_type` alone says "guest".
- The page load never creates a guest. Only the explicit "Continue as Guest" action does (`GET /me` is the bootstrap).
- Guests may use everything a registered account may except credential features: `logout-all` → `REGISTERED_ACCOUNT_REQUIRED`; password change / verification resend → `GUEST_UPGRADE_REQUIRED`.

## Lifetime and product behaviour

A guest session slides for `AUTH_GUEST_SESSION_TTL` (default 30 days idle) up to `AUTH_SESSION_ABSOLUTE_TTL` (default 90 days). Guest progress is **bound to that session**: clearing browser data, switching browser/device or expiry loses access. The UI therefore says "Create an account to protect your progress" and never promises recovery.

**Registered accounts** are reachable from any supported device after sign-in. Sessions are not limited per user; `logout-all` is the control.

## Abuse

Guest creation is the cheapest write an attacker has, so it is rate limited per IP (`guest` policy, default 10 per hour in production). A valid session never counts. Rows created by farming are ordinary guest users; the retention sweep removes their dead sessions, and a future module may expire never-used guest accounts that have no player. No device fingerprinting is used.

## Upgrading

See [registration](registration.md): the same `users.id` gains an email identity, so the player, career, wallet, inventory, matches and achievements attached to that id are untouched.
