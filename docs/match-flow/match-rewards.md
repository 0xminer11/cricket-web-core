# Match rewards

All numbers come from configuration; no service or screen hard-codes one. Module 0 fixes the **shape** (participation +
result + performance, tier and format multipliers, a loss pays about 0.75 rather than zero, anti-farm) and the
headline values in `REWARD_CONFIG` / `ECONOMY_CONFIG`. For the values Module 0 does not give (XP per match, fatigue
per match, fans per match, selector interest) Module 11 documents its own interpretation in
`packages/game-core/src/match-progression/config.ts`, versioned with the game balance.

## `calculateMatchRewards` (pure)

```
coins = round( (participation + resultBonus + performance) × resultMult × tier × antiFarm )
xp    = round( (participationXp + resultXp + rating × 12 × format) × resultMult × tier × antiFarm )
```

| Part                      | Source                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Participation coins       | `ECONOMY_CONFIG.matches.{twoOver,fiveOver}.participation`                                                      |
| Result bonus              | win: `winBonus`; tie: half of it; loss: 0                                                                      |
| Performance coins         | `performanceMax × rating / 10` (equals Module 0's `rating × 18` for the 5-over cap of 180)                     |
| `resultMult`              | win 1.0, tie 0.9, loss 0.75 (`REWARD_CONFIG.lossResultMultiplier`)                                             |
| `tier`                    | the career tier's `rewardMultiplier`                                                                           |
| `antiFarm`                | `1 − 0.15 × (recent same-opponent matches − 1)`, never below 0.55, over the last 6 matches                     |
| Participation / result XP | 2 over: 40 / win 30 / tie 15; 5 over: 70 / win 55 / tie 27                                                     |
| Performance XP            | `rating × 12 × format.rewardMultiplier`                                                                        |
| Fans                      | `(20 + 14 × max(0, rating − 5)) × tier.fanMultiplier`; poor rating in poor form can lose a few, capped at 1.5% |
| Reputation                | `(rating − 5) × 1.6 (+1 for a win)`, clamped to −6..+18                                                        |
| Selector interest         | only above rating 6.5, capped at 3                                                                             |

A player who neither batted nor bowled has `rating = null`: no performance coins, XP, reputation or selector
interest, and half the participation fans.

## Granting

Coins and XP go through the reward ledger (`repos.rewards.grantOnce`, idempotency key `match:{matchId}:reward`) which
writes the wallet ledger entry and the player's totals in one step; a second call with the same key is a no-op.
Achievement rewards are granted the same way with `achievement:{id}`. At the level cap no XP is credited and none is
shown as earned.

The result screen shows the persisted amounts and a "How these rewards were worked out" breakdown (participation,
result, performance, and the multipliers) taken from the stored summary.
