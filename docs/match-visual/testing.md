# Testing

| Layer            | Where                                         | What it proves                                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine extension | `tests/match-visual/engine-extension.test.ts` | execution input is bounded, monotonic, replayable and validated; absent = unchanged; skill still matters; movement signs by arm and hand; AI batter determinism, variety and chase behaviour                                       |
| Coordinates      | `coordinates.test.ts`                         | normalized <-> metres <-> screen round trips at 1920x1080, 1366x768, 844x390, 390x844; clamping; labels equal the engine's                                                                                                         |
| Presentation     | `presentation.test.ts`                        | state machine, meter, input locking, trajectory (lands on the actual target, speed, swing direction by hand, seam/spin, bounce, exits), animator release/hold/cancel, fallbacks, contact presentation, event queue, camera framing |
| Controller       | `controller.test.ts`                          | load, bowler choice, intent-only payload, double tap, hold-at-release, failure and retry with the same actionId, stale resync, skip, over summary, completion, simulate, pause, destroy                                            |
| Hygiene          | `hygiene.test.ts`                             | no randomness or run arithmetic in the visual layer, Phaser behind a dynamic import, no browser storage, no result fields in the request                                                                                           |
| API              | `match-play-api.test.ts`                      | privacy, forged results rejected, resolution and persistence, idempotency (including concurrent), over rules, a full match, telemetry allow-list, dev lab                                                                          |
| End to end       | `e2e/match.spec.ts`                           | below                                                                                                                                                                                                                              |

## End-to-end (Playwright, real browser, real API and database)

Career -> Prepare -> Start -> scene -> choose Outswing -> aim good length outside off -> bowl: only intent is sent, the
**rendered pitch point equals the server's actual target**, the HUD equals the authoritative state and the result is
stated as text; a full over (six legal balls, extras not counted, previous bowler locked out); refresh mid-over;
**forced wicket, wide and no-ball** (the seed is chosen by running the real engine build so the outcome is genuine);
drag the marker (clamped, never NaN) and double tap (one request); dropped connection then retry (same `actionId`,
one ball); lost reply after the server bowled (retry returns the stored ball, one row in the database); phone
landscape and portrait; keyboard only; reduced motion (camera never moves, assist default); axe; asset failure fallback;
ten leave/re-enter cycles with one canvas and no handler pile-up; pause; access control; completing a match and its
result screen; the three pitch types through the lab.

## Visual QA

The browser was driven and screenshots were inspected for: stance and walk-back, run-up, release, ball flight with
shadow, the aim view with zones and marker, left-arm spin on a dry pitch against a left-hander, medium pace on Green
and Hard, six, miss and bowled presentations, desktop (1366x768), phone landscape (844x390) and phone portrait
(390x844). Findings and fixes are listed in the module report.

## Determinism for tests

Assisted timing sends no `executionInput`, so a ball depends only on the seed, the intent and the match state. The
forced-outcome helpers re-seed a match that has no balls yet and verify the chosen seed against the real engine.
