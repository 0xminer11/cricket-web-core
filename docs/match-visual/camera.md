# Camera

`MatchCameraController` is a pure state machine with six shots, blended over 0.25-0.7 s:

| State          | When                      | Shot                                                                                                                                         |
| -------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreDelivery`  | aiming                    | steep, elevated (about 45 degrees down) so the length bands are tall enough to aim at; bowler at his crease at the bottom, batter at the top |
| `RunUp`        | walk-back and run-up      | further back and lower, framing the whole run-up                                                                                             |
| `Release`      | the release frame         | slight push-in                                                                                                                               |
| `BallTracking` | the flight                | follows the ball down the pitch                                                                                                              |
| `Batter`       | the ball reaching the bat | closer to the batter                                                                                                                         |
| `Result`       | the result                | wide, to frame the pitch and the outfield                                                                                                    |

Each preset has its own `centerY`, so the shot can sit higher or lower in the viewport.

## Framing is tested

`framesAll` is used by unit tests to prove, at 1920x1080, 1366x768, 844x390 and 390x844, that:

- the aim view contains the bowler's head and feet at the crease, all four corners of the targetable region, the
  batter and the far end,
- the run-up shot contains the bowler at his mark and in full stride, the release hand and the batter for the fast and
  the spin timelines,
- the release, batter and result shots contain what they need.

The presets were found with a constrained search (everything on screen, the good-length band at least 7% of the
canvas height, each preset tuned at all four sizes), because a conventional low behind-the-bowler shot compresses the
whole 12 m targetable region into about 70 pixels and makes aiming impossible.

## Left-arm bowlers and left-handed batters

The camera is symmetrical; the bowler's release side and the off side flip with the arm and the hand
(see [coordinate-system](coordinate-system.md)).

## Reduced motion

The camera never moves; every state resolves to the `PreDelivery` shot (asserted in a unit test and an end-to-end
test).
