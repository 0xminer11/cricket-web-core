# Database testing

## Isolation

Integration tests never touch the developer database. `tests/support/global-setup.ts` (only when `INTEGRATION_TESTS=1`) rebuilds `cricketer_test_template` by running **all migrations against an empty database** (a fresh-database test on every run). Each test file clones it into its own `cricketer_test_<random>` database, runs, then drops it (`DROP DATABASE ... WITH (FORCE)`). The harness refuses to create or drop any name that does not match `^cricketer_test_[a-z0-9_]+$`. Files therefore run in parallel without interfering, and tests use unique data instead of truncating.

Server credentials come from `TEST_DATABASE_URL` or `DATABASE_URL` (only the host/credentials are used, never its database name).

```bash
docker compose up -d --wait
pnpm db:test            # database suites + database unit tests
pnpm test:integration   # everything, including the API /ready check
```

`pnpm test` (no Docker) still runs the database-free unit tests in `tests/db-unit.test.ts`.

## Factories

`@the-cricketer/database/testing` (`src/testing/factories.ts`): `createTestUser`, `createTestPlayer`, `createTestCareer`, `createTestTeam`, `createTestMatch`, `createTestInventoryItem`, `defaultAttributes`. They go through the real repositories (so they cannot bypass constraints), use Module 0 archetype values, mark users `origin='test'` and create unique rows per call.

## Coverage

| Suite (tests/db/) | What it proves                                                                                                                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations`      | Empty DB -> latest schema + seed; sequential upgrade with data; tables/constraints/indexes/triggers; TIMESTAMPTZ and UUID conventions; `updated_at` trigger; no static-definition tables                                                                                          |
| `constraints`     | Attribute 101/-5/0 rejected (DB and repository), boundaries 1/100 accepted, profile invariants, foreign-key integrity, RESTRICT on user delete, level/XP caps                                                                                                                     |
| `wallet`          | Credit, debit, insufficient balance, ledger rows, idempotent replay and conflict, **10 concurrent debits -> exactly 3 succeed**, same-key race -> 1 debit, trigger tampering blocked, **rollback test** (debit + item grant + forced failure -> nothing persisted), cursor paging |
| `rewards`         | **Duplicate match reward -> coins/XP/items granted once**, 8 concurrent submissions -> 1, per-source keys, whole-grant rollback, key reuse detection                                                                                                                              |
| `inventory`       | Ownership on every operation, DB-level same-owner FK, one item per slot, replacement, retire/sell, CAS upgrades, idempotent grants, paging                                                                                                                                        |
| `player`          | Atomic foundation creation and full rollback, concurrent XP (25 x 10 = 250), optimistic level-up, locked read-modify-write, skill XP, fatigue clamps, stats per scope, dashboard                                                                                                  |
| `career`          | One active career, append-only history, atomic clamped progress, tier CAS, event occurrences, contract/sponsorship state machines, memberships history, fixtures, training, achievements uniqueness, audit                                                                        |
| `match`           | Version pinning, status machine, innings/over uniqueness, ball ordering/gaps/repeats, aggregates, composite-FK isolation between matches, single completion under concurrency, history query, PvP participants                                                                    |
| `seed`            | Idempotent reference and development seeds, consistent seeded match, production refusal                                                                                                                                                                                           |

Unit tests (`tests/db-unit.test.ts`): limits mirror Module 0, UUIDv7 format/monotonicity, error mapping without leakage, cursors, derived stats, catalog validation, pool env parsing, table inventory, no game logic in schema, web/admin/game-server cannot depend on the database.

Tests avoid printing player records; assertions compare only the fields under test.
