# Testing

pnpm test builds shared packages then runs Vitest under Node. Tests cover pure-Node core imports, Module 0 invariants and rejected mutations, manifest constraints, clocks/RNG/factories, environment validation, runtime transport contracts, both health endpoints, versions, request IDs, status mapping, CORS, security headers, rate limiting and frontend-client failures.

pnpm test:integration additionally connects to local PostgreSQL and Redis and closes both. This is explicit so ordinary unit tests need no Docker; CI requires integration tests. Tests do not reset or seed databases.

pnpm test:e2e starts pnpm dev when absent and exercises shell navigation, shared-core output, admin warnings, health endpoints and mobile layout in Chromium. Install browser using pnpm exec playwright install chromium. Future coverage should include Firefox/WebKit for the modern-browser target, especially iOS Safari. No legacy-browser APIs are required by the shell.

Factories clone approved definitions into isolated test objects. Test/mock data is never used as production definitions. Add behavior tests for new business capabilities, not tests of empty placeholder classes.

Database tests (Module 2): `pnpm db:test` (or `pnpm test:integration`) clones a freshly migrated template into a throwaway `cricketer_test_*` database per test file, so they never touch the developer database, and covers constraints, ledger atomicity/concurrency, duplicate-reward protection, ownership, match persistence, seeds and migrations (fresh and step-by-step upgrade). Database-free unit tests (limits, UUIDv7, error mapping, cursors) run in plain `pnpm test`. See [docs/database/testing.md](../database/testing.md).

## Authentication tests (Module 3)

Auth suites live in `tests/auth/`, `tests/db/auth.test.ts` and `e2e/auth.spec.ts`; the matrix, the injectable `TestClock`, and the fast-Argon2 test settings are described in [docs/auth/testing.md](../auth/testing.md). Browser tests create real accounts in the development database (emails `e2e-*@example.com`); auth rate-limit counters live in Redis (`cricketer:auth:rl:*`) and survive API restarts, so clear that prefix if a local run reports unexpected 429s.

## 3D viewer tests (Module 5)

`pnpm assets:validate` checks every runtime GLB against the character contract and budgets; `tests/player/viewer.test.ts` covers the asset registry, character plan, asset cache and shared appearance validation without WebGL; `tests/player/equipment.test.ts` covers inventory/equipment/appearance APIs; `e2e/player-3d.spec.ts` drives the real viewer (SwiftShader WebGL) through the dressing room, failure fallbacks, mobile layout and a 20-cycle leak check. See [docs/character-3d/testing.md](../character-3d/testing.md).

## Career Home tests (Module 6)

`tests/career/` (rules, API, hygiene), `e2e/career-home.spec.ts` and `e2e/career-a11y.spec.ts` (axe via `@axe-core/playwright`). See [docs/career-home/testing.md](../career-home/testing.md).

## Training tests (Module 7)

`tests/training/` (pure engine and hygiene, API integration incl. concurrency, idempotency and rollback), `e2e/training.spec.ts` and the training case in `e2e/career-a11y.spec.ts`; balance report via `pnpm simulate:training`. See [docs/training/testing.md](../training/testing.md).
