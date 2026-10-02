# Coordinate system

Two spaces are used and they never mix.

## 1. Engine / network: normalized, cricket-relative (the only thing sent over the wire)

| Axis         | 0                              | 1                                                         |
| ------------ | ------------------------------ | --------------------------------------------------------- |
| `x` (line)   | wide outside the **off** stump | wide down the **leg** side, relative to the batter's hand |
| `y` (length) | yorker (at the batter's feet)  | bouncer (furthest from the batter)                        |

Zone edges are `ENGINE_BALANCE.lineEdges = [0.12, 0.36, 0.49, 0.62, 0.85]` and
`lengthEdges = [0.13, 0.34, 0.62, 0.84]`. Pixels are never sent. Changing the resolution or the camera does not change
the target.

## 2. Scene: world metres

- `u` across the pitch, positive toward the **viewer's right**,
- `v` along the pitch, `0` at the bowler's stumps, `20.12` at the batter's stumps,
- `z` up.

`targetToWorld(target, hand)`: `u = handSign * (x - 0.5) * 3.2`, `v = 20.12 - 1.22 - y * 12` (so a yorker lands at the
popping crease and the targetable region spans 12 m), where `handSign` is `+1` for a right-hander and `-1` for a
left-hander.

## Off side and leg side are not screen-left and screen-right

The camera stands behind the bowler looking at the batter. For a **right-hander the off side is the viewer's left**;
for a **left-hander it is the viewer's right**. Everything that depends on side uses batter-relative values and is
converted once with `handSign`:

- movement signs (outswing always leaves the batter, whichever arm bowls and whichever hand bats; spin is mirrored for
  a left-hander; a left-arm orthodox ball turns away from a right-hander),
- the bowler's release side (right-arm releases on the viewer's right, left-arm on the left),
- shot direction: `worldDirection` is degrees, `0` straight back toward the bowler, positive = the batter's right-hand
  side (the viewer's left).

## Screen projection

`project(point, view, viewport)` is a pinhole camera: depth `= dv*cosφ - dz*sinφ`, `x = cx + f*du/depth`,
`y = cy - f*(dv*sinφ + dz*cosφ)/depth`. `unprojectToGround` is its exact inverse for `z = 0`; the tests round-trip
targets at 1920x1080, 1366x768, 844x390 and 390x844 to 6 decimals. Portrait viewports scale by width so the pitch never
overflows.
