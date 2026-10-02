# Performance

Measured on a development laptop (Apple silicon, Node 24, local PostgreSQL, Next.js **development** server, so browser numbers are
slower than a production build). The tests that produce them also assert generous budgets, so a regression fails CI.

## Server (`tests/match-flow/performance.test.ts`, real database)

| Operation                                       | p50    | p95     | Budget (p95) |
| ----------------------------------------------- | ------ | ------- | ------------ |
| `GET /matches/:id/flow` (pre-toss, both sheets) | 7.8 ms | 11.8 ms | 250 ms       |
| Toss call + decision                            | 17 ms  | n/a     | n/a          |
| `GET /matches/:id` (live state)                 | 5.1 ms | 7.7 ms  | n/a          |
| `GET /matches/:id/scorecard`                    | 6.3 ms | 9.4 ms  | 400 ms       |
| `GET /matches/:id/result` (stored)              | 6.7 ms | 12.1 ms | 250 ms       |
| Completion transaction, idempotent path         | 3.9 ms | n/a     | 300 ms       |
| Last request of a match, completion included    | 82 ms  | n/a     | 3,000 ms     |
| A whole 2-over match played by simulation       | 223 ms | n/a     | n/a          |

Why it is cheap: the result is stored once and read afterwards (nothing is recomputed); the scorecard is a pure function of the
engine state already loaded for the request; the completion runs in the same transaction as the last ball and does a fixed number of
small statements; the gate row makes every repeat a single failed insert.

## Browser (`e2e/match-flow-perf.spec.ts`, development server)

| Step                                           | Time                                           |
| ---------------------------------------------- | ---------------------------------------------- |
| Preparation screen ready                       | 1.2 s (includes the first compile of the page) |
| Press CONTINUE → team sheet visible            | 0.54 s                                         |
| Team sheet → toss screen                       | 40 ms                                          |
| Toss call → result shown                       | 130 ms                                         |
| Decision → match scene ready (Phaser + assets) | 1.4 s                                          |
| Result screen, first view                      | 0.95 s                                         |
| Result screen refresh                          | 0.59 s                                         |
| JS heap after 10 leave/re-enter cycles         | 53.5 MB                                        |

After each Save & exit there are **zero** canvases, and after each re-entry exactly one; the number of `keydown` handlers on `window`
returns to its baseline (the ten re-entry test in `e2e/match.spec.ts` counts them).

## How the client avoids waste

- The team sheet, toss and decision screens do not load Phaser: the scene module is imported dynamically by `MatchView` only when a live
  innings is on screen, and destroyed when the match view unmounts (so the result screen runs no game loop).
- The simulation reveal is a timer per ball, not an animation loop; Instant skips it.
- The scorecard is fetched when opened (not polled) and the overlay pauses the presentation.
- `useSyncExternalStore` snapshots are cached per version, so a render happens once per state change.
