# Email verification

```text
register / resend  ->  token issued (random, hashed in auth_tokens, purpose = email_verification, bound to the address)
                   ->  after COMMIT: EmailService.sendVerificationEmail(link)
user opens link    ->  web page reads #token from the URL fragment, scrubs it, POST /auth/email/verify
                   ->  token consumed + auth_identities.email_verified_at set + other verification tokens retired
```

## Token properties

Cryptographically random (256 bit), stored only as SHA-256, **purpose-scoped** (a reset token can never verify, nor vice versa — the purpose is part of the lookup), single-use (an atomic `UPDATE ... WHERE consumed_at IS NULL AND expires_at > now`, so concurrent attempts yield exactly one winner), expiring (`AUTH_VERIFICATION_TOKEN_TTL`, default 24 h) and bound to the address it was issued for. Issuing a new token retires earlier ones, so only the newest link works.

## Endpoints

- `POST /auth/email/verification/request` — registered callers; rate limited (`email_action` per user + `email_action_ip`); silent no-op when already verified. Guests get `GUEST_UPGRADE_REQUIRED`.
- `POST /auth/email/verify` `{ token }` — no session needed (links open on any device). Responses: `{ verified: true, alreadyVerified }`; `INVALID_VERIFICATION_TOKEN`; `VERIFICATION_TOKEN_EXPIRED`. Re-opening a link after success returns `alreadyVerified: true` (safe, idempotent); a _used_ token for an address that is not verified (e.g. superseded by a resend) stays invalid.

The token travels in the URL **fragment** (`/verify-email#token=…`), which browsers never send to servers, proxies or access logs.

## Delivery

`EmailService` is a port (`sendVerificationEmail`, `sendPasswordResetEmail`). Sends happen **after** the transaction commits and are not awaited by the HTTP response (latency would otherwise leak account existence on recovery). Failures are logged without message content; the account still exists and the user can resend (tested with a failing provider).

| Adapter                      | When                                            | Behaviour                                                                                                                                         |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DevelopmentEmailService`    | `EMAIL_PROVIDER=development` (dev/test default) | keeps the last 100 messages in memory, logs the link, powers `GET /api/v1/dev/emails` (loopback only, only registered outside staging/production) |
| `DisabledEmailService`       | staging/production default                      | drops the message, logs a warning **without the link**                                                                                            |
| Resend/Postmark/SES/SendGrid | future                                          | implement `EmailService`; add a value to `EMAIL_PROVIDER`; auth code is unchanged                                                                 |

`EMAIL_PROVIDER=development` is rejected by config validation in staging/production, so production links can never reach logs.

## Housekeeping

`pnpm auth:cleanup-sessions` also removes verification/reset tokens that expired or were consumed more than N days ago.
