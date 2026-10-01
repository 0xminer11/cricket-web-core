# Performance

Measured on a developer laptop, 2026-10-01: production web build (`next start`), API in dev mode (tsx), local PostgreSQL/Redis, headless Chromium. They are local figures, not production claims.

## Payload and latency (`GET /career/home`, starter career, 60 sequential requests)

| Metric                       | Result                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON size                    | 5.9 KB (1.7 KB gzip)                                                                                                                          |
| Server latency p50 / p95     | 9.9 ms / 18.4 ms (includes session lookup and player guard)                                                                                   |
| Database queries per request | **16** (including auth/session + guard); unchanged when the career has 35+ extra fixtures (test)                                              |
| Query shape                  | stage 1: dashboard (4 parallel queries) + upcoming fixtures (1 joined query); stage 2: ~9 parallel reads; no per-fixture or per-match lookups |

## Browser (production build)

| Metric                                    | Cold                                           | Warm        |
| ----------------------------------------- | ---------------------------------------------- | ----------- |
| `/career` ready (button visible)          | ≈ 295 ms                                       | ≈ 92 ms     |
| JS requests / transferred                 | 12 / 257.5 KB                                  | 12 / cached |
| API calls on load                         | `/me`, `/career/home`, `/career/telemetry` (3) | same        |
| Total requests incl. CSS, fonts, prefetch | 34                                             | 34          |
| GLB / canvas / Three.js                   | **none**                                       | **none**    |

## Bundle (gzip of the route's initial scripts)

| Route                       | Before Module 6                | Now                                                            |
| --------------------------- | ------------------------------ | -------------------------------------------------------------- |
| `/play` shell               | 264.0 KB                       | redirects to match preparation                                 |
| `/career`                   | 267.4 KB (old completion page) | **273.5 KB**                                                   |
| `/career/fixtures` etc.     | n/a                            | 275.5 KB                                                       |
| `/training`                 | shell                          | 276.3 KB                                                       |
| `/player`, `/dressing-room` | 265.8 KB                       | 268.4 KB (+2.6 KB for the shared navigation bar in the layout) |

Three.js stays in its separate lazy chunks and is not part of any career route. The Career Home does not import game-core, Phaser, the match engine, player-3d or the asset manifest (enforced by `tests/career/career-logic.test.ts`).

## Why it is cheap

One aggregated request; summaries instead of histories (no ledger, inventory, ball data, full achievements); fixed query count; a 2D SVG portrait instead of a 3D preview; skeletons rather than spinners; no client cache to reconcile.

## Next steps if needed

Add a short server cache keyed by player with the invalidation events listed in [architecture.md](architecture.md); measure on the real deployment before doing so.

## Index review (no new indexes needed)

| Read                                                                    | Served by                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| active career + team                                                    | `careers_one_active_per_player_uniq` / `careers_player_id_idx`, team primary key                                                |
| upcoming / completed fixtures (career, status, ordered by time, keyset) | `fixtures_career_scheduled_idx (career_id, scheduled_at)`; both teams joined by primary key; match by `matches_fixture_id_uniq` |
| fixture count (bootstrap check)                                         | `fixtures_career_scheduled_idx`                                                                                                 |
| pending event                                                           | `career_event_instances_career_status_idx`                                                                                      |
| history page                                                            | `career_history_career_occurred_idx`                                                                                            |
| contract                                                                | `contracts_career_status_idx` / `contracts_one_active_per_career_uniq`                                                          |
| balances, state, stats, achievements, onboarding                        | primary keys of those player-keyed tables                                                                                       |
| recent matches                                                          | `match_participants_player_history_idx` + `matches` primary key (one extra query for innings of the shown matches)              |

Only rows for one career are touched and no query scans a growing history table; adding indexes without a measured problem was deliberately avoided.
