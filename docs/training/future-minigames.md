# Future minigames and training grounds

Module 7 resolves training instantly from a menu, but nothing in the design assumes that. This page records how interactive training plugs in later. **None of it is built.**

## The seam

```text
Training Drill ─▶ Gameplay minigame ─▶ Performance score ─▶ TrainingEngine ─▶ Reward
   (choose)        (client renders)     (validated)          (pure, server)    (transaction)
```

`resolveTraining` already accepts `performanceScore` (0-1, scales XP 0.8-1.2; absent means none). Everything else, including availability, fatigue, cost, caps, level-ups and persistence, is unchanged.

## Security rule

A browser may **never** be trusted for the score. The planned flow: `POST /training/:id/session` creates a server-side session (opaque or signed token, expiry, bound to the player and the drill, cost reserved or deferred by design); the client plays; it submits an event log or result; the server validates it against bounds (time, count, plausibility, optionally a replay with a seed it issued) and only then derives `performanceScore`. Anything out of bounds is clamped or rejected. The existing `training_sessions.status` already has `started | completed | cancelled`, and the unique idempotency key and the one-transaction apply step carry over.

## Assets to prepare (no 3D ground is built now)

Practice nets, bowling machine, a bowler character, gym equipment, cones and targets, a pitch, a training stadium/indoor facility, plus the Module 5 skeleton for any animated drills. Each drill's optional `iconAssetId` already exists for 2D cards. Keep the viewer pattern from Module 5 (lazy chunk, quality profiles, fallbacks) so training scenes never load into the Career Home.

## Other planned integrations

- **Selector goals / contract expectations**: add weights to the recommendation priority ([recommendations.md](recommendations.md)).
- **Coaches**: Module 0 allows a coach multiplier within 0.9-1.2; it would be one more clamped factor in the engine.
- **Achievements and objectives**: subscribe to `training.completed`, `player.skill_improved`, `player.level_up` in the achievement processor when it exists.
- **Injuries and aging**: out of scope; training never reduces skills today.
- **Wicketkeeping and fielding skills**: add attributes in Module 0 first (`Reflex` and `Agility` are the current homes), then drills.
