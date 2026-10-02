# Pitch visuals

The pitch type changes only how the surface is drawn; every effect on the ball comes from the engine.

| Pitch | Look (TEMPORARY PLACEHOLDER)       |
| ----- | ---------------------------------- |
| Green | green surface with lighter streaks |
| Hard  | pale tan, firm and flat            |
| Dry   | worn, paler surface with cracks    |

Common elements: mown outfield stripes, the boundary rope (70 m), a stands and crowd band at the horizon (simplified
on the low quality tier), bowling creases, popping creases and return creases at both ends, and stumps with bails at
both ends. When the engine says a batter was bowled the batter-end stumps tilt and the bails lift for about 0.4 s.

Asset ids (registry): `match.pitch.green`, `match.pitch.hard`, `match.pitch.dry`, `match.ground.outfield`,
`match.stadium.stands`, `match.stumps.standard`, `match.ball.red`. Real art can replace any of them without touching
gameplay code.
