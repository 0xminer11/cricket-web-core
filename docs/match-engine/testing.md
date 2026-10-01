# Testing

Rules tests use resolved internal outcomes to isolate extras, strike swaps, wickets, maiden attribution, targets and counts from randomness. Lifecycle tests exercise format ties, one Super Over pair, runs/wickets margins and terminal states. Replay tests compare complete golden state and every ball. Fuzz tests validate thousands of deliveries across formats with intermediate replay checks.

Balance tests cover skill/timing, modifier clamps, equipment vs skill, pitch/style, shot matchups, contact reachability, edge survival and loft/defence risk. PostgreSQL integration tests exercise authenticated creation/read, ownership, snapshot isolation, stale-action rollback, concurrent idempotency, normalized aggregate reconciliation and completion replay.

```sh
pnpm test
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
```

Integration tests clone an isolated migrated database via the existing test harness. Never point cleanup operations at the development database. Golden fixture is `tests/match-engine/golden-v2.json`; it captures the first implemented engine (v2, replacing the v1 placeholder).
