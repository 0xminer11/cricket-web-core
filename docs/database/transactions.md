# Transactions and concurrency

## API

```ts
const database = createDatabase(process.env, { logger });          // one per process
await database.transaction(async (tx) => {
  const repos = database.repositories(tx);                         // every repository bound to tx
  await repos.wallet.debit({ ... });
  await repos.inventory.grantItem({ ... });
});
```

`database.transaction()` runs READ COMMITTED by default, retries the whole callback up to twice on serialization failure/deadlock (so callbacks must only touch the database), logs transactions slower than `DATABASE_SLOW_QUERY_MS` and rethrows **mapped** errors. Repository methods that need several statements open their own transaction; called inside an existing one they become savepoints, so they compose without changing atomicity. `createRepositories(executor)` accepts the pool or a transaction.

Sibling repositories used inside a transaction must be rebuilt on that transaction (as `RewardRepository` does via its `bind` function). Using an outer executor would commit on a different connection and defeat rollback - an integration test guards this.

## Concurrency strategy

| Hazard                                    | Mechanism                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two purchases / debits at once            | Wallet row lock, then guarded `UPDATE ... SET balance = balance + $n WHERE balance >= $n`; zero rows => `InsufficientBalanceError`. Arithmetic is in SQL |
| Duplicate submit of the same operation    | Idempotency key checked while holding the wallet lock; unique index `(player_id, currency_type, idempotency_key)` as backstop                            |
| Double reward (match, achievement, ...)   | `reward_grants` unique `(player_id, source_type, source_id)`; `INSERT ... ON CONFLICT DO NOTHING` decides the winner, only the winner applies effects    |
| Lost XP / skill XP / stats / fans updates | Atomic `x = x + n` (and `LEAST/GREATEST` clamps) in one UPDATE; concurrent awards add up                                                                 |
| Level-up computed from stale state        | Compare-and-set on `row_version` (`StaleWriteError`), or `getState(id, { forUpdate: true })` inside a transaction                                        |
| Skill point from stale skill XP           | `applySkillPoint` compares the expected `skill_xp`                                                                                                       |
| Two completions of a match/training       | Status compare-and-set (`WHERE status = 'in_progress'`) plus row lock; the loser gets `InvalidStateTransitionError`                                      |
| Concurrent ball submissions               | The innings aggregate UPDATE locks the innings row; sequence numbers must be contiguous, otherwise `InvalidInputError`                                   |
| Cross-player item access                  | Every inventory operation takes `playerId`; composite FK re-proves same-owner in the database                                                            |

XP strategy in one line: **additive changes are atomic increments; multi-field changes (level-up) are optimistic or locked**.

## Player creation

`createPlayerFoundationAtomic(database, input)` (persistence only; no API) atomically creates profile, appearance, attributes, personality, state, empty career stats, wallets with `starter_grant` ledger rows, career (+ `career_started`/`team_joined` history), team membership, starter inventory, equipped items and starter achievement rows. Any failure (for example an unknown starter item) rolls everything back. The character-creator module supplies the values; nothing here decides them.

## Future match-completion transaction

```text
BEGIN
  SELECT ... FROM matches WHERE id = $1 FOR UPDATE           -- completeMatch locks
  verify status = 'in_progress' and all innings completed    -- else InvalidStateTransitionError
  completeInnings(...)  -- verifies stored aggregates against balls
  matches.status = 'completed', result, completed_at
  setPerformanceRatings(...)
  players.applyStatsDelta(career, season, format scopes)
  careers.applyProgressDelta(fans, reputation, selector interest)
  rewards.grantOnce({ sourceType: 'match', sourceId: matchId })  -- coins, XP, skill XP, items, once
  contracts.recordContractMatch(...), achievements.incrementProgress(...)
COMMIT     -- any failure => ROLLBACK, nothing is half-applied
```

Every step already exists as an explicit repository method; the game-server/API module composes them and supplies the computed numbers. A resubmission fails at the status check, and even a bug that bypassed it would be stopped by the unique `reward_grants` row.

## Errors

Nothing raw leaves the package. `mapDatabaseError` converts driver codes into `UniqueViolationError`, `ForeignKeyViolationError`, `CheckViolationError`, `NotNullViolationError`, `TransactionConflictError`, `QueryTimeoutError`, `DatabaseConnectionError`, `InvalidInputError`, `IntegrityError` (trigger refusals) or `UnknownDatabaseError`, alongside domain errors (`RecordNotFoundError`, `OwnershipViolationError`, `InsufficientBalanceError`, `InvalidStateTransitionError`, `IdempotencyConflictError`, `StaleWriteError`, `UnknownDefinitionError`, `InvalidCursorError`). All extend `PersistenceError` with a stable `code`; they carry a constraint identifier at most, never SQL, parameters or row data. The API maps them to HTTP in the module that owns each route.

## Health and observability

`GET /ready` on the API reports `{ "database": "ok" }` (503 `NOT_READY` naming only the failed dependency; details go to logs, never to the response). `/health` stays a process-liveness check. Failures are logged as `{ requestId, operation, errorType, durationMs, attempt }`; no record contents. Set `DATABASE_SLOW_QUERY_MS` to log slow transactions; Compose PostgreSQL also runs with `log_min_duration_statement=250` for server-side slow-query logs in development.
