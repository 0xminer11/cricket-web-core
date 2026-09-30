# Scaling

## Connections

One `pg.Pool` per process (`DATABASE_POOL_MAX`, default 10, `.env.example` uses 5). Size it as `max_connections / (processes x safety factor)`; put PgBouncer (transaction pooling) in front once replicas multiply. The application uses only standard transactions and `SET LOCAL`-style `set_config(..., true)`, so transaction pooling is compatible; it does not use session state, `LISTEN`, or session-level advisory locks in request paths (only the deploy-time migration lock, which runs on a direct connection).

Statement timeout is `DATABASE_STATEMENT_TIMEOUT_MS` (15 s), idle-in-transaction timeout twice that.

## Read patterns

Dashboard, inventory, match history and wallet history are index-backed keyset queries with constant query counts (see [indexing.md](indexing.md)). Read replicas can serve history and dashboards later (tolerating replica lag); wallet/reward/match-completion paths stay on the primary.

## `match_balls` growth

Estimate: a 5-over match ~30-40 balls; 1 million matches ~ 40 million rows. A row is ~100-130 bytes plus two unique indexes, so roughly 10-15 GB per 100 million balls including indexes. Design choices that keep it manageable: bigint key, no JSON, small text enums, only two secondary indexes, aggregates in `player_stats`/`match_innings` so nothing scans balls for normal screens.

Consider **partitioning** when any of these is true: the table exceeds ~200-300 M rows or ~100 GB, autovacuum/index maintenance windows become a problem, or retention/archival of old matches is wanted. Approach: declarative `PARTITION BY RANGE (created_at)` monthly (or by hash of `match_id` for even spread), which requires the partition key in the primary key and unique constraints. That is a deliberate migration: create the partitioned table, backfill by partition, switch, and adjust the composite unique keys to include `created_at`. Moving old partitions to cheaper storage or detaching them is then a metadata operation. Not implemented now: it would complicate every composite foreign key for no current benefit.

## Ledger growth

`wallet_transactions` grows with every economic event and is never pruned. It is indexed for per-player reads; if it becomes very large, partition by `created_at` (quarterly) and keep `(player_id, created_at DESC)` local indexes. Archive-by-partition, never delete rows.

## Hot rows

Per-wallet and per-innings serialisation (row locks) is deliberate. A single player's wallet or a single innings only sees writes from that player/match, so contention is naturally low. Guard against long transactions holding those locks: keep transaction callbacks database-only and short (they are retried on conflict).

## Vacuum and bloat

High-churn rows are `player_state`, `currency_balances`, `player_stats`, `match_innings`, `match_overs` (updated per ball). They have small rows; consider `fillfactor = 80` (HOT updates) and per-table autovacuum tuning if bloat appears in production monitoring.

## Multiplayer, ranked and leaderboards

The schema already supports human-vs-human participants and per-scope stats. Leaderboards will read `player_stats`/match results into a derived store (Redis or materialised views) - not built now.
