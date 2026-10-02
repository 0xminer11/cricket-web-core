# Idempotency

Every action that matters can be repeated safely.

| Action                        | Mechanism                                                                             | Repeat result                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Start the match for a fixture | Unique match per fixture; start returns the existing one                              | Same `matchId`                                                        |
| Toss call                     | Match row lock + persisted `flow.toss`                                                | Same stored toss, whatever the body says                              |
| Toss decision                 | Lock + engine start only if not started                                               | Same stored decision; a different one is `INVALID_TOSS_DECISION`      |
| A delivery / a shot           | `actionId` (client) + `expectedSequence`; unique `(match, innings, sequence)`         | Same result for the same action; `STALE_SEQUENCE` for a different one |
| Simulate / advance            | `expectedSequence` of the live state; advance valid only at the break                 | No double play, no double advance                                     |
| **Match completion**          | Unique `match_career_results (match_id, player_id)` inserted `ON CONFLICT DO NOTHING` | Effects applied only if the insert happened                           |
| Coins and XP                  | `grantOnce` with key `match:{id}:reward`                                              | No second grant                                                       |
| Achievements                  | `markCompleted` returns true once; grant key `achievement:{id}`                       | Pays once                                                             |
| Result screen / `GET result`  | Reads the stored summary                                                              | Identical numbers on every refresh                                    |

## Completion in detail

The final ball and the completion run in **one transaction**. If a second request reaches the same final state
(a retry, a concurrent tab, `GET result` for a legacy match) it finds the gate row and applies nothing. A test calls
`MatchCompletionService.apply` concurrently and asserts a single reward grant, a single wallet entry, stats
incremented once and one stored summary.

## Domain events

Events (`match.completed`, `player.match_stats_updated`, `player.rewards_granted`, `achievement.unlocked`) are collected
during the transaction and published after commit, and only by the request that actually applied the effects, so a
retry never publishes them twice and a rollback never publishes them at all.
