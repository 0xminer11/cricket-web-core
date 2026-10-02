# Architecture

Three layers, each with one job.

```
                 ┌──────────────────────────────────────────────┐
  browser        │ MatchFlowController   (which screen?)        │
                 │   TeamSheet · Toss · TossDecision · MatchView│
                 │ MatchGameplayController (the live match)     │
                 │   Phaser scene · HUD · panels · simulation   │
                 └──────────────┬───────────────────────────────┘
                                │ HTTP, zod-parsed DTOs only
                 ┌──────────────▼───────────────────────────────┐
  API            │ MatchFlowService  (flow, toss, scorecard,    │
                 │                    result)                   │
                 │ MatchPlayService  (balls, simulate, advance) │
                 │ MatchCompletionService (career effects)      │
                 └──────────────┬───────────────────────────────┘
                                │ one transaction per action
                 ┌──────────────▼───────────────────────────────┐
  database       │ matches · match_engine_sessions (replay+flow)│
                 │ match_career_results (the exactly-once gate) │
                 └──────────────────────────────────────────────┘
```

## Rules of the split

1. **The server decides, the browser shows.** Toss, every ball, the target, the result, every reward are computed on
   the server from the seeded engine. The browser sends intent (a call, a choice, a shot) and reads state.
2. **Pure rules live in `game-core`.** `resolveToss`, `aiTossDecision`, `getControlMode`, `calculateMatchRewards`,
   `deriveStatsDelta`, `updateForm`, `calculateMatchFatigue` have no I/O and are unit tested without a database.
3. **Services orchestrate, they do not contain rules.** `MatchCompletionService` reads the finished engine state,
   calls the pure functions and writes the results in the same transaction as the final ball.
4. **The flow controller owns the stage; the gameplay controller owns the ball.** `MatchFlowController` has no cricket
   and no Phaser. `MatchGameplayController` has no routing.
5. **Domain events are published after commit.** `MatchPlayService.transact()` collects events during the
   transaction and publishes them only when it has committed, so a rolled-back action never announces anything.

## Persistence additions (migration 0008)

- `match_engine_sessions.flow jsonb` holds what exists before the engine starts: the toss
  (`callerTeamId`, `aiCall`, `call`, `coin`, `winnerTeamId`, `decision`, `decidedBy`). The engine is created and marked
  ready at match creation and is **started** only when the toss is decided.
- `match_career_results (match_id, player_id)` is unique. Inserting that row is the gate that makes career effects
  happen exactly once; it also stores the result summary shown on the result screen so a refresh never recomputes.
