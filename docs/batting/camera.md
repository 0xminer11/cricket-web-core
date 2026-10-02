# Batting camera

`core/camera-controller.ts`. For batting the camera stands **behind the batter**, looking down the pitch at the bowler.
The world is turned half a circle about the middle of the pitch before it is projected (`ViewParams.rotated`), so
every position, path and mapping stays in the one world frame and only the camera changes.

| State          | Purpose                                                                            | Notes                                     |
| -------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| `BowlerView`   | resting view, bowler at his mark, the player reads the ball                        | rest view for reduced motion              |
| `BallApproach` | the ball is coming                                                                 | **same framing** as BowlerView            |
| `BatContact`   | the contact window                                                                 | **same framing**                          |
| `ShotFollow`   | after contact: follows the ball (look point, height, FOV), pulled back for a six   | tracks the ball up to ~40 m               |
| `Wicket`       | a bowled or lbw: a low stump camera behind the bowler's end, looking at the stumps | not rotated: switching to it is a **cut** |
| `Reset`        | back to the stance view                                                            | cut back                                  |

**Nothing moves the picture while the player is timing the shot**: BowlerView, BallApproach and BatContact share one
preset on purpose. A half-turn cannot be blended, so changing between a rotated and an unrotated view is a cut
(`blend = 0`). Under reduced motion the camera never moves at all: it stays on BowlerView.

The ball is drawn **over** the batter on purpose: from behind him his body would hide the ball for the last metres,
exactly when the player needs to see it.

## Safe framing

The view keeps the batter, the pitch, the bowler and the ball in frame at 1920×1080, 1366×768, 844×390 (phone
landscape) and 390×844 (phone portrait): a portrait screen is scaled by width so the pitch never overflows. These
presets are tuned in the batting lab; see [testing](testing.md).
