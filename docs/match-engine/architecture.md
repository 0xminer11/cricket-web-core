# Architecture

```mermaid
flowchart TD
  D[Delivery intent] --> R[Delivery resolver]
  R --> S[Shot suitability and timing]
  B[Batting intent] --> S
  S --> C[Contact quality]
  C --> O[Outcome and abstract field]
  O --> L[Scoring rules]
  L --> M[Controlled match state]
  M --> E[Ordered events]
  M --> P[External persistence service]
```

`bowling/`, `batting/` and `outcomes/` calculate execution. `rules/scoring.ts` applies legal balls, extras, batters and scorecards without drawing randomness. `engine/` controls lifecycle and emits events. `simulation/` chooses intents. `replay/` replays commands. `stats/` derives presentation and performance.

Internal state uses controlled mutation. External snapshots/results/replays are detached copies, so caller mutation never changes authority. `cursor()` copies only the small orchestration view; simulations avoid copying a growing history on every step. No async work occurs in the engine.
