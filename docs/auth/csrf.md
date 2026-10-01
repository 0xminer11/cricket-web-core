# CSRF and origin policy

Cookie authentication is ambient: a malicious page can make the victim's browser attach the session cookie to a request. JSON bodies do not prevent this by themselves, so Module 3 uses layered defences.

1. **SameSite=Lax** cookie: not sent on cross-site POSTs.
2. **Mandatory trusted origin on every unsafe request** (`POST`/`PUT`/`PATCH`/`DELETE` under `/api/v1`, including login, guest and logout — login CSRF is real): the `Origin` header must exactly match `AUTH_TRUSTED_ORIGINS`; if absent, the `Referer`'s origin is used; if neither is present, or the value is `null`, the request is refused with `403 CSRF_ORIGIN_INVALID` _before_ any handler or state change. GET/HEAD/OPTIONS are exempt (they must be side-effect free).
3. **Strict schemas**: bodies must be JSON objects with exactly the documented fields (anything else is `400`), capped at 4 KiB.
4. **Preflight**: a cross-origin `application/json` request triggers a CORS preflight that only trusted origins pass. "Simple" requests that skip preflight (e.g. `text/plain`) are still stopped by layer 2.

No CSRF token is needed while the API and web share a site and the Origin check holds; a double-submit token can be layered on later if the deployment ever uses `SameSite=None`.

## CORS

`/api/*` uses credentialed CORS for exactly `AUTH_TRUSTED_ORIGINS` (each must also appear in `CORS_ORIGINS`); `Access-Control-Allow-Origin` is never `*`, and an allowed-but-untrusted origin (e.g. the admin app) gets neither the origin nor the credentials header on `/api/*`. All other routes (`/health`, `/ready`, `/version`) keep the Module 1 credential-less policy. Production config rejects non-https trusted origins; localhost values exist only in `.env.example` and the development defaults, never in production code paths.

Tests: `tests/auth/security.test.ts` covers missing/forged/`null` origins, Referer fallback, forged cross-site logout/password-change with a valid cookie, and the CORS matrix.
