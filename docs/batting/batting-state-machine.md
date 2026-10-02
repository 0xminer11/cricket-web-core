# Batting state machine

`core/batting-state-machine.ts`. Only the listed transitions are legal, so a double tap, a late reply or a skipped
animation can never leave the scene in an impossible state. `tryTransition` makes an illegal request a no-op.

```text
WAITING -> BOWLER_APPROACH -> BALL_RELEASED -> READING_DELIVERY <-> SHOT_ARMED
                                                    |                   |
                                                    +---- SWING_STARTED +
                                                              |
                                          CONTACT_WINDOW -> RESULT_RESOLVED -> BALL_OUTCOME -> RESETTING -> WAITING
```

| State              | Meaning                                                                             | Player may…                       |
| ------------------ | ----------------------------------------------------------------------------------- | --------------------------------- |
| `WAITING`          | Between balls. FACE NEXT BALL is available.                                         | face the next ball                |
| `BOWLER_APPROACH`  | The AI bowler is running in. The preview is known, the ball is not out of the hand. | tap early (buffered 0.15 s)       |
| `BALL_RELEASED`    | Released; the timeline (pitch time, contact time) is being set.                     | —                                 |
| `READING_DELIVERY` | The ball is in flight and the player may choose and swing.                          | choose, change, swing             |
| `SHOT_ARMED`       | A shot has been chosen (same permissions as reading).                               | choose, change, swing             |
| `SWING_STARTED`    | Swing committed; the bat is already moving. The request is in flight.               | nothing (a second tap is ignored) |
| `CONTACT_WINDOW`   | The ball is within 0.2 s of the bat.                                                | nothing                           |
| `RESULT_RESOLVED`  | The server has answered. The score is NOT shown yet.                                | nothing                           |
| `BALL_OUTCOME`     | The animation reached the result: banner, feedback, score.                          | nothing                           |
| `RESETTING`        | Returning to the stance; corrections cleared.                                       | —                                 |

A failed request before contact abandons the swing: `SWING_STARTED/CONTACT_WINDOW -> WAITING`, the scene is reset
and nothing is shown. The same shot (same `actionId`) may be sent again; see [server-authority](server-authority.md).

`data-batting-state` on the match shell mirrors the state for tests.
