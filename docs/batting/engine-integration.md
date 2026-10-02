# Engine integration (Module 8)

Module 10 adds **no cricket formula** and no engine version bump. It adds two small, pure, deterministic pieces
around the engine and one preview method.

## What was added to `@the-cricketer/match-engine`

| Addition                                           | Purpose                                                                                                                                                                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HeadlessMatchEngine.previewDelivery(seq, intent)` | the delivery that _will_ be bowled, **without** resolving the ball; same function and seed stream as `resolveBall`, so the preview a batter reads is exactly the delivery then resolved. Read-only: no state, sequence or random draw is consumed. |
| `aiBowlerIntent(seed, bowler, sequence)`           | the AI bowler's choice of delivery, line, length and target, from its **own** seeded stream (`seed:ai-bowl:n`); varied, deterministic, no hidden skill.                                                                                            |
| `humanShotIntent(input, batter, delivery)`         | the human's shot, direction and timing -> the engine's `ShotIntent` ([player-attributes](player-attributes.md)).                                                                                                                                   |
| `simulateHumanBatting(options)`                    | headless batting by a simulated human (timing skill + shot policy) for the balance report.                                                                                                                                                         |

`resolveShot`, `resolveOutcome` and every constant in `CONTACT_WEIGHTS` and `ENGINE_BALANCE` are untouched; the engine
version stays at 2. Golden replays and the Module 8 test-suite still pass.

## The AI bowler

Chooses before the batter has decided anything, so it cannot react to the player. Weights (`ENGINE_BALANCE.ai.bowler`):
outside off 0.36, off stump 0.26, middle 0.20, leg 0.14, wide off/leg 0.02 each; easier deliveries are bowled more often
(`easyBias`); length varies (`lengthVariety`) and the aim point jitters (`jitter`). How well the ball then lands is the
engine's normal execution model with the bowler's real attributes.

## Determinism

Everything is a function of `rngSeed` and the sequence number: `next-ball` called twice returns the same delivery; a
retried shot is the same action; a refresh recreates the same ball.

## Mapping engine results to what is drawn

| Engine field                                      | Drawn as                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `shot.contactQuality`                             | how the bat meets the ball ([contact-assist](contact-assist.md)) |
| `shot.worldDirection`, `exitSpeed`, `launchAngle` | the ball's exit path                                             |
| `outcome.distanceClass`, `runsOffBat`             | ground / boundary / six                                          |
| `outcome.wicketType`                              | caught (high ball), bowled (the stumps), lbw                     |
| `outcome.extraType`                               | wide and no-ball: never contact                                  |

The browser never recomputes any of it.
