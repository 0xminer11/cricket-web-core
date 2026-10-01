# Transaction design

## One unit of work

```text
BEGIN
  INSERT player_profiles            -- UNIQUE(user_id): the one-cricketer rule
  INSERT player_appearance, player_attributes, player_personality, player_state, player_stats
  INSERT currency_balances; wallet_transactions (starter_grant coins, gems)   -- ledger + balance
  INSERT careers + career_history(career_started)
  INSERT teams (canonical, idempotent) ; team_memberships ; career_history(team_joined)
  INSERT player_inventory x7 (source 'starter') ; equipped_items x7
  INSERT audit_logs (player.created)
COMMIT
-- then: domain event + analytics (no I/O inside the transaction)
```

It reuses Module 2's `createPlayerFoundationIn(repos, input)` with repositories bound to a transaction, plus the audit insert in the same transaction. Any failure rolls back **everything**: no profile without a career, no wallet without items, no half-equipped kit.

- **Before the transaction**: validation, game-core derivation and request hashing (no database work).
- **Inside**: database writes only. No analytics, email or network calls.
- **After commit**: `player.created` is published through a `DomainEventPublisher` port and analytics events are tracked. Nothing is published for a rolled-back creation (tested).
- **Retries**: `database.transaction` retries serialization failures/deadlocks (Module 2); the callback has no external side effects, so re-running is safe.
- **Failures** that are not a known domain error become `PLAYER_CREATION_FAILED` (HTTP 500) with a generic message; the log line carries `requestId`, `userId`, the error type and persistence code, never SQL or the request.

## Concurrency and idempotency

| Situation                                                      | Outcome                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Same user, two simultaneous requests, **same Idempotency-Key** | one `201`, the others `200` with `created: false` and the same player |
| Same user, simultaneous requests, **different keys / no key**  | one `201`, the rest `409 CRICKETER_ALREADY_EXISTS`                    |
| Retry after success, same key and identical decisions          | `200`, `created: false`, original player, nothing granted twice       |
| Same key, different decisions                                  | `422 IDEMPOTENCY_KEY_REUSED`                                          |
| Retry after a failed (rolled back) attempt                     | creates normally; no key was stored                                   |

How it holds: the application pre-check is only a fast path. The decider is the unique index `player_profiles_user_id_uniq`: the second concurrent insert blocks until the first commits and then fails with a unique violation, which the service converts into the replay/conflict decision by re-reading the winner. The key and the SHA-256 of the canonical decisions are stored on the profile (`creation_key`, `creation_request_hash`, CHECK-guarded); wallet and inventory rows carry their own idempotency keys (`starter:<userId>:...`) as a second layer.

## Testing the rollback

`tests/player/creation.test.ts` injects a catalog (via the existing `DatabaseOptions.catalog` seam) that fails when the repositories resolve the _last_ kit item, after the profile, attributes, wallet, career and six items were already written. The test asserts zero rows in every table, no audit row, no event, `hasCricketer` still false, and that the same user can then create successfully.
