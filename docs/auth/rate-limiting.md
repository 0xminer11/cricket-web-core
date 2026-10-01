# Rate limiting

Auth throttles sit in front of the generic Module 1 limiter (120 requests/min/IP in deployed environments, still active).

| Policy (`AUTH_RL_<NAME>_MAX` / `_WINDOW` seconds) | Key                              | Default                        | Protects                         |
| ------------------------------------------------- | -------------------------------- | ------------------------------ | -------------------------------- |
| `GUEST`                                           | IP                               | 10 / 3600 s                    | guest farming                    |
| `REGISTER`                                        | IP                               | 10 / 3600 s                    | account spam                     |
| `LOGIN_IP`                                        | IP (every attempt)               | 30 / 900 s                     | credential stuffing breadth      |
| `LOGIN_FAILURE`                                   | IP+email, and email alone        | 5 failures / 900 s (email: 2×) | brute force                      |
| `EMAIL_ACTION`                                    | account / hashed address         | 5 / 3600 s                     | resend and recovery spam         |
| `EMAIL_ACTION_IP`                                 | IP                               | 20 / 3600 s                    | the same, across addresses       |
| `TOKEN_ATTEMPT`                                   | IP (verify/reset), user (change) | 20 / 900 s                     | token guessing, password probing |

## Login: escalating temporary blocks

Failures increment per-pair and per-email counters. Crossing the threshold **blocks** that key for `AUTH_RL_LOGIN_BLOCK_BASE` seconds (default 60) and doubles the block on each repeat within 24 h, capped at `AUTH_RL_LOGIN_BLOCK_MAX` (default 1 h). Blocks always expire — there is no permanent lockout. While blocked, even the correct password is refused (no oracle) and the response is identical for unknown emails. The pair key (IP+email) means an attacker's IP cannot lock the real owner out from their own IP; the email-wide key (2× threshold) stops a distributed attack on one account at the cost of a bounded, temporary inconvenience for its owner. A successful login clears the pair's failure counter.

Responses are `429 RATE_LIMITED` with `Retry-After`; the web UI shows "Too many attempts. Try again in about N minutes."

## Storage

`RateLimitStore` has three implementations: `RedisRateLimitStore` (atomic `MULTI INCR / PEXPIRE NX / PTTL`, shared by every API instance; used when `REDIS_URL` is set; needs Redis ≥ 7), `MemoryRateLimitStore` (per process; default for tests and Redis-less runs) and `ResilientRateLimitStore` (Redis primary, memory fallback with a warning, so an outage degrades to per-instance limits instead of failing logins). Keys contain hashes of IPs and emails, never raw values. Tests use the injected clock, so windows and blocks expire without sleeping, and each app instance starts with empty state.

Behind a reverse proxy set `TRUST_PROXY=true` (only when the proxy is trusted and overwrites `X-Forwarded-For`), otherwise every client shares the proxy's address.

Password hashing is itself bounded: `AUTH_HASH_CONCURRENCY` (default 2) caps simultaneous Argon2 computations so a burst cannot exhaust memory.
