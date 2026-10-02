# Career progression effects

What a finished match changes for the player, and where it is shown.

| Effect             | How                                                                                                            | Shown on                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Stats              | `deriveStatsDelta`, see [player stat updates](player-stat-updates.md)                                          | Career Home, result      |
| Performance rating | Engine rating, only for players who faced or bowled                                                            | Recent list, result      |
| Form (0–100)       | EWMA of the last 8 ratings (newest first, decay 0.8), smoothed 75/25 with the previous form                    | Career Home, result      |
| Fatigue            | `participation (4 / 8) + 0.12 × balls faced + 0.25 × legal balls bowled`, eased by Stamina (up to 35%), max 25 | Career Home, preparation |
| Fans, reputation   | See [rewards](match-rewards.md)                                                                                | Result                   |
| Selector interest  | Only for a rating above 6.5                                                                                    | (stored)                 |
| XP and level       | `applyPlayerXp`, `applyLevelUp`; level-ups shown as **LEVEL UP!** with before → after                          | Result, Career Home      |
| Coins              | Reward ledger and wallet                                                                                       | Result, wallet           |
| Achievements       | First-time unlocks pay once                                                                                    | Result                   |
| Fixture            | `fixtures.status = completed`, the next fixture becomes Career Home's Next Match                               | Career Home              |

## Next-match consequences

Fatigue carries into the next preparation screen (its readiness warnings use it). Form shows its label (for
example "In form") next to the number. A rest or training session reduces fatigue as in Module 7; nothing about a
finished match can be undone by a refresh or a second request.

## What does not change

Skills and overall are not changed by a match (training and level-ups do that). The opposition's attributes are never
revealed by playing them.
