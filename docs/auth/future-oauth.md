# Future: OAuth, Apple, magic links, passkeys

Nothing here is implemented; the model is ready for it.

## Why it fits

- `users` is the account; `auth_identities` is "a way to prove you are that account". `UNIQUE(provider, provider_subject)` already covers Google/Apple (`sub`), and `UNIQUE(user_id, provider)` limits one identity per provider per user. Identity rows can never move between users (trigger).
- `AccountType` stays `guest | registered` whatever the provider; a Google user is a `registered` account whose only identity is `google`. There is no `google_user` type.
- `AuthProvider<TCredentials>` (`auth.types.ts`) returns `{ ok, provider, user } | { ok: false, reason }`. `AuthService` owns status checks, rate limits, session issuance/rotation and audit, so every provider gets the same rules. `EmailPasswordProvider` is the reference implementation.
- `auth_identities.email_verified_at` is per identity, which is what linking decisions need.

## Adding a provider (outline)

1. Add the id to `AUTH_PROVIDERS` and the `auth_identities_provider_check` constraint (new migration).
2. Implement `AuthProvider` (verify the OIDC ID token: signature, `iss`, `aud`, `exp`, `nonce`; use `sub` as `provider_subject`; take `email` + `email_verified` as claims).
3. Add routes (`/auth/oauth/:provider/start|callback`) with state/nonce/PKCE and the existing origin/rate-limit guards.
4. Reuse the guest-upgrade transaction: a signed-in guest who links Google keeps their `users.id`.

## Duplicate-account policy (decide before building)

A user with email/password later taps "Sign in with Google" using the same address. **Never merge automatically on matching email alone.**

- Merge/link automatically **only** when the provider asserts `email_verified = true` for an address that is also verified on the existing account; otherwise an attacker who controls an unverified registration (pre-hijacking) or a lax provider could take over the account.
- Preferred safe flow: sign in with the existing method first, then **link** the provider from account settings (re-authentication required, see [authorization](authorization.md)). If a social login arrives for an address that already has a password account and cannot be linked automatically, answer "sign in with your existing method, then link Google", never revealing more than the user asked for.
- Unlinking must require re-authentication and refuse to remove the last remaining login method.
- Guests linking a provider: no new user, no merge — same in-place upgrade as email.

## Other methods

Magic link = a new `auth_tokens` purpose with a short TTL and the existing consume-once logic. Passkeys = a `passkey` provider with credential rows in a new table; the user id stays the stable anchor. MFA and admin auth are documented in [authorization](authorization.md); SMS authentication is intentionally excluded (cost and fraud surface).
