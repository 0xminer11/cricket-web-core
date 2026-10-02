# Swing, seam and spin

The engine returns three non-negative magnitudes (`swing`, `seam`, `spin`) that depend on the bowler's attributes,
the delivery and the pitch multipliers. The server signs them in **batter-relative** terms (negative = toward the off
side, positive = toward the leg side) using `lateralDirection`/`signedMovement` in the engine package, and sends the
signed numbers. The scene converts the sign to a screen direction with the batter's hand. Nothing is hard-coded as
"outswing goes left".

| Profile                      | Direction                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `swing_out`                  | away from the batter (off side), whichever arm and hand                                                 |
| `swing_in`                   | into the batter (leg side)                                                                              |
| `seam`                       | nips back toward the stumps when it pitches on the off side, moves away when it pitches on the leg side |
| `cutter`                     | in the bowler's natural direction (right arm into a right-hander)                                       |
| `off_break`                  | into a right-hander for right-arm off spin, away for left-arm orthodox; mirrored for a left-hander      |
| `leg_break`                  | away from a right-hander for right-arm leg spin, into one for a left-arm wrist spinner                  |
| `googly`                     | the opposite of the stock ball for that bowler                                                          |
| `top_spin`, `slower`, `none` | straight                                                                                                |

## How much is drawn

Lateral metres = `magnitude * factor`, clamped to 0.9 m: swing 1.4, seam 1.0, spin 1.6 (visual exaggeration, config).
Swing appears before the bounce, seam and spin after it. The seam on the ball rotates with the spin magnitude so spin
is visible on the ball itself.

## Pitch types

Green raises seam and swing, Hard raises pace and bounce, Dry raises spin (Module 0 multipliers inside the engine).
The visual layer does not apply any pitch factor of its own: it draws the engine's resulting magnitudes. The lab and
the end-to-end test assert that seam is larger on Green than Hard and spin larger on Dry than Hard, as returned by
the engine and as drawn.
