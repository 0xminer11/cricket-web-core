# Security review (Module 6)

| #   | Risk                                             | Control                                                                                                                                                     | Evidence                                                        |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Reading another player's career by passing an id | no id exists in self-service routes; the player comes from the session via `requirePlayer`; all queries are scoped by the caller's career/player id         | API tests (two players, disjoint fixtures, foreign event → 404) |
| 2   | Enumerating fixtures/events                      | foreign and unknown ids return the same 404; non-UUIDs are 404                                                                                              | API tests                                                       |
| 3   | Smuggling parameters                             | paginated routes use strict query schemas (`playerId=` → 400, unknown status → 400, limit ≤ 50); telemetry body is a strict schema                          | API tests                                                       |
| 4   | Leaking secrets or internals                     | DTO contains no email, identity, session, token, ledger, idempotency key, user/player id or RNG seed; hidden event effects/weights are never serialised     | API test greps the body                                         |
| 5   | Client changing money or progression             | the web feature has no setters and no write calls except the intro flag and telemetry (test-enforced); every endpoint here is GET except two harmless POSTs | `career web feature hygiene` tests                              |
| 6   | Fixture bootstrap abuse or duplication           | runs inside a row-locked transaction, only when the career has zero fixtures, deterministic plan; refreshes and concurrent loads create exactly 5 rows      | API tests (6 concurrent loads, reseed check)                    |
| 7   | Onboarding endpoint                              | whitelist of steps (`career_home_intro`), idempotent insert, strict path, rate limited                                                                      | API test                                                        |
| 8   | Telemetry as an injection/privacy channel        | enum of seven events, no free text, user id attached server-side, `secondsSinceCreation` computed server-side                                               | API test                                                        |
| 9   | CSRF                                             | Module 3 origin guard on unsafe methods; reads are GET                                                                                                      | route hook                                                      |
| 10  | Abuse / flooding                                 | per-route rate limits (reads 120/min, onboarding 30/min, strict in staging/production)                                                                      | route config                                                    |
| 11  | Stale or cached private data                     | `Cache-Control: no-store` and `Pragma: no-cache` on every response                                                                                          | API test                                                        |
| 12  | Malformed DTO reaching the page                  | server validates the DTO with zod before sending; client re-validates every response                                                                        | service + client                                                |
| 13  | Browser storage                                  | none used (a project-wide hygiene test forbids it); the guest banner dismissal is in memory                                                                 | test                                                            |
| 14  | Error messages                                   | stable codes, player-safe text; causes are logged with the request id                                                                                       | error classes                                                   |

## Notes

- Fixture ids (UUIDs) and event ids are returned because links need them; both are only resolvable by the owner.
- Suspended accounts are stopped by the Module 3 middleware before reaching this module.
- There is deliberately no event-choice endpoint yet; it needs the Career Engine so that effects, ledger entries and cooldowns are applied atomically on the server.

## Analytics

Events: `career_home_viewed`, `next_match_opened`, `training_opened`, `dressing_room_opened`, `player_profile_opened`, `career_progression_opened`, `fixture_list_opened`. Sent once per action (never per scroll) to `POST /career/telemetry`; the first two carry `secondsSinceCreation` for the first-session funnel (creation → first Career Home view → first match preparation). Events are logged as structured lines today; nothing alters gameplay based on them.
