# Ball trajectory

`planTrajectory` (core/trajectory.ts) turns the engine's `ResolvedDelivery`, `ResolvedShot` and outcome into a path.
It is pure and deterministic: the same inputs give the same path. It **presents** what the engine decided and never
changes a number the engine returned.

## Guarantees (all tested)

- the ball **pitches exactly on the engine's ACTUAL target** (`targetToWorld(delivery.actual.target)`), within
  floating-point precision; the end-to-end test also compares the rendered pitch point with the server's response,
- it starts at the bowling hand, never goes underground, and never produces NaN,
- a faster ball arrives sooner than a slower one, and pace ratios are preserved,
- swing, seam, spin and bounce use the engine's values only.

## Phases

1. **Pre-bounce** (release -> pitch point): horizontal speed from the engine speed, height from ballistic gravity
   over the real flight time (a slow ball loops, a fast one is flat). Swing is drawn by aiming to the opposite side and
   curling late onto the target, so it grows late and always lands on the target.
2. **Post-bounce** (pitch point -> batter): seam/spin deviation eases in; the peak height and the height at the bat come
   from the engine's `bounce` (higher on Hard, from shorter lengths).
3. **Exit** (after the bat): one of `bowled`, `lbw`, `caught`, `wide`, `miss`, `edge`, `defence`, `ground`, `boundary`,
   `six`, chosen from the engine's wicket type, extra type, contact quality and runs. Direction is `worldDirection`.

## Ending at the right place

`bowled` ends at the stumps, `lbw` at the pads, `caught` goes up and out toward the shot's sector (no fielder is
drawn), a `miss` and a `wide` pass the batter to the keeper, an `edge` glances behind the batter (or runs to the
boundary), a `six` leaves the ground and a `four` stays on it.

## Contact presentation

`resolveContactPresentation` decides where the bat swings. Perfect and good contact put the bat on the ball path
(within 2 cm), an edge uses a tilted bat and a small offset, and a miss swings **0.5 m early or late** so there is
visible daylight. No collision is ever tested; the bat is allowed to cheat by centimetres. The result still comes
only from the engine.

## Visual time scaling

Real flight times (about 0.45 s for a 38 m/s ball) are unplayably short, so presentation time is
`real * visualSlowdown` with `visualSlowdown = 2.4` (config). A fast ball (about 38 m/s) therefore takes about 1.1 s
on screen and a spinner (about 18 m/s) about 2.4 s, so relative pace is preserved and still obvious.
