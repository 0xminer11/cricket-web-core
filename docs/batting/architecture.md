# Batting architecture

Same layering as Module 9: **pure TypeScript core, a thin Phaser layer, DOM controls**. Anything that can be wrong
about cricket or about timing lives in `apps/web/src/features/match/core/` where it is unit tested without a browser.

```text
React (BattingPanel, HUD)            <- DOM: buttons, radio groups, Space/1-5/arrows
        |
MatchGameplayController              <- orchestrates one match; owns NO cricket rules
   |            |                       battingInput: BattingInputController (+ BattingStateMachine)
   |            +--> api (match-client): nextBall(), shoot(), simulate()
   v
ScenePort  (startDelivery / startSwing / applyShotResult / presentationTime)
        |
MatchScene (Phaser)                  <- draws what BattingPresentation.frame() returns
        |
BattingPresentation (pure)           <- AI bowler, ball path, swing, contact assist, ordered events
   |-- BowlingAnimator              (the AI bowler's run-up and release; Module 9)
   |-- BallPath                     (ONE ball: incoming flight, then exit, no jump at contact)
   |-- batting-rig                  (a skeleton posed per shot, additive corrections)
   |-- contact-assist               (BatBallContactPresenter: how to SHOW the engine's contact)
   +-- VisualEventQueue             (ordered, once-only events)
```

## Where the pieces live

| Concern                           | File (under `apps/web/src/features/match/`)                         |
| --------------------------------- | ------------------------------------------------------------------- |
| Per-shot animation metadata       | `config/batting-animations.ts`                                      |
| Skeleton, swing poses, sweet spot | `core/batting-rig.ts`                                               |
| Contact assist                    | `core/contact-assist.ts`                                            |
| Simple controls -> shot           | `core/batting-shot-selector.ts`                                     |
| Timing prediction / cue           | `core/batting-timing.ts`                                            |
| Choices and the one-swing rule    | `core/batting-input-controller.ts`, `core/batting-state-machine.ts` |
| The ball's single path            | `core/ball-path.ts`, `core/trajectory.ts`                           |
| Everything the scene shows        | `core/batting-presentation.ts`                                      |
| Match flow, requests, retries     | `core/gameplay-controller.ts`                                       |
| Phaser drawing                    | `phaser/scenes/match-scene.ts`, `phaser/render.ts`                  |
| Controls                          | `components/batting-panel.tsx`, `components/match-view.tsx`         |
| Developer lab                     | `components/batting-lab.tsx`, `app/dev/batting/page.tsx`            |

Server side: `packages/match-engine/src/batting/human-input.ts`, `simulation/ai-bowler.ts`,
`apps/api/src/modules/matches/match-play.service.ts` (`nextBall`, `shoot`), and the strict DTOs in
`packages/shared-types/src/match-play.ts`.

## Rules of the layers

1. Core code imports no Phaser and no React; the scene imports no cricket rules.
2. The scene is told what to do through `ScenePort` and reports milestones as `SceneEvent`s; the controller reacts.
3. Time is a single clock, the **presentation clock**: seconds since the AI bowler released. The ball, the swing and
   the timing measurement all use it, so the same input means the same thing at 30 or 120 fps.
4. Nothing is stored in the browser: no `localStorage`, no `sessionStorage`. A refresh rebuilds from the server.
