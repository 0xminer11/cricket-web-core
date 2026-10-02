# Release events

The ball leaves the hand when the delivery clip crosses its **release marker** (a normalized time inside the delivery
clip, 0.68 fast and medium-fast, 0.66 medium, 0.60 spin). It is never a `setTimeout`.

`BowlingAnimator` is advanced by frame deltas, so pausing the scene pauses the bowler. Events:

| Event                    | When                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| `RUN_UP_STARTED`         | BOWL pressed, the walk-back begins                                          |
| `BALL_RELEASE`           | the clip crosses the marker; carries the world position of the bowling hand |
| `FOLLOW_THROUGH_STARTED` | after the delivery clip                                                     |
| `ANIMATION_COMPLETE`     | the action has finished                                                     |
| `ANIMATION_CANCELLED`    | aborted before release (failed request)                                     |

## Hold at release

At the marker the animator asks its listener whether the ball may be released. The controller answers `false` until
the server has replied, and the action **holds at that instant** (the arm stays up, the ball stays in the hand,
"Waiting for the umpire..." shows). When the reply arrives the next frame releases. This is what lets a real network
round trip sit inside the run-up without any fake result and without releasing a ball that has no outcome yet. If the
request fails the run-up is cancelled and the ball is never released.

## Where the ball starts

The flight starts at the bowling hand's position at the release frame (`event.hand`), taken from the rig, so the ball
leaves the hand: not the head, not the chest, not behind the bowler (asserted: z between 1.9 and 2.45 m, in front of
the crease, on the bowler's arm side).

## Other presentation events

The same queue (`visual-events.ts`) schedules, relative to release: `BALL_PITCH`, `BATTER_SHOT_START`,
`BALL_NEAR_BATTER` (the hook future human batting will use), `CONTACT_PRESENTATION`, `RESULT`, `SCORE_UPDATE` and
`SEQUENCE_COMPLETE`. Each fires exactly once, in order; Skip flushes the remainder once and never repeats an event.
The score never ticks up before the ball reaches the bat.
