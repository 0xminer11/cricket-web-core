# Testing

Everything below runs in CI (`pnpm test:integration` for the database-backed suites, `pnpm test:e2e` for the browser).

## Unit (pure, no database)

| File                                             | Covers                                                                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/match-flow/progression.test.ts`           | Rewards by result and format, the loss/tie multipliers, anti-farm floor, stat deltas (a player who did not bat or bowl), form EWMA, fatigue (Stamina relief, cap), determinism                                                             |
| `tests/match-flow/flow-rules.test.ts`            | Toss (coin from the roll, caller wins on a match, seeded coin both faces, AI decision, summary text), control mode for every phase, the flow-stage table (happy path legal, no skipping, tie loop, resume anywhere), stage → state mapping |
| `tests/match-flow/flow-controller.test.ts`       | `MatchFlowController`: team sheet → toss → decision, AI winner, busy/duplicate calls, retryable errors, refresh at every stage, live-state following and stale reports, Save & Exit, late replies after destroy, StrictMode                |
| `tests/match-flow/simulation-controller.test.ts` | Simulation at Normal/Fast/Instant, skip, double requests, failures, named bowler, over summary lifecycle, control mode and turn tracking                                                                                                   |

## Integration (real PostgreSQL, real API)

| File                                                   | Covers                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/match-flow/match-flow-api.test.ts`              | Pre-toss state and team sheets, privacy (signed out, other player), toss rules and idempotency (concurrent calls), decision rules, AI toss, start idempotency, live scorecard invariants, **completion exactly once** (stats, wallet ledger, grants, XP, form, fatigue; repeated and concurrent `apply`), human bowler over summary, simulate semantics ("until my turn", "simulate this over"), pure batter never bowls |
| `tests/match-flow/outcomes.test.ts`                    | A win, a loss, a level chase into a Super Over (second break, four innings) and a tie after the Super Over, each found by running the real engine in-process under candidate seeds, with the right multiplier, stats and winner                                                                                                                                                                                          |
| `tests/match-flow/roles.test.ts`                       | Every role's batting slot and whether they are offered the ball (pure batters, wicketkeeper, finisher, all-rounders, fast/spin bowlers) and that the Cricketer always gets a turn                                                                                                                                                                                                                                        |
| `tests/match-flow/performance.test.ts`                 | Server timing budgets (flow, scorecard, stored result, completion transaction)                                                                                                                                                                                                                                                                                                                                           |
| `tests/db/migrations.test.ts`, `tests/db-unit.test.ts` | Migration 0008 and the table list                                                                                                                                                                                                                                                                                                                                                                                        |

Updated for the toss: `tests/match-engine/persistence.test.ts`, `tests/match-visual/match-play-api.test.ts`,
`tests/batting/batting-api.test.ts` (matches are created pre-toss; the helpers `completeToss` and `startCareerMatch`
in `tests/support/match-flow.ts` play the toss through the real endpoints).

## End to end (Playwright, the real stack)

`e2e/match-flow.spec.ts`:

- a complete 2-over match from Career Home to Career Home: preparation → team sheets → toss → bowl first → simulated
  overs → innings break (target, "need N from 12 balls") → scorecard overlay → chase (simulate to the Cricketer's turn,
  face balls) → result (outcome, innings, performance, rewards) → refresh shows the same coins, wallet credited
  once → scorecard page → Career Home Recent → live URL redirects to the result; axe on every screen; no canvas on the
  result;
- the AI wins the toss and decides; the toss is final (refresh, calling twice, deciding twice); no coin animation under
  reduced motion;
- Save & exit then RESUME MATCH at the same ball; refresh at the team sheet, innings break and result;
- opening the result repeatedly never pays twice (one `reward_grants` row, one `match_career_results` row, one wallet
  credit);
- two tabs: a stale second tab is refused (409) and catches up, exactly one ball exists;
- phones in portrait and landscape: no sideways scroll, 44 px buttons;
- the 5-over second fixture with its own economy (participation 240);
- progression on the result: a level-up is announced once with the new level, and the fatigue a match adds is what the career now shows;
- the development lab forces a loss and shows DEFEAT, and a forced tie after the Super Over shows TIE (four innings, tie multiplier, no winner); the dev routes refuse another player's match and a match that has had
  a ball.

`e2e/match-flow-perf.spec.ts`: browser timings and ten leave/re-enter cycles (canvas and heap).

The Module 9 and 10 specs (`e2e/match.spec.ts`, `e2e/batting.spec.ts`) were updated for the toss (`startMatchApi(page,
{ decision })` arranges and completes it; `playTossInBrowser(page, decision)` walks the screens) and for the new result
page and menu.

## Tooling notes

- A toss is arranged by re-seeding a match that has not been tossed (`arrangeToss`); a result by re-seeding one that has had no
  ball (`arrangeResult`, `/api/v1/dev/match-flow/force-result`). Both run the real engine, never a stub.
- Do not edit API source while Playwright runs: the dev server restarts and unrelated specs fail with `ECONNREFUSED`.
- Apps import workspace packages from `dist`; run `pnpm prepare:dev` after changing a package.
