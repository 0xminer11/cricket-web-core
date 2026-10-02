# Shot direction

Direction is **cricket-relative**: −1 is the leg side, 0 straight, +1 the off side, for a right- and a left-hander
alike. A left-hander's off side is the mirror image on screen, and the controls and the arrows follow that.

## From the player to the engine

1. The controls give `direction` in −1…+1 (five steps in the UI).
2. The server maps it onto the **chosen shot's own arc**. A cover drive cannot be played behind square: with
   `BATTING_INPUT.directionDegrees = 70`, the desired angle `direction × 70°` is clamped into the shot's
   `directionDegrees` range and rescaled to the engine's `directionInput` (−1…1).
3. The engine uses `directionInput` with the shot's own spread and the batter's Placement to choose where the ball goes.

The client never sends degrees or a sector; only the −1…+1 value.

## Simplified controls

For Drive and Loft the direction picks the shot (off / straight / leg). For Leg side, Defend and Cut the direction
still goes to the engine as a lean inside that shot's arc. Bands: below −0.34 is leg, above +0.34 is off.

## On screen

The scene shows the engine's `worldDirection` (degrees, 0 = straight back down the ground, positive = the batter's
right) for the ball's exit; see [ball-exit-trajectories](ball-exit-trajectories.md).
