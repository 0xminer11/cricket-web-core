# Replay

`MatchReplay` stores schema version 1, RNG algorithm version, original input (including snapshots and seed), and ordered ready/start/innings/bowler/ball/abandon commands. Toss decisions and all batting/bowling intents are recorded. `replayMatch` validates versions and reconstructs an engine ready to continue.

Action IDs are idempotent. A repeated ID with identical canonical input returns the original result, even after completion; reuse with different input fails. Key order is canonicalized because PostgreSQL JSONB reorders object keys. New actions require the next global sequence. No rendering data or camera commands are recorded.

The engine session also stores a JSON state checkpoint for reads, while authoritative resume currently replays the short command log. This is appropriate for 2/5-over matches; future long formats should add versioned direct checkpoints before scaling to realtime rooms.
