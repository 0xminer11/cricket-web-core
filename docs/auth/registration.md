# Registration and guest upgrade

`POST /api/v1/auth/register` `{ email, password }` (strict schema: unknown fields such as `role`, `userId`, `accountType`, `confirmPassword` are rejected with 400).

| Caller               | Result                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------- |
| No session           | New registered user + email identity + session + verification token, one transaction        |
| Guest session        | **In-place upgrade** of that user (same `users.id`) + session rotation + verification token |
| Registered session   | `409 ALREADY_REGISTERED`                                                                    |
| Email already in use | `409 EMAIL_ALREADY_IN_USE` (registration may reveal this; login/recovery never do)          |

## Guest upgrade transaction

```text
BEGIN
  SELECT ... FROM users WHERE id = A FOR UPDATE      -- serialises concurrent upgrades
  require status = active AND account_type = guest   -- else ALREADY_REGISTERED
  INSERT auth_identities (email_password, subject = normalized email, password hash)
        -- unique index decides duplicate emails; violation rolls everything back
  UPDATE users SET account_type = 'registered', registered_at = now()
  revoke the guest session (reason 'upgraded'), create a fresh one
  INSERT auth_tokens (email_verification)  ;  INSERT audit_logs (auth.registered)
COMMIT
-- then, outside the transaction: send the verification email
```

On any failure nothing changes and the guest keeps their session and progress (tested). Two simultaneous upgrades: exactly one wins; the other gets `ALREADY_REGISTERED` (or `AUTH_REQUIRED` if it lands after the first commit revoked the old token). Two registrations of one address: exactly one `201`, the rest `EMAIL_ALREADY_IN_USE`; the pre-check is only an optimisation, the unique index is the guarantee.

Why not copy data into a new user? Every game table references `users.id`/`player_profiles.id`. Keeping the id makes the upgrade a two-row change with nothing to copy, nothing to forget and nothing to roll back (`tests/auth/guest-registration.test.ts` seeds a player, career, wallet and inventory and asserts they survive).

## Email normalisation

`normalizeEmail` = `trim()` + `toLowerCase()`. The address as typed (trimmed) is stored in `email` for display; the normalised form is stored in `email_normalized` and doubles as `provider_subject`, so `UNIQUE (provider, provider_subject)` enforces one account per address. Deliberately **not** done: Gmail dot/plus folding (would merge distinct mailboxes elsewhere), Unicode folding, IDN conversion (the validator admits ASCII only). Lower-casing the local part is a pragmatic choice (RFC 5321 allows case-sensitive local parts; virtually no provider uses them).

## Password policy

Length only: **10–128 characters** (`AUTH_PASSWORD_MIN_LENGTH`, production floor 10). Spaces, passphrases and password-manager output are valid; there are no composition rules. Passwords are never trimmed or normalised. The client's confirm-password field is a UI nicety and is never sent.

## What registration does not do

It does not create a cricketer (Module 4), grant roles (the client cannot choose any), or require email verification before play. Unverified accounts work; `emailVerified` in `/me` lets later features gate sensitive actions. Delivery failure never rolls back the account: the user can request a new link.
