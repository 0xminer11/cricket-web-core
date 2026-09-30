# Testing

pnpm test builds shared packages then runs Vitest under Node. Tests cover pure-Node core imports, Module 0 invariants and rejected mutations, manifest constraints, clocks/RNG/factories, environment validation, runtime transport contracts, both health endpoints, versions, request IDs, status mapping, CORS, security headers, rate limiting and frontend-client failures.

pnpm test:integration additionally connects to local PostgreSQL and Redis and closes both. This is explicit so ordinary unit tests need no Docker; CI requires integration tests. Tests do not reset or seed databases.

pnpm test:e2e starts pnpm dev when absent and exercises shell navigation, shared-core output, admin warnings, health endpoints and mobile layout in Chromium. Install browser using pnpm exec playwright install chromium. Future coverage should include Firefox/WebKit for the modern-browser target, especially iOS Safari. No legacy-browser APIs are required by the shell.

Factories clone approved definitions into isolated test objects. Test/mock data is never used as production definitions. Add behavior tests for new business capabilities, not tests of empty placeholder classes.

Database tests (Module 2): `pnpm db:test` (or `pnpm test:integration`) clones a freshly migrated template into a throwaway `cricketer_test_*` database per test file, so they never touch the developer database, and covers constraints, ledger atomicity/concurrency, duplicate-reward protection, ownership, match persistence, seeds and migrations (fresh and step-by-step upgrade). Database-free unit tests (limits, UUIDv7, error mapping, cursors) run in plain `pnpm test`. See [docs/database/testing.md](../database/testing.md).
