# Economy ledger

Two currencies from Module 0: `coins` and `gems`. Balances are integers, never negative (MVP has no debt), and change **only** through `WalletRepository`, which always writes a ledger row in the same transaction.

## Tables

`currency_balances(player_id, currency_type, balance)` - current value.
`wallet_transactions` - immutable ledger:

| Column                            | Meaning                                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `amount`                          | Signed, non-zero. Positive credit, negative debit                                                                                                                                 |
| `balance_before`, `balance_after` | Snapshots; CHECK `balance_after = balance_before + amount` and both `>= 0`                                                                                                        |
| `transaction_type`                | `starter_grant, match_reward, training_cost, item_purchase, item_sale, item_upgrade, achievement_reward, career_event_reward, contract_payment, sponsor_payout, admin_adjustment` |
| `reference_type`, `reference_id`  | What caused it (`match`/`<matchId>`, `training`/`<sessionId>`, ...). Required                                                                                                     |
| `idempotency_key`                 | 8-128 chars; unique per `(player_id, currency_type, idempotency_key)`                                                                                                             |
| `metadata`                        | Supplemental JSONB                                                                                                                                                                |
| `created_at`                      | `clock_timestamp()` at insert                                                                                                                                                     |

Sign rules per type are CHECKed: `training_cost`, `item_purchase`, `item_upgrade` must be negative; `starter_grant`, `match_reward`, `achievement_reward`, `item_sale`, `contract_payment`, `sponsor_payout` must be positive; `career_event_reward` and `admin_adjustment` may be either.

## Guarantees

1. **No silent balance change.** A trigger on `currency_balances` rejects any balance change unless the transaction set `app.wallet_write` (only `WalletRepository` does). Raw SQL or a mistaken `db.update(currencyBalances)` fails with `IntegrityError`. New rows may only be created at zero.
2. **Immutable history.** A trigger rejects UPDATE and DELETE on `wallet_transactions` (same for `audit_logs`, `career_history`). Corrections are new compensating rows.
3. **Atomic debit.** Lock the wallet row -> replay check -> `UPDATE ... WHERE balance >= amount` -> insert ledger row. Insufficient funds leave both tables untouched.
4. **Idempotent.** The same key with the same operation returns the original row (`replayed: true`) and changes nothing; the same key with a different amount/type/reference is an `IdempotencyConflictError`.
5. **Auditable.** `WalletRepository.reconcile(playerId, currency)` proves `balance = SUM(amount)` and that each row's `balance_before` equals the previous row's `balance_after`. Run it in support tooling and periodic jobs.

## Usage

```ts
await database.transaction(async (tx) => {
  const { wallet, inventory } = database.repositories(tx);
  await wallet.debit({
    playerId,
    currency: 'coins',
    amount: price,
    type: 'item_purchase',
    reference: { type: 'shop_purchase', id: purchaseId },
    idempotencyKey: `purchase:${purchaseId}`,
  });
  await inventory.grantItem({
    playerId,
    itemDefinitionId,
    source: 'shop',
    idempotencyKey: `purchase:${purchaseId}:item`,
  });
});
```

Derive idempotency keys from the business event (`match:<id>:reward`), not from a random value generated per request, or retries cannot dedupe. Amounts are computed by game logic and validated against Module 0 config before they reach the repository; the repository never decides a price or reward.

## Rewards

`RewardRepository.grantOnce({ sourceType, sourceId, payload, idempotencyKey })` is the single gate for multi-effect rewards. It inserts a `reward_grants` row (unique per player + source); only the call that inserts applies the payload: coins/gems (ledger rows keyed `<key>:coins`), player XP, skill XP, career fans/reputation/selector interest and items (keyed `<key>:item:<n>`). A duplicate request returns `{ granted: false }` and touches nothing. Everything commits or rolls back together.

## Acquisition sources and payments

`player_inventory.acquisition_source` distinguishes `starter, shop, reward, achievement, contract, sponsor, premium_purchase, admin_grant, promotion`. Real-money purchases are not built; the monetisation module adds a `purchases` table referencing the ledger row, and `premium_purchase` items already have a slot.

## Admin adjustments

`admin_adjustment` exists as a ledger type, but no admin mutation is implemented. When added, it must go through `WalletRepository` and write an `audit_logs` row (`AuditRepository.record`, actor mandatory for admins) in the same transaction.
