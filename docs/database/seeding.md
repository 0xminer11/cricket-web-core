# Seeding

`pnpm db:seed` runs two independent, idempotent stages.

## Reference data (every environment)

`seedReferenceData()` upserts (a) the `game_versions` row for the version triple compiled into the build and (b) one canonical `teams` row per Module 0 team definition, keyed by `definition_id`. Reruns change nothing and keep team ids stable. Nothing else from `game-core` is copied into PostgreSQL. Safe to run on every deploy.

## Development data (development and test only)

`seedDevelopmentData()` runs only when `APP_ENV` (or `NODE_ENV`) is `development`/`test` and `NODE_ENV` is not `production`; the function itself refuses other environments.

| User (fixed id in `DEV_IDS`) | Player            | Role                         | Notes                                                                                                                                                                                              |
| ---------------------------- | ----------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `...d001`                    | **Dev Cricketer** | top_order_batter, right-hand | academy tier (Module 0's lowest), level 5, 5000 coins / 100 gems, equipped Street Willow, Quick Touch Gloves, Mobile Guard Pads, River Hawks Academy; attributes from `archetype.technical_opener` |
| `...d002`                    | Dev Batter        | finisher, left-hand          | `archetype.power_finisher`                                                                                                                                                                         |
| `...d003`                    | Dev Fast Bowler   | fast_bowler                  | `archetype.fast_enforcer`                                                                                                                                                                          |
| `...d004`                    | Dev All-Rounder   | batting_all_rounder          | batting/personality from power finisher, bowling/physical from swing specialist                                                                                                                    |

Every dev user has `origin='development'`; a production readiness check can assert `SELECT count(*) FROM users WHERE origin <> 'organic'` is 0. Each player is created through the same atomic `createPlayerFoundationIn` used for real players (ledger rows, career history, starter items included), so dev data cannot drift from production structure. Users are skipped if their id exists.

The seed also records one completed 2-over friendly (River Hawks Academy 19/1 beat Metro Stallions 11/0) with 4 participants (one human), 2 innings, 4 overs and 24 balls of hand-written scorecard data, created through `MatchRepository` (so its aggregates are verified). It exists to exercise history queries and is created only when the Dev Cricketer has no matches.

## Rules

- Ids are stable or discovered by unique natural keys (`definition_id`, fixed dev user ids), never regenerated on each run.
- No seed sets a currency balance directly: coins/gems arrive through `starter_grant` ledger rows.
- Development seeds are never invoked in staging/production, even by flag.
