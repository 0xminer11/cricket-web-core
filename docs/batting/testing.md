# Batting: testing

How Module 10 is verified, what each suite proves, and the simulation report. Counts are from the final verification
run (see the bottom of this page).

## Suites

| Suite                    | File                                                                    | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core (29)                | `tests/batting/batting-core.test.ts`                                    | every Module 0 shot has animation metadata with a real contact frame and recovery; the rig is an exact mirror for a left-hander at every moment; the stance returns exactly; 100 shots in a row cause **no root drift** (bone reset); the contact plan: Perfect/Good align, Okay/Poor are visibly less clean, an Edge meets the edge, a **Miss gets no correction**, an unreachable ball is **refused** (limits hold, plan flagged `exceeded`), Footwork stretches the correction but never past the limit, playback warp stays in ±10 %; simple controls -> shot is deterministic and identical for either hand, never "fixes" a bad decision, every shot is reachable; timing prediction (ideal press, signed fraction, faster ball = earlier press, the cue rises and falls); the state machine allows only legal transitions; one swing per ball; a tap just before release is remembered; the ball's single path has no jump at contact |
| Presentation (15)        | `tests/batting/batting-presentation.test.ts`                            | one delivery runs once and **in order**; the ball starts in the bowler's hand; **the sweet spot is on the ball at contact** for both hands and several shots; an **edge meets the edge**; a **miss shows daylight**; a wide is never contact; bowled reaches the stumps and disturbs them; the swing and ball wait together on the contact frame; no swing = a late cutoff once; skip fires everything once, in order; a retried result is replayed; early swings meet the plane before the ball, late ones after; **100 deliveries leave the batter exactly where he started**; the ball never jumps between frames                                                                                                                                                                                                                                                                                                                         |
| Contact coverage (1 + 3) | `tests/batting/contact-coverage.test.ts`, `ai-contact-coverage.test.ts` | for **every shot x every kind of ball** the body limits hold and a reached ball is within the quality's own mis-centring; against the **real AI bowler and real engine**, a good contact meets the bat for ~98 % of balls, and the rest is flagged, never faked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Controller (12)          | `tests/batting/batting-controller.test.ts`                              | faces one ball per request; shot input opens at release; the **swing starts before the server answers** and sends only shot, direction and timing; nothing of the result shows before the animation reaches it; a dropped connection abandons the swing and the same `actionId` is retried exactly once; stale sequence reloads; a wicket returns to the simulation panels; a finished match leaves for the result page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Engine side (18)         | `tests/match-engine/batting-human.test.ts`                              | direction stays inside the shot's arc; timing is scaled by assist and skill, never past ±1; **auto sends no timing**; the AI bowler is deterministic, varied, and knows nothing about the batter; `previewDelivery` is read-only and equals the resolved delivery; balance by skill, timing, shot, pitch, assist (below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| API integration (8)      | `tests/batting/batting-api.test.ts`                                     | the preview reveals nothing about the outcome and is repeatable; forged results, impossible timing, unknown shots and out-of-turn play are refused **without touching the match**; the preview is exactly the resolved delivery; idempotent retries (same id, same input -> stored ball; changed input -> `ACTION_ID_REUSED`; a burst bats one ball); only your turn; role-based batting position; a match that includes your own innings finishes and reports your figures; the dev lab is repeatable and refuses unknown shots                                                                                                                                                                                                                                                                                                                                                                                                             |
| Hygiene                  | `tests/match-visual/hygiene.test.ts`                                    | the visual layer never assigns runs, wickets or extras (the dev lab's synthetic previews are the one named exception)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| End to end (27 + more)   | `e2e/batting.spec.ts`                                                   | below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## End-to-end coverage (`e2e/batting.spec.ts`)

| Brief                                                                                        | Test                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mandatory flow (login -> career -> start -> bat -> result -> score -> next ball -> persists) | _career -> prepare -> start -> bat a ball_ (the toss is arranged and walked through the UI, `playTossInBrowser(page, 'bat')`; see [match-flow testing](../match-flow/testing.md)) |
| Perfect contact E2E                                                                          | forced cover drive the engine says is good/perfect: bat on the ball (`closestToSweetSpot` < 6 cm), ball to cover, score is the engine's                                           |
| Miss E2E                                                                                     | forced miss: `plan.contactMade === false`, bat clear of the ball by > 12 cm                                                                                                       |
| Edge E2E                                                                                     | forced edge: the plan meets an edge (inside/outside)                                                                                                                              |
| Wicket E2E                                                                                   | forced **bowled**: the stumps, WICKET, one wicket on the server, batting controls close, SIMULATE REST appears                                                                    |
| Six E2E                                                                                      | forced lofted six: SIX, 6 runs, a boundary dot in the over                                                                                                                        |
| Non-striker E2E                                                                              | a finisher **simulates to their turn** and gets a "Played N balls… You are on strike." summary, then bats (strike rotation is covered at the API level)                           |
| Refresh E2E                                                                                  | refresh with the ball on its way: same score, same sequence, the same ball next                                                                                                   |
| Mobile E2E                                                                                   | phone landscape: controls fit, targets >= 40 px, a ball is played; **three deliveries with taps only**; portrait: no sideways scroll, swing reachable                             |
| Accessibility E2E                                                                            | axe (WCAG 2.0/2.1 A, AA) idle and with the ball in flight; keyboard only (Space, 1-5, arrows); button controls without swipe                                                      |
| Error recovery                                                                               | dropped connection -> retry plays once; **lost reply** -> the retry returns the stored ball (one row in the database); stale sequence -> reload, no fake result                   |
| Strict API / access                                                                          | forged `contactQuality`, `runs`, `wicket`, `exitSpeed`, `outcome`, impossible timing, unknown shot, stale sequence all refused; someone else cannot play your shot                |
| Other                                                                                        | double tap swings once; leaving the bat alone; left-handed batter; reduced motion; re-entry leaves one canvas; the batting lab (both hands) and its authentication                |

Forced outcomes use `forceFirstHumanBall` (`e2e/support/match.ts`): it finds a seed with the real built engine for which
the AI bowler's first delivery and the shot the UI will send (assist Auto, so the engine does the timing) give the wanted
result.

## Simulation report

`pnpm simulate:batting` (or `node infrastructure/scripts/simulate-match.mjs --mode=batting --count=4000 --output=reports/batting-simulation.json`).
A simulated human (own timing quality and shot policy) bats against the AI bowler through the **real** resolvers.
4,000 balls per row, seed `module10-report`. "Contact %" is every ball that was not a wide and not a miss; the 3.6 % that
is never contact in these rows is wides.

**By player skill (Batting rating; average timing, appropriate shots, hard pitch, assist off)**

| Case     | Contact % | Good+ % | Miss % | Edge % | Dot % | Boundary % | Wicket % | Runs/ball |
| -------- | --------- | ------- | ------ | ------ | ----- | ---------- | -------- | --------- |
| beginner | 96.4      | 2.7     | 0      | 0      | 48.43 | 4.55       | 3.23     | 0.763     |
| average  | 96.4      | 72.68   | 0      | 0      | 40.83 | 11.43      | 1.48     | 1.13      |
| strong   | 96.4      | 83.85   | 0      | 0      | 39.25 | 13.88      | 1.2      | 1.238     |
| elite    | 96.4      | 90.93   | 0      | 0      | 35.83 | 17.1       | 0.88     | 1.419     |

**By the player's timing quality (sd of the contact-time error: perfect 0, advanced 0.03 s, average 0.06 s, rookie 0.12 s)**

| Case     | Contact % | Good+ % | Miss % | Edge % | Dot % | Boundary % | Wicket % | Runs/ball |
| -------- | --------- | ------- | ------ | ------ | ----- | ---------- | -------- | --------- |
| perfect  | 96.4      | 84.08   | 0      | 0      | 39.75 | 12.25      | 1.18     | 1.178     |
| advanced | 96.4      | 83.53   | 0      | 0      | 39.8  | 12.2       | 1.2      | 1.176     |
| average  | 96.4      | 72.68   | 0      | 0      | 40.83 | 11.43      | 1.48     | 1.13      |
| rookie   | 96.4      | 45.98   | 0      | 0      | 43.6  | 9.5        | 2.13     | 1.01      |

**By shot choice (average skill and timing)**

| Case        | Contact % | Good+ % | Miss % | Edge % | Dot % | Boundary % | Wicket % | Runs/ball |
| ----------- | --------- | ------- | ------ | ------ | ----- | ---------- | -------- | --------- |
| appropriate | 96.4      | 72.68   | 0      | 0      | 40.83 | 11.43      | 1.48     | 1.13      |
| random      | 96.4      | 20.2    | 0      | 0.23   | 34.1  | 17.65      | 7.28     | 1.345     |
| poor        | 96.4      | 0       | 0      | 1.38   | 46.55 | 5.28       | 11.63    | 0.684     |
| defend      | 96.4      | 24.25   | 0      | 0.2    | 57.23 | 0.13       | 1.4      | 0.512     |
| lofted      | 96.4      | 24.25   | 0      | 0.2    | 23.83 | 33.55      | 8.88     | 1.974     |
| coverDrive  | 96.4      | 34.2    | 0      | 0.1    | 29.23 | 20         | 5.6      | 1.532     |
| pull        | 96.4      | 18.98   | 0      | 0      | 28.58 | 19.63      | 6.58     | 1.512     |

**By pitch, pace bowling**

| Case  | Contact % | Good+ % | Miss % | Edge % | Dot % | Boundary % | Wicket % | Runs/ball |
| ----- | --------- | ------- | ------ | ------ | ----- | ---------- | -------- | --------- |
| green | 96.4      | 72.33   | 0      | 0      | 40.85 | 11.4       | 1.48     | 1.128     |
| hard  | 96.4      | 72.68   | 0      | 0      | 40.83 | 11.43      | 1.48     | 1.13      |
| dry   | 96.4      | 73.05   | 0      | 0      | 40.75 | 11.48      | 1.48     | 1.133     |

**By pitch, off-spin**

| Case  | Contact % | Good+ % | Miss % | Edge % | Dot % | Boundary % | Wicket % | Runs/ball |
| ----- | --------- | ------- | ------ | ------ | ----- | ---------- | -------- | --------- |
| green | 96.4      | 84.33   | 0      | 0      | 44.58 | 6.65       | 1.2      | 0.92      |
| hard  | 96.4      | 84.48   | 0      | 0      | 44.58 | 6.65       | 1.2      | 0.92      |
| dry   | 96.4      | 84.28   | 0      | 0      | 44.58 | 6.6        | 1.23     | 0.917     |

**By assist level (a rookie's timing)**

| Case   | Contact % | Good+ % | Miss % | Edge % | Dot % | Boundary % | Wicket % | Runs/ball |
| ------ | --------- | ------- | ------ | ------ | ----- | ---------- | -------- | --------- |
| off    | 96.4      | 45.98   | 0      | 0      | 43.6  | 9.5        | 2.13     | 1.01      |
| normal | 96.4      | 52.55   | 0      | 0      | 42.78 | 9.98       | 1.98     | 1.041     |
| high   | 96.4      | 63.48   | 0      | 0      | 41.78 | 10.83      | 1.65     | 1.089     |
| auto   | 96.4      | 29.48   | 0      | 0      | 45.15 | 7.43       | 2.53     | 0.927     |

### What it shows

- **Skill** (brief 264, 265): a beginner who picks a sensible shot and times it reasonably makes contact on 96 % of balls
  (meaningful, if modest: 0.76 runs/ball, 3 % wickets); elite batters make far more Good/Perfect contact (91 % vs 3 %),
  more boundaries (17 % vs 5 %) and get out less (0.9 % vs 3.2 %): **not automatic sixes**.
- **Timing** (270): better timing means better contact, and a rookie's timing with a good shot still makes contact on
  96 % of balls: this is the forgiving heart of the system.
- **Perfect timing + a bad shot** (269) does not rescue it: with the worst available shot at perfect timing, Good+ is 0 %
  and wickets are 11.5 % (versus 1.5 % for the appropriate shot).
- **Shot choice** (266, 267, 268): defend 57 % dots, 0.1 % boundaries; loft 33.6 % boundaries and 8.9 % wickets (higher
  reward, higher risk); the cover drive vs a bouncer is clearly worse than vs a full ball (unit test).
- **Pitches** (261–263): **green pitch contact is not catastrophically low** (mandatory): 96.4 % contact, 72.3 % Good+, the
  same as hard (72.7 %) and dry (73.1 %); spin stays playable on all three (0.92 runs/ball).
- **Assist** (rookie timing): Off 46 % Good+, Normal 53 %, High 63 %; Auto 29 % (a lower ceiling than good manual timing).
- Misses are rare for sensible choices and common in terrible conditions (a weak batter, a strong bowler, a terrible shot,
  hopelessly late: 68 % misses; tested). The e2e Miss test forces one.

## Contact coverage (the visual side of the same question)

See [contact-assist](contact-assist.md#how-well-does-it-cover-real-play).

## Running everything

```text
pnpm lint            # eslint + package boundaries
pnpm typecheck       # packages, apps, and the tests (tsc -p tsconfig.tests.json)
pnpm format:check
pnpm test            # unit tests (builds packages first)
pnpm test:integration   # + database integration tests (throwaway databases)
pnpm test:e2e        # Playwright; reuses a running pnpm dev
pnpm build
pnpm simulate:batting
```

Do not edit API source while the e2e suite runs: `tsx watch` restarts the API and unrelated specs fail with
`ECONNREFUSED`.

## Last verified

Run on 2026-10-02, Node 24.21.0:

| Check                                                                  | Result                                                                                                                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm format:check`                                                    | all files formatted                                                                                                                                                                  |
| `pnpm lint` (eslint + package boundaries)                              | clean                                                                                                                                                                                |
| `pnpm typecheck` (21 packages/apps + `tsc -p tsconfig.tests.json`)     | clean                                                                                                                                                                                |
| `pnpm test:integration` (builds packages, unit + database integration) | **53 files, 647 tests passed** (Module 9 ended at 547)                                                                                                                               |
| `pnpm build` (13 packages/apps + data validation)                      | passed                                                                                                                                                                               |
| `pnpm test:e2e` (Playwright, 2 workers)                                | **116 tests**: 112 passed in the full run; the other 4 (Module 9 bowling specs) timed out when the machine stalled mid-run (5–15 min each) and **passed on their own re-run** (50 s) |
| `e2e/batting.spec.ts`                                                  | 27 tests, all passing                                                                                                                                                                |
| `pnpm simulate:batting`                                                | report above (`reports/batting-simulation.json`)                                                                                                                                     |

Test counts by suite: batting core 35, presentation 18, contact coverage 1 + 3 + 1, controller 15, engine-side 19, API
integration 8, and 27 end-to-end.
