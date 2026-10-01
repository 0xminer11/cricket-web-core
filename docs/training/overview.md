# Training and skill progression (Module 7)

Training is how a cricketer develops. The player picks a drill, sees exactly what it will do, starts it, and the **server** resolves it instantly: Skill XP, possibly an attribute point, Player XP, fatigue and coin cost are all applied in one database transaction, recorded, and shown back on the Career Home.

```text
Career Home ─ TRAIN ─▶ /training (hub)      readiness, recommendation, development, drills by category
                          │ choose
                          ▼
                   /training/:id            preview: skills + current XP, expected XP, fatigue, cost
                          │ START TRAINING   POST /api/v1/training/:id  (Idempotency-Key)
                          ▼
              server: lock → gate → engine → debit → skill XP → player XP → fatigue → record → commit
                          ▼
                    result screen           what changed (arrow only if a skill really rose)
                          ▼
               Career Home / Player / history reflect it immediately
```

## What it is and is not

- **Is**: the complete first version of player development: 25 drills across batting, bowling and physical, a free rest action, role-aware recommendations, skill caps, diminishing returns, level-ups, fatigue limits, a soft daily capacity, history, idempotency, concurrency safety.
- **Is not**: a minigame, a 3D training ground, a shop, an energy timer or a real-time wait. Future interactive drills plug into the same engine ([future-minigames.md](future-minigames.md)).

## Principles (and where each is enforced)

| Principle                                 | How                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Module 0 stays the single source of truth | skill curve `skillXpToNextPoint`, level curve `xpToNextLevel`, role weights, bowling style weights, fatigue thresholds, economy bands are read, never copied |
| Server authoritative                      | the client sends a training id and an Idempotency-Key and nothing else; the body must be empty                                                               |
| Pure, testable rules                      | `TrainingEngine` in `packages/game-core/src/training/`, no I/O, no RNG, no clock                                                                             |
| Reliable, not random                      | no failure rolls, no regression, no timers; effort always yields progress                                                                                    |
| No pay-to-win                             | drills cost **coins only** (a config validator rejects premium cost); rest is free                                                                           |
| No endless farming                        | fatigue guardrail + soft daily capacity + coin cost; measured in [balancing.md](balancing.md)                                                                |
| No dead ends                              | rest is never blocked and always recovers at least 3 fatigue                                                                                                 |

## Where things live

| Area                                              | Location                                                                                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drills, rules, definitions                        | `packages/game-core/src/config/training.config.ts`, `packages/game-core/src/types/training.types.ts`                                                        |
| Engine, progression, availability, recommendation | `packages/game-core/src/training/`                                                                                                                          |
| Contracts                                         | `packages/shared-types/src/training.ts`                                                                                                                     |
| Persistence                                       | existing Module 2 tables: `training_sessions`, `player_skill_progress`, `player_attributes`, `player_state`, wallet ledger (**no new table, no migration**) |
| API                                               | `apps/api/src/modules/training/`                                                                                                                            |
| Web                                               | `apps/web/src/features/training/`, routes `/training`, `/training/[trainingId]`, `/training/history`                                                        |
| Simulation                                        | `infrastructure/scripts/simulate-training.mjs` (`pnpm simulate:training`)                                                                                   |

## Decisions that differ from or extend Module 0

| Topic                          | Module 0                                                                                                  | Module 7                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Drill catalogue                | 5 drills; "future activities (Defence, Placement, Reaction, Swing, Pace, Spin...) without schema changes" | 25 drills so **every** trainable skill has a primary drill (config validator enforces it); the original 5 are unchanged |
| Fatigue efficiency             | "normal below 60, reduced 60-74, strongly reduced 75+, blocked near 95+"                                  | concrete multipliers 1.0 / 0.85 / 0.60, blocked at 95 ([fatigue.md](fatigue.md))                                        |
| Recovery                       | "after matches/rest activities", no numbers                                                               | a free rest action ([recovery.md](recovery.md))                                                                         |
| Infinite farming               | not addressed                                                                                             | **IMPLEMENTATION BALANCE SAFEGUARD**: soft daily capacity ([economy.md](economy.md))                                    |
| Fitness                        | "retention under workload"                                                                                | not a training multiplier (the brief warns against stacking); Stamina lowers fatigue gain as Module 0 says              |
| Player `training.enabled` flag | `false`                                                                                                   | `true`                                                                                                                  |
| Cooldowns                      | `cooldownMatches: 0` everywhere                                                                           | supported by the engine, validated to stay 0 until matches exist                                                        |
| Game balance version           | `'1'`                                                                                                     | stays `'1'`: the catalogue grew additively; each drill carries its own `version`                                        |

See the other pages in this folder for the details of each system.
