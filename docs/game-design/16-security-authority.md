# 16 — Security, Save Data, IDs and Versioning

## Authority matrix
| Data/action | Client readable | Client writable | Server only | Server authoritative |
|---|---|---|---|---|
| Static definitions | Yes | No | No | Version source |
| Cosmetic selection request | Yes | Request only | No | Validation |
| Match inputs (shot/delivery choice) | Yes | Yes, commands only | No | Resolution/result |
| Currency balances | Yes | No | Persistence/audit | Yes |
| Player/Skill XP | Yes | No | Award rules | Yes |
| Inventory | Yes | No | Grants/purchases | Yes |
| Equipment equip request | Yes | Request only | No | Ownership validation |
| Match result | Yes | No | Seed/validation | Yes |
| Rewards | Yes | No | Formula + anti-farm | Yes |
| Purchases | Yes | No | Receipt validation | Yes |
| Career tier / reputation | Yes | No | Promotion rules | Yes |
| Rankings | Yes | No | Compute/store | Yes |
| Anti-cheat flags | No | No | Yes | Yes |

## Command principle
Clients submit intent, not outcomes: `chooseShot`, `chooseDelivery`, `equipItem`, `startTraining`, `acceptContract`. They never submit trusted values such as `coinsEarned`, `newSkillValue`, `matchWinner` or `itemGranted`.

## Save structure
Static definitions are referenced by ID. Example owned inventory state stores `{instanceId, itemId, quantity, upgradeLevel, acquiredAt, source}` only; it does not copy name, rarity, price or modifiers.

## ID conventions
Use lower snake-case machine IDs under namespaces: `shot.cover_drive`, `delivery.fast.outswing`, `pitch.green`, `training.batting.timing`, `item.bat.pro_willow_01`, `team.club.metro_stallions`, `career_event.media.form_question`.

Display names are never primary keys.

## Versioning
Persist `schemaVersion`, `gameBalanceVersion` and `matchEngineVersion` on saves/matches. Match creation pins versions for its lifetime. Balance changes create a new immutable definition version; analytics always records versions. Save migrations are explicit and forward-only, with rollback via backup rather than mutating old definitions in place.
