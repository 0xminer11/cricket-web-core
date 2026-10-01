# Architecture

```text
 web (features/training)                 api (modules/training)                      game-core (pure)
 ┌──────────────────────┐   GET /training   ┌──────────────────────────┐   previewTraining ┌──────────────────┐
 │ TrainingHub          │ ───────────────▶ │ TrainingController       │ ───────────────▶ │ TrainingEngine    │
 │ TrainingDetail       │ ◀─────────────── │ TrainingService          │ ◀─────────────── │ availability      │
 │ TrainingResult       │ POST /training/:id│  hub / detail / history  │   resolveTraining │ recommendation    │
 │ TrainingHistory      │ + Idempotency-Key │  start (transaction)     │                  │ skill-xp, level   │
 └──────────────────────┘                   └────────────┬─────────────┘                  └──────────────────┘
                                                         │ repositories (Module 2)
                                                         ▼
                              player_state · player_attributes · player_skill_progress
                              training_sessions · currency_balances + wallet_transactions
```

## Layers

- **game-core `training/`** (no database, no React, no clock, no RNG): `skills.ts` (trainable registry, labels, descriptions), `skill-xp.ts` (the one place the curve is read), `training-progression.ts` (Player XP and levels), `training-modifiers.ts` (fatigue, load, stamina, discipline, recovery maths), `training-definitions.ts` (catalogue helpers, style eligibility), `training-availability.ts`, `training-recommendation.ts`, `training-engine.ts`, `training-snapshot.ts`, `training-validation.ts`.
- **API**: controller (parse and envelope), `TrainingService` (load, decide, apply, publish), `training.presenter.ts` (pure DTO building), `training.errors.ts`, `training.telemetry.ts`.
- **Web**: `TrainingClient` is the only caller of the API; components render DTOs. The web feature imports no game-core and has no write path other than "start" and funnel telemetry (hygiene-tested).

## Reads are cheap

`GET /training` = state + profile + attributes + skill progress + wallet + a UTC-day count + the week's sessions + the last session: **10 queries**, fixed, and no per-drill or per-skill lookups (static definitions come from game-core). Payload ≈ 24.8 KB (3.4 KB gzip) for the 25 drill cards plus rest, each with a preview. Player data is never cached; static definitions are module constants.

## The write path (one transaction)

```text
BEGIN
 1  SELECT player_state FOR UPDATE            serialises all progression writes for this player
 2  INSERT training_sessions (player, key)     idempotency gate; a repeat returns the stored result
 3  load attributes, skill XP, coins, today's counts
 4  resolveTraining()                          pure; refusal → typed error → ROLLBACK
 5  wallet.debit(training_cost, ref=session)   guarded atomic debit + ledger row (skipped for free actions)
 6  addSkillXp / applySkillPoint               per skill; checked against what the engine assumed
 7  awardXp + applyLevelUp                     any number of levels
 8  adjustFatigue(delta)                       atomic, clamped 0..100 in SQL
 9  UPDATE training_sessions → completed + result snapshot + wallet tx id
COMMIT
post-commit: domain events + analytics
```

Static definitions are resolved **before** the transaction; no config loading happens while locks are held.

## Errors and rollback

Every refusal is a typed `TrainingError` with a stable code and a safe message. Anything unexpected becomes `TRAINING_FAILED` (500, generic text, details logged with request id and ids only). A `StaleWriteError` (someone changed the same skill between read and write) rolls back and retries up to 3 times, then answers `TRAINING_CONFLICT`. Rollback is proven by a test that makes the very last statement fail with a real PostgreSQL trigger: no debit, no XP, no skill XP, no fatigue and no session survive.

## Domain events and analytics

After commit only: `training.completed`, `player.skill_improved` (one per raised skill), `player.level_up` (once, old and new level, `source: 'training'`) through the existing `DomainEventPublisher`, and analytics `training_started`, `training_completed`, `training_skill_improved`, `training_level_up`, `training_blocked`, plus client `training_hub_viewed` / `training_selected`. A refused request publishes nothing but `training_blocked`. There is no central achievement/objective processor in Module 0/2 yet, so nothing updates achievements inside the service; consumers subscribe to the events.

## Career Home and Player integration

Career Home's Training card is driven by the same `recommendTraining` and shows the last session and what improved. `GET /player` now includes `skills[]` (value, XP, XP to next) and `/player` renders a Skills panel. Both read the same tables the training transaction writes, so they update on the next load with no cache to invalidate.

## Performance (measured locally, 2026-10-01; production web build, API in dev mode, local PostgreSQL)

| Metric                                              | Result                                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /training` payload                             | 24.8 KB (3.4 KB gzip), all 25 drills + rest with previews                                                                           |
| `GET /training` latency                             | p50 5.2 ms, p95 7.3 ms (60 requests), 10 queries                                                                                    |
| `POST /training/:id` (paid drill, full transaction) | p50 11.7 ms, p95 17.7 ms (29 sessions)                                                                                              |
| `POST /training/training.physical.rest`             | p50 7.5 ms, p95 11.1 ms                                                                                                             |
| Initial JS (gzip)                                   | `/training` 274.9 KB, `/training/history` 274.9 KB (Career Home 274.3 KB); no Three.js, no game-core, no match runtime in the route |
| Concurrency                                         | three simultaneous sessions for one player serialise on the row lock and all commit correctly                                       |
