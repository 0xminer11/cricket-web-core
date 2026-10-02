# Ball exit trajectories

The ball is **one object** with **one path** (`core/ball-path.ts`): the incoming flight until the visual contact point,
then the exit. There is never a second ball, and never a jump.

## Incoming (`planIncoming`)

From the AI bowler's release hand along the engine's delivery: the pitch point the engine resolved
(`target`), speed, swing/seam/spin, bounce. The preview the player's client receives contains exactly the numbers that
describe the ball's flight and nothing about the outcome.

## Exit (`planExit`)

Chosen from the engine's result: the shot's `worldDirection` and `exitSpeed`, its `launchAngle`, and the outcome
(`distanceClass`: infield, outfield, boundary, six; wicket type). Kinds: ground, lofted, boundary, six, edge (into the
off or leg side, behind the bat), caught (high, then down), bowled (on to the stumps), lbw, wide, miss (carries on
past the bat).

| Outcome            | What is drawn                                                              |
| ------------------ | -------------------------------------------------------------------------- |
| Defended           | dies near the bat                                                          |
| Ground shot / four | along the ground in the shot's direction, to the boundary for a four       |
| Six                | an arc over the rope                                                       |
| Edge               | deflects off the edge, behind square, to the off or leg side               |
| Caught             | rises in the shot's direction, then comes down                             |
| Bowled             | the ball goes on through to the stumps; the stumps and bails are disturbed |
| Miss               | passes the bat and carries on                                              |

## While the umpire hasn't answered

The incoming path continues; the swing and ball wait together on the contact frame (≤ 3 s). The nudge toward the bat
grows from nothing from the moment the result is known (`smoothstep`), so nothing pops mid-flight.
A result that arrives after the ball has passed takes it up from where it has got to.

## Camera

`ShotFollow` follows the ball down the ground (look point, height and field of view); `Wicket` cuts to a low stump
camera behind the bowler's end. See [camera](camera.md).
