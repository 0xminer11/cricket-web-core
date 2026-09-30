# Relationships

Split into three domain diagrams for readability. `||--o{` is one-to-many, `||--||` one-to-one.

## Identity, player and career

```mermaid
erDiagram
    users ||--o| player_profiles : "owns (MVP: one)"
    player_profiles ||--|| player_appearance : has
    player_profiles ||--|| player_attributes : has
    player_profiles ||--|| player_personality : has
    player_profiles ||--|| player_state : has
    player_profiles ||--o{ player_skill_progress : trains
    player_profiles ||--o{ player_stats : "per scope"
    player_profiles ||--o{ careers : "one active"
    careers ||--o{ career_history : "append-only"
    careers ||--o{ career_event_instances : experiences
    careers ||--o{ contracts : signs
    careers ||--o{ sponsorships : accepts
    teams ||--o{ contracts : offers
    teams ||--o{ careers : "current team"
    player_profiles ||--o{ team_memberships : "history"
    teams ||--o{ team_memberships : has
    careers ||--o{ fixtures : schedules
    teams ||--o{ fixtures : "home / away"
```

## Economy, inventory and progression

```mermaid
erDiagram
    player_profiles ||--o{ currency_balances : "coins, gems"
    currency_balances ||--o{ wallet_transactions : "immutable ledger"
    player_profiles ||--o{ reward_grants : "once per source"
    player_profiles ||--o{ player_inventory : owns
    player_inventory ||--o| equipped_items : "in one slot"
    player_profiles ||--o{ equipped_items : "one per slot"
    player_profiles ||--o{ training_sessions : trains
    wallet_transactions ||--o| training_sessions : "cost"
    player_profiles ||--o{ player_achievements : tracks
```

## Matches

```mermaid
erDiagram
    fixtures ||--o| matches : "played as"
    teams ||--o{ matches : "home / away"
    matches ||--o{ match_participants : has
    player_profiles ||--o{ match_participants : "human only"
    matches ||--o{ match_innings : has
    match_innings ||--o{ match_overs : has
    match_overs ||--o{ match_balls : has
    match_participants ||--o{ match_balls : "striker / non-striker / bowler / dismissed"
```

`match_balls` carries composite foreign keys `(innings_id, match_id)`, `(over_id, innings_id)` and `(match_id, <participant>)`, so a ball can only reference an over, innings and participants of its own match.

## Delete behaviour

| Relationship                                                                                                         | Rule     | Why                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `users` -> `player_profiles`                                                                                         | RESTRICT | Deleting a user must never erase the player or its economy history                 |
| `player_profiles` -> appearance, attributes, personality, state, skill progress                                      | CASCADE  | Pure 1:1 extension rows with no independent value                                  |
| `player_profiles` -> careers, stats, memberships, balances, inventory, training, rewards, achievements, participants | RESTRICT | History and audit data; removal only through an explicit account-deletion workflow |
| `careers` -> history, event instances, contracts, sponsorships                                                       | RESTRICT | Career history is retained                                                         |
| `currency_balances` -> `wallet_transactions`                                                                         | RESTRICT | The ledger outlives everything that could reference it                             |
| `teams` -> careers, contracts, fixtures, matches, memberships                                                        | RESTRICT | Teams are deactivated (`active=false`), never deleted                              |
| `matches` -> participants, innings; `innings` -> overs -> balls                                                      | RESTRICT | Completed match history is retained                                                |
| `player_inventory` -> `equipped_items`                                                                               | CASCADE  | Equipped rows are derived state; items are retired via `status`, not deleted       |
| `wallet_transactions` <- `training_sessions.wallet_transaction_id`                                                   | RESTRICT | Cost link stays valid                                                              |

There is no `SET NULL` anywhere: nothing in this model is legitimately orphaned.

## Account deletion (future workflow)

`UserRepository.changeStatus(id, 'deleted')` soft-deletes (sets `deleted_at`, terminal). A later legal-retention module can anonymise `player_profiles.display_name` and `match_participants.display_name_snapshot` in place while keeping ledger and match rows intact. Hard deletion is intentionally impossible through normal foreign keys.
