# Simulation harness

```bash
pnpm simulate:training                       # report to the terminal
pnpm simulate:training -- --json             # machine-readable
pnpm simulate:training -- --players=100 --seed=7
```

`infrastructure/scripts/simulate-training.mjs` builds game-core and runs the **real pure TrainingEngine and recommender** (no database, no network, no mocks) over a population per scenario. It uses `buildStarterPlayer` for realistic Module 4 starting attributes and spreads Discipline, Stamina and Recovery around the archetype with a seeded generator local to the script, so results are reproducible.

## Scenarios

- Profiles: rookie top-order batter, rookie fast bowler (right-arm fast), rookie spinner (leg spin), rookie all-rounder (off spin).
- Policies: casual (3 drills/day, 90 coins/day income), regular (6/day, 150/day), grinder (30/day, unlimited coins).
- Checkpoints: 10, 50, 100 and 500 sessions.
- Policy of each simulated day: follow `recommendTraining` (which picks rest from fatigue 75), reset the UTC-day counters, add the stand-in income.

## Outputs per checkpoint

Players that reached it, average skill points gained, sessions per skill point, player level, fatigue, rests, coins spent, days elapsed, Skill XP per session. Plus the **farming probe**: how much Skill XP one level-20 batter with unlimited coins can earn in a single UTC day when attempting 3 / 5 / 10 / 30 / 100 / 500 drills with rest allowed.

## Limits

The income is a constant stand-in; players never get injured, skip days or choose drills for non-recommended reasons; matches are absent. Read it as a regression and sanity tool, not a forecast. Findings: [balancing.md](balancing.md).

## Using it when changing numbers

Change a value in `training.config.ts`, run `pnpm test` (config validation) and the simulation, compare sessions-per-point, XP per session and the farming probe against the table in balancing.md, and update that table in the same change.
