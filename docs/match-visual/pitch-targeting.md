# Pitch targeting

`PitchTargetController` owns the aimed target in the engine's normalized coordinates (`x` line, `y` length, both
0..1). Every setter clamps and rejects non-finite values, so the marker cannot leave the pitch and no NaN can reach
the engine.

## Ways to aim

- **Drag or tap** the pitch: the pointer is converted to the ground plane by the inverse camera projection
  (`screenToTarget`) and clamped. The canvas has `touch-action: none` so dragging never scrolls the page.
- **Presets**: length (Yorker, Full, Good, Short, Bouncer) and line (Wide outside off, Outside off, Off stump,
  Middle, Leg stump) buttons move the aim to the zone centres from `ENGINE_BALANCE`. They do not need any precision.
- **Fine aim**: four buttons (and the arrow keys) nudge by 0.02 (0.08 with Shift).
- **Aim snap** (assist): when close to a zone centre (within 0.06) the aim snaps to it.

## Readout

The marker label and the aim readout are derived with the engine's own `classifyLine` / `classifyLength`, for example
"Outside off, good length". They only label the marker. The zone overlay (length bands with dashed boundaries, line
zones with dotted boundaries, text labels, a highlighted active band) does not rely on colour.

## Not a result

The marker is the INTENDED target. The engine returns the ACTUAL target using Accuracy, Control, fatigue, delivery
difficulty and the execution input. The actual target is not shown before release (it is only returned in the
response, which the scene uses to place the ball). A development overlay (`?debug=1`) shows intended vs actual.
