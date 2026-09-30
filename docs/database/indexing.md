# Indexing

Indexes exist for a named access pattern; every unique index also enforces an invariant. Primary keys and foreign-key columns that no query filters by are deliberately not double-indexed.

| Access pattern                     | Index                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Profile by user                    | `player_profiles_user_id_uniq` (unique)                                                                                                          |
| Active career, career list         | `careers_player_id_idx`; `careers_one_active_per_player_uniq` (partial unique on `career_status='active'`)                                       |
| Career history feed                | `career_history_career_occurred_idx (career_id, occurred_at DESC, id DESC)`                                                                      |
| Pending events / cooldown lookup   | `career_event_instances_career_status_idx`, `..._career_def_idx (career_id, event_definition_id, triggered_at DESC)`; partial unique one-pending |
| Contracts by state                 | `contracts_career_status_idx`; partial unique one-active                                                                                         |
| Sponsorships                       | `sponsorships_career_status_idx`; partial unique one live per sponsor                                                                            |
| Roster / memberships               | `team_memberships_player_status_idx`, `..._team_status_idx`; partial unique one active per player + team                                         |
| Upcoming fixtures                  | `fixtures_scheduled_status_idx (scheduled_at, status)`, `fixtures_career_scheduled_idx`                                                          |
| Live/recent matches                | `matches_status_started_idx (status, started_at)`; unique `fixture_id`                                                                           |
| Player match history               | `match_participants_player_history_idx (player_id, created_at DESC, id DESC)` (partial, humans only)                                             |
| Innings/over lookup and uniqueness | `match_innings_match_number_uniq (match_id, innings_number)`, `match_overs_innings_number_uniq (innings_id, over_number)`                        |
| Ball ordering and replay           | `match_balls_match_innings_seq_uniq (match_id, innings_id, sequence_number)`, `match_balls_over_ball_uniq (over_id, ball_in_over)`               |
| Inventory list / lookups           | `player_inventory_player_status_idx`, `..._player_item_idx`; partial unique idempotency key                                                      |
| Equipment                          | PK `(player_id, equipment_slot)`, unique `inventory_item_id`                                                                                     |
| Wallet history                     | `wallet_transactions_player_created_idx (player_id, created_at DESC, id DESC)`, idempotency unique, `reference` lookup                           |
| Reward once-only                   | `reward_grants_source_uniq`, `reward_grants_idempotency_uniq`                                                                                    |
| Training history                   | `training_sessions_player_started_idx (player_id, started_at DESC, id DESC)`                                                                     |
| Achievements                       | PK `(player_id, achievement_definition_id)` + `player_achievements_player_idx`                                                                   |
| Audit investigation                | `audit_logs_target_idx (target_type, target_id, created_at DESC, id DESC)`, `audit_logs_created_idx`                                             |

Deliberately not indexed: `match_balls` by bowler/striker (per-player aggregates come from `player_stats`, not scans), JSONB columns, and `created_at` on tables read only by key. Add an index only with a query plan and a real access pattern.

## Pagination

Lists are keyset-paginated with opaque base64url cursors (`{t, id}` or `{s}`), deterministic ordering (`created_at DESC, id DESC`, or `sequence_number ASC` for balls) and a hard limit (default 25, max 100; balls 500). Timestamps are millisecond precision so cursors are lossless. Feeds order by row timestamps, so a row committed late with an earlier timestamp shows up only on a fresh load; that is acceptable for feeds. The wallet ledger stamps rows with `clock_timestamp()` (not `now()`), so its order follows wallet-lock order rather than transaction start time.

## N+1 review

| Read                     | Queries      | Notes                                                                                |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------ |
| `getDashboard`           | 4 (constant) | profile+state join, career+team join, balances, equipped+inventory join              |
| `listPlayerMatchHistory` | 2 (per page) | participants+matches page, then all innings for the page in one `IN` query; no balls |
| `getMatchSummary`        | 3 (parallel) | header, participants, innings                                                        |
| `getByIds` (teams)       | 1            | batch hydrate; callers map names from game-core                                      |

Inspect plans with `EXPLAIN (ANALYZE, BUFFERS)` on realistic volumes before adding indexes.
