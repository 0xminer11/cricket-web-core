# Hip and shoulder adjustments

The body corrections that contact assist uses are **additive** deltas on the clip's own pose. They exist so a ball a
few centimetres away from the shot's ideal contact point can be met without choosing a different clip.

| Degree of freedom | Effect                                              | Limit                     |
| ----------------- | --------------------------------------------------- | ------------------------- |
| `batRotation`     | rotates the blade about the grip                    | ±0.30 rad                 |
| `shoulderYaw`     | turns the shoulder line (moves the hands sideways)  | ±0.30 rad                 |
| `hipYaw`          | turns the hips (carries the shoulders a little)     | ±0.30 rad                 |
| `upperBodyPitch`  | bends over / stands tall (changes height and reach) | ±0.12 rad                 |
| `rootOff`         | steps the whole body sideways (footwork)            | ±0.5 m × Footwork factor  |
| `rootFwd`         | leans the whole body forward / back                 | ±0.12 m × Footwork factor |
| `rootDown`        | sinks into the knees / rises on the toes            | ±0.3 m × Footwork factor  |

## Solving

The solver works in the contact frame only. For each degree of freedom in priority order (bat, then shoulders and
hips, then upper body, then root) it measures how the sweet spot moves per unit (finite differences), takes the
least-squares step toward the target, clamps it to the cap and moves on; two passes. Because the contact frame is
all that matters, the corrections are **blended in smoothly** through `adjustWeight` (0 outside backlift-to-end) so
the first and last frames of the clip are untouched and nothing pops.

## Guarantees (all tested)

- The solver and the posed skeleton agree **exactly** at the contact frame (verified for every degree of freedom and
  a combination).
- Every correction stays inside its cap, for every shot, for both hands, for any ball.
- All corrections are cleared when the shot ends: 100 shots in a row leave the pelvis exactly where it started
  (bone reset / root-drift tests).
- A left-hander's plan equals a right-hander's in the batter's own frame.
