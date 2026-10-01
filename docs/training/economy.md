# Economy, wallet and the daily capacity safeguard

## Cost

Module 0 prices basic training at 60-90 coins and advanced at 140+ (`ECONOMY_CONFIG.training`). Drills use those bands; rest is free. **Gems are never charged**: the config validator rejects any drill with a non-coin cost, and there is no energy system and no wait-or-pay mechanic.

## Wallet integration (Module 2 primitives only)

Inside the training transaction: `wallet.debit({ type: 'training_cost', reference: { type: 'training', id: sessionId }, idempotencyKey: 'training:<sessionId>' })`. The wallet repository locks the balance row, applies a guarded atomic `UPDATE ... WHERE balance >= amount`, and appends the ledger row (`balance_before/after`). There is no `setBalance` anywhere. The session row stores the ledger id (`wallet_transaction_id`) and the cost snapshot. If anything later fails, the debit rolls back with the rest.

| Case                                      | Result                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| balance = cost                            | succeeds, balance 0 (tested)                                                             |
| balance = cost - 1                        | `INSUFFICIENT_CURRENCY`, no change anywhere (tested with a full before/after comparison) |
| two simultaneous purchases, funds for one | exactly one succeeds, balance never negative (tested, also over HTTP in a browser test)  |
| repeated request                          | one debit (tested)                                                                       |

The UI never sends users to buy gems: it says "Requires 60 coins. You have 59."

## Income vs cost

Coins come from matches (Module 0: 120-240 participation plus bonuses) and achievements; matches do not exist yet. [balancing.md](balancing.md) models a stand-in income and shows that training at the intended pace consumes roughly the whole income of a casual player, so coins, not a timer, are the pacing resource.

## IMPLEMENTATION BALANCE SAFEGUARD: daily capacity

Module 0 has a fatigue guardrail but no answer to "free, instant recovery plus unlimited drills". Rather than ship infinite progression, drills have a **soft daily capacity** (training load):

| Drill number today (UTC) | Skill and Player XP multiplier                 |
| ------------------------ | ---------------------------------------------- |
| 1 - 5                    | 1.0                                            |
| 6 - 8                    | 0.6                                            |
| 9 - 12                   | 0.3                                            |
| 13+                      | 0.1 (a floor: effort is never wasted entirely) |

Nothing is locked and nothing waits. The "day" is the **server's UTC calendar day** from the injected `Clock` (never the browser's), computed as the start of day in the `countSince` query over completed sessions, so there is no reset job and no extra column. A test advances the clock past midnight and sees the full value return. The hub shows "Drills today" and, past five, a plain-language note. Constants: `TRAINING_RULES.dailyLoad`.

Documented as an **IMPLEMENTATION BALANCE SAFEGUARD**; revisit when match income exists.
