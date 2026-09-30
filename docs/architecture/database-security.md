# Database security boundary

## Trust model

```text
Browser / Phaser client ──HTTP/WebSocket──▶ API / game server ──▶ repositories ──▶ PostgreSQL
   (untrusted)                              (validates, authorises)   (ownership-aware)   (final integrity)
```

- **The browser can never reach PostgreSQL.** No connection string, driver or ORM is exposed to web/admin/game-server bundles: `apps/web` and `apps/admin` do not depend on `@the-cricketer/database` (lint dependency rules and `tests/db-unit.test.ts` enforce it), and `NEXT_PUBLIC_*` values never carry credentials. Only `apps/api` depends on the package today; the game server will get its own narrowly scoped access when Module 6+ needs it.
- **The client cannot modify persistent values.** It submits intent (`equipItem`, `startTraining`, `acceptContract`), never results (`coinsEarned`, `newSkillValue`, `matchWinner`). Clients are not authoritative for coins, gems, XP, level, skills, inventory, equipment, contracts, career progress, match results, rewards, purchases or rankings (see [game design 16](../game-design/16-security-authority.md)).
- **The API/service layer authenticates and authorises** (Module 3) and derives `playerId` from the session, never from the request body.
- **Repositories enforce ownership-aware access.** Inventory, training, contract, sponsorship, career-event and match reads/writes take the acting `playerId` (or a `careerId` resolved from it) and resolve foreign ids only within that scope. Another player's id yields `OwnershipViolationError`, indistinguishable from "not found". There is no `getItemById(itemId)` without a player. PostgreSQL re-proves it for equipment via the composite foreign key `(inventory_item_id, player_id)`.
- **Wallet mutations are server-only and ledgered.** `WalletRepository` is the only writer of `currency_balances`; a trigger rejects any other balance change, and ledger/audit/career-history rows cannot be updated or deleted. There is no `setBalance`.
- **Match completion is an authoritative server operation.** Status compare-and-set + row lock + `reward_grants` uniqueness make a completed match un-replayable and un-double-rewardable.
- **Admin modifications require auditing (future).** `audit_logs` is append-only and admin entries require an `actor_id`; any future admin mutation must write its audit row in the same transaction as the change. No admin API exists yet.

## Defence in depth

| Layer      | Control                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript | Explicit repository methods (no `updateAnything`), ranges validated before queries, Module 0 ids validated with `DefinitionCatalog`                                         |
| Repository | Ownership scoping, compare-and-set state machines, idempotency, atomic SQL arithmetic, error mapping (no SQL/params/driver text leaves the package)                         |
| PostgreSQL | FKs (mostly RESTRICT), CHECK ranges/invariants, unique/partial-unique constraints, immutability and ledger-write triggers, TIMESTAMPTZ                                      |
| Operations | Least-privilege application role (no `TRUNCATE`, no DDL; only the migration role owns schema), TLS to the database, encrypted backups, secrets from the environment manager |

Triggers cannot stop a superuser or table owner; production must run the API with a role that has only `SELECT/INSERT/UPDATE` on tables (and `USAGE` on sequences), and a separate migration role. This is a deployment requirement to enforce with infrastructure.

## Data minimisation

The schema stores no email, password, address, phone, date of birth, government id or precise location (authentication data arrives with Module 3 in its own tables). Personal data is limited to `display_name` (and its snapshots in matches). Tests and logs never print whole player records; failure logs contain `{ requestId, operation, errorType, durationMs }` only, and `pino` redaction already covers `DATABASE_URL`.

## Error exposure

`mapDatabaseError` converts driver failures into `PersistenceError`s with stable codes. API error handlers (Module 1's `setErrorHandler`) already return generic messages for non-`AppError`s; route modules should map `PersistenceError.code` to `AppError` subclasses (for example `INSUFFICIENT_BALANCE` -> 409, `OWNERSHIP_VIOLATION` -> 404, `UNIQUE_VIOLATION` -> 409, `INVALID_INPUT` -> 400) and never forward `constraint` names to clients. `/ready` reports only dependency names.

## Environment separation

Development seeds exist only when `APP_ENV` is development/test; development users carry `origin='development'` so their absence in production can be asserted. `db:reset` refuses non-local hosts and non-development environments. Integration tests only create/drop `cricketer_test_*` databases.
