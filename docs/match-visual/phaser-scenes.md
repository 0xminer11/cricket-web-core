# Phaser scenes

Phaser 3.90.0 is used for the match world (2.5D). Three.js stays reserved for the player viewer and dressing room;
the two are never mixed on one route.

| Scene               | Responsibility                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `MatchBootScene`    | Canvas background, hands over to preload.                                                                                             |
| `MatchPreloadScene` | Loads only match assets (today none: all are procedural placeholders), marks any that fail and reports warnings.                      |
| `MatchScene`        | The world: ground, pitch, stumps, bowler, batter, ball, effects, camera, pointer targeting, event sequencing. Implements `ScenePort`. |
| `MatchUIScene`      | Screen-space overlay: the large result flash. The persistent result is DOM.                                                           |

`createMatchGame` (phaser/game.ts) configures the game, sizes the canvas to its parent (HiDPI capped by the quality
tier: low 1x, medium 1.5x, high 2x), observes resizes, pauses the loop while the tab is hidden and tears everything
down on `destroy()` (listeners, observer, scenes, canvas). Commands issued before the scene has finished creating are
buffered by `BufferedPort` and replayed in order.

The world is drawn each frame by projecting 3D metres onto the screen with the pinhole camera in `core/coordinates.ts`
and drawing with Phaser `Graphics`. Characters are procedural rigs (joints in metres) so the bowler, the batter and
the ball are all perspective-correct and share one coordinate system with the target marker. Nothing in the scene
reads or writes match state.

Re-entry: leaving the route destroys the Phaser instance; the end-to-end test enters and leaves the match ten times
and asserts a single canvas and no accumulation of window key handlers.
