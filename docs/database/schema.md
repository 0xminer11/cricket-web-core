# Schema

30 tables. `id` columns are UUIDv7 unless stated; every mutable table has `created_at`/`updated_at` (`TIMESTAMPTZ(3)`, `updated_at` maintained by a trigger). Only notable columns are listed; the source of truth is [packages/database/src/schema](../../packages/database/src/schema) and the SQL in `packages/database/migrations`.

## Identity

| Table   | Purpose                                                                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users` | Account anchor: `status` (active/suspended/deleted), `origin` (organic/development/test), `last_seen_at`, `deleted_at`. No credentials (Module 3). |

## Player

| Table                   | Purpose and key constraints                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `player_profiles`       | `user_id` (unique, MVP: one cricketer per user), `display_name` (3-24, trimmed), `country_code` (`^[A-Z]{2}$`), `jersey_number` 0-99, `batting_hand`, `primary_role`, `secondary_roles[]`, `bowling_style` |
| `player_appearance`     | 1:1. Preset/colour ids (shape-checked references, no binaries), `height_scale` 0.85-1.15                                                                                                                   |
| `player_attributes`     | 1:1. 22 typed `smallint` columns, each `CHECK BETWEEN 1 AND 100` (`batting_*`, `bowling_*`, `physical_*`)                                                                                                  |
| `player_personality`    | 1:1. Six Module 0 dimensions, each 1-100                                                                                                                                                                   |
| `player_state`          | 1:1. `level` 1-50, `current_xp`, `lifetime_xp` (>= current, monotonic by trigger), `form` 0-100, `fatigue` 0-100, `row_version` for compare-and-set                                                        |
| `player_skill_progress` | Sparse `(player_id, stat_key)` -> `skill_xp`                                                                                                                                                               |
| `player_stats`          | `(player_id, scope_type, scope_id)` counters; non-negative, `not_outs <= innings_batted`, `highest_score <= runs`, `matches_won <= matches`                                                                |

## Career

| Table                    | Purpose and key constraints                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `careers`                | `current_tier`, `current_team_id`, `season_number`, `career_status`, `reputation` 0-1000, `selector_interest` 0-100, `fans`. One _active_ career per player (partial unique)                             |
| `career_history`         | Append-only log (`event_type`, `reference_id`, `metadata`, `occurred_at`); UPDATE/DELETE blocked by trigger                                                                                              |
| `career_event_instances` | Occurrence of a `career_event.*` definition: status, `selected_choice_id`, `career_matches_at_trigger` (for match-based cooldowns), `effects_snapshot`. One pending per definition                       |
| `contracts`              | Typed coin terms (`salary_coins`, `match_fee_coins`, `performance_bonus_coins`), `minimum_performance_rating`, `duration_matches`, `matches_played <= duration`, `terms_snapshot`. One active per career |
| `sponsorships`           | `sponsor_definition_id`, payout currency/amount, `reward_config_snapshot`, `objective_progress`. One live (offered/active) per career + sponsor                                                          |

## Teams and fixtures

| Table              | Purpose                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `teams`            | Canonical rows keyed by unique `definition_id` (`team.*`)                                                            |
| `team_memberships` | History-preserving: `role`, `shirt_number`, `status` active/ended, `left_at`. One active row per player + team       |
| `fixtures`         | Home/away (must differ), `match_format_id`, `scheduled_at`, `status`, `season_number`, `round`, optional `career_id` |

## Matches

| Table                | Purpose and key constraints                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matches`            | Header. `match_mode` (career/friendly/ranked/tournament), `match_format_id`, `pitch_definition_id`, **`match_engine_version`, `game_balance_version`, `data_schema_version`**, `rng_seed`/`rng_algorithm_version`, `status`, teams, `winner_team_id`, `result_type` |
| `match_participants` | Human or AI. `player_id` present iff `participant_type='human'`. Snapshots: `display_name_snapshot`, `overall_snapshot`, `selected_role`; `performance_rating` 0-10                                                                                                 |
| `match_innings`      | Unique `(match_id, innings_number)`; `runs, wickets<=10, legal_balls, extras<=runs, target`, `is_super_over`                                                                                                                                                        |
| `match_overs`        | Unique `(innings_id, over_number)`; per-over aggregates and `completed_at`                                                                                                                                                                                          |
| `match_balls`        | One row per delivery, `bigint` id. See [match-storage.md](match-storage.md)                                                                                                                                                                                         |

## Training, inventory, economy, progression, system

| Table                 | Purpose and key constraints                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `training_sessions`   | `training_definition_id`, status started/completed/cancelled, cost snapshot, `xp_awarded`, `fatigue_added`, `outcome`, `wallet_transaction_id`, `game_balance_version`, optional idempotency key |
| `player_inventory`    | `item_definition_id`, `upgrade_level >= 0`, `quantity >= 1`, `status`, `acquisition_source`, optional idempotency key. Unique `(id, player_id)` backs the ownership foreign key                  |
| `equipped_items`      | PK `(player_id, equipment_slot)`; composite FK `(inventory_item_id, player_id)` proves same-owner; one instance in at most one slot                                                              |
| `currency_balances`   | PK `(player_id, currency_type)`, `balance >= 0`                                                                                                                                                  |
| `wallet_transactions` | Immutable ledger. See [economy-ledger.md](economy-ledger.md)                                                                                                                                     |
| `reward_grants`       | One row per `(player_id, source_type, source_id)`; `payload_snapshot`, `game_balance_version`                                                                                                    |
| `player_achievements` | PK `(player_id, achievement_definition_id)`; `progress`, `completed`, `reward_claimed` with consistency checks                                                                                   |
| `game_versions`       | Unique `(game_balance_version, match_engine_version, data_schema_version)` with `activated_at`, `notes`                                                                                          |
| `audit_logs`          | Append-only: actor, `action`, target, `request_id`, `metadata`. For sensitive/admin operations only                                                                                              |

## Data retention

Completed matches (and their innings/overs/balls), wallet ledger rows, contracts, career history and audit logs are never deleted in normal operation: every foreign key that could remove them is `RESTRICT`, and the ledger, audit log and career history are additionally protected by triggers. Account removal is a separate audited workflow built on `users.status='deleted'` (see [relationships.md](relationships.md)).
