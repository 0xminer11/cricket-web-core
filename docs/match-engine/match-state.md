# State and invariants

`EngineMatchState` contains version stamps, toss, global delivery sequence, ordered innings/events, status and nullable result. Statuses: created → ready (optional) → in_progress ↔ innings_break → completed; abandonment is terminal. Ready is a preparation phase; no delivery may resolve before start.

Innings contain batting/bowling team IDs, target, configured ball/wicket limits, batting order cursor, active batters, selected bowler, overs and figures. All-out clears the unavailable batter rather than inventing another player. Active-batter invariants apply only while innings are live.

Snapshots are JSON-compatible; no dates, classes, bigint or circular references. `validateMatchState` verifies score/ball totals, wicket limits, target, teams, distinct nondismissed live batters and global sequence. Enabled by default after each ball; batch benchmarks may opt out after unit/fuzz validation.
