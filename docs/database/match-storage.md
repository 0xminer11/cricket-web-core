# Match storage

Persistence only: the repository records what the (future) MatchEngine decides; it contains no cricket rules.

## Model

`matches` -> `match_participants` (human/AI), `match_innings` -> `match_overs` -> `match_balls`.

- **Version pinning.** `matches` stores `match_engine_version`, `game_balance_version` and `data_schema_version` at creation. A version-1 result stays interpretable when version 5 exists. `rng_seed` + `rng_algorithm_version` make a match verifiable/replayable (Module 1's `SeededRandomSource`).
- **Modes.** `match_mode` = career/friendly/ranked/tournament. Who plays is per participant: AI opponents are `participant_type='ai'` with no profile; PvP is two `human` participants. Nothing assumes one human per match.
- **Participants** carry minimal point-in-time snapshots (`display_name_snapshot`, `overall_snapshot`, `selected_role`) so history survives later renames and progression - not a copy of the player record.
- **Innings** are 1-based; super overs continue the numbering with `is_super_over`.

## `match_balls`

One narrow row per delivery: ids, `sequence_number` (1-based, contiguous per innings), `over_number`, `ball_in_over` (counts wides/no-balls), striker/non-striker/bowler/dismissed participant ids, `delivery_definition_id`, optional `shot_definition_id`, `line`, `length`, `runs_off_bat`, `extras`, `extra_type`, `wicket`, `wicket_type`, `legal_delivery`, `contact_quality`, `ball_speed`. No JSON, no rendering coordinates, no denormalised names.

CHECKs make impossible deliveries unrepresentable: extras iff `extra_type`; `legal_delivery` must equal "not a wide/no-ball"; `wicket` iff `wicket_type` iff `dismissed_participant_id`; run/extras/position ranges. Composite foreign keys tie innings, over and each participant to the same `match_id`.

Ordering is `sequence_number`, never timestamps. Unique `(match_id, innings_id, sequence_number)` and `(over_id, ball_in_over)`.

## Score consistency strategy

Innings and over totals are stored for fast reads, and kept consistent **by construction**: `recordBall` adds the ball's runs, extras, wicket and legal-ball flag to the over and innings rows in the same transaction as the insert (the innings UPDATE also serialises writers). `verifyInningsAggregates(inningsId)` recomputes totals from `match_balls` and compares; `completeInnings` refuses with `IntegrityError` on any mismatch, and the same call is available for support tooling. The score can therefore always be reconstructed from balls.

## Lifecycle

`created -> ready -> in_progress -> completed | abandoned`, `created|ready -> cancelled` (compare-and-set; anything else is `InvalidStateTransitionError`). `completeMatch` requires `in_progress`, all innings completed, a winner iff `result_type='win'`, and locks the row, so it succeeds exactly once. Rewards must be granted through `reward_grants` (unique per match + player) inside the same transaction, see [transactions.md](transactions.md).

## Reads

- `getMatchSummary(id)` header + participants + innings (never balls).
- `getMatchForPlayer(playerId, id)` enforces participation (`OwnershipViolationError` otherwise).
- `listPlayerMatchHistory(playerId, page)` opponent, result, `won`, rating and score line per innings, two queries per page.
- `listBalls(inningsId, page)` ordered by sequence, up to 500 per page.
- `getRecentPerformanceRatings(playerId, n)` feeds Module 0's `recentPerformanceRatings`.

## Future: `match_events`

Richer replay data (fielding positions, camera cues, commentary) should go into a separate `match_events(match_id, innings_id, sequence_number, kind, payload)` table joined by the same key, not into `match_balls`. It is not created now because nothing consumes it yet.

## Scale

See [scaling.md](scaling.md): plan and thresholds for partitioning `match_balls`.
