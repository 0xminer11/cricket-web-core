# Match completion

`MatchCompletionService.apply` turns a finished match into career effects. It runs **inside the transaction of the
final ball** (`MatchPlayService.persist`), so the match cannot be finished without its effects and the effects cannot
exist without a finished match.

## Order of work

1. Insert the gate row into `match_career_results (match_id, player_id)` with `ON CONFLICT DO NOTHING`. If nothing
   was inserted, someone else already processed it: stop. This is the single place exactly-once is decided.
2. Read the finished engine state and the persisted balls: outcome for the player's side, their batting and bowling
   figures, the opposition.
3. Player stats delta (`deriveStatsDelta`) and apply.
4. Performance rating (engine, only for players who faced or bowled) and form (EWMA of the last 8 ratings).
5. Match fatigue (participation + per-ball work, eased by Stamina).
6. Achievements from the seeded definitions (`match.runs`, `match.wickets`, `career.wins`, `career.sixes`).
7. Rewards (`calculateMatchRewards`) and grants through the reward ledger (`grantOnce`, idempotency key
   `match:{matchId}:reward`; achievements `achievement:{id}`).
8. XP to level (`applyPlayerXp`, `applyLevelUp`; at the cap no XP is credited and none is paid).
9. Milestones (career-best, half-century, century, N-wicket haul: only what the stats confirm).
10. Write the **result summary JSON** to the gate row (what was applied, once).
11. After the transaction commits: publish `match.completed`, `player.match_stats_updated`, `player.rewards_granted`,
    `achievement.unlocked` through the `DomainEventPublisher`.

## Legacy and recovery

`GET /matches/:id/result` applies the effects if the gate row is missing (a match that finished before Module 11), in
its own locked transaction, and otherwise just reads the stored summary. A match that is not finished returns
`INVALID_MATCH_STAGE` (409); another player's match is `MATCH_NOT_FOUND` (404).

A player who neither faced nor bowled has no rating, no form change and a participation-only reward, and the result
screen says "You did not bat or bowl in this match."
