# Starter equipment, wallet and career start

## Loadout (`STARTER_LOADOUT`)

| Slot   | Item                        | Notes                                                 |
| ------ | --------------------------- | ----------------------------------------------------- |
| bat    | `item.bat.street_willow_01` | Module 0 "balanced starter bat" (Power +1, Timing +1) |
| helmet | `item.helmet.core_guard_01` | Module 0 level-1 helmet (Reflex +0.5)                 |
| gloves | `item.gloves.starter_01`    | **new**, no modifiers                                 |
| pads   | `item.pads.starter_01`      | **new**, no modifiers                                 |
| shoes  | `item.shoes.starter_01`     | **new**, no modifiers                                 |
| jersey | `item.jersey.starter_01`    | **new**, cosmetic                                     |
| pants  | `item.pants.starter_01`     | **new**, cosmetic                                     |

Why new items: see [overview](overview.md) (conflict 1). They are common, level 1, not sellable and have no price; cosmetics have zero modifiers (the Module 0 rule). All seven are granted with source `starter`, **equipped in the same transaction**, and owned by the new player (the composite foreign key on `equipped_items` re-checks ownership inside PostgreSQL). Config validation proves every slot is filled by an item that exists, fits the slot and has a level requirement of 1.

## Wallet

Module 0 `ECONOMY_CONFIG.starter`: **2,500 coins + 50 gems**, credited through the ledger as one `starter_grant` per currency with idempotency keys `starter:<userId>:coins|gems`. Balances and ledger therefore always agree, and a retry can never grant twice (tested: exactly two ledger rows, balances 2,500/50, after replays and concurrent requests). Starting XP is 0, so no XP grant is created. Achievement rows are created lazily by Module 2 (none are pre-created).

## Career start

- Tier **`academy`**, season 1, reputation 0, fans 0, selector interest 0, level 1, form 50, fatigue 0.
- Joins **River Hawks Academy** (`team.academy.riverhawks`) with the chosen jersey as shirt number; history: `career_started` then `team_joined`.
- `player_profiles.creation_balance_version` records `game_balance_version` at creation; the audit row repeats it.
