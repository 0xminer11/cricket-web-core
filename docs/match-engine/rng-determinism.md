# Determinism

`MatchRandom` implements FNV-1a UTF-16 seed hashing plus Mulberry32, tagged `fnv1a-mulberry32-v1`, using explicit 32-bit integer operations. No engine Math.random, time reads, filesystem or network calls exist.

Toss uses seed:toss. Each global sequence gets independent seed:ball:N:delivery/contact/outcome streams. AI uses seed:ai:N. Invalid input is validated before drawing or advancing sequence. External timestamps belong to the injected database Clock and do not enter logical events.

Same versions + seed + initial snapshots + commands reproduce all structured outputs. Preserve this algorithm/version implementation to replay archived versions after future upgrades; unknown versions currently fail explicitly.
