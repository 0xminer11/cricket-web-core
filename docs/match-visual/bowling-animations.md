# Bowling animations

`BowlingAnimationDefinition` (per bowling style) names four clips and the release marker:

```ts
{
  (bowlingStyleId,
    idleAnimationId,
    runUpAnimationId,
    deliveryAnimationId,
    followThroughAnimationId,
    releaseMarker);
}
```

All eight styles are mapped (`right_arm_fast`, `left_arm_fast`, `right_arm_medium`, `left_arm_medium`, `off_spin`,
`leg_spin`, `left_arm_orthodox`, `left_arm_wrist_spin`). Gameplay code never mentions a file name: clip ids
(`bowler.fast.right.delivery`, ...) are resolved through `CLIP_LIBRARY`, and assets by id through the registry.

## Procedural placeholder (TEMPORARY PLACEHOLDER)

No owner-supplied art exists yet, so each bowler is a procedural rig: joints in metres (head, neck, pelvis, shoulders,
elbows, hands, hips, knees, feet) posed by `bowlerFrameAt(timeline, t)`. The same code path will drive imported
skeletal clips later; the contract (clock in, pose and bowling-hand position out) does not change.

## Timeline of one delivery

| Phase                                     | Fast           | Medium         | Spin           |
| ----------------------------------------- | -------------- | -------------- | -------------- |
| waits at the crease while the player aims | -              | -              | -              |
| walk back to his mark                     | 0.55 s         | 0.40 s         | 0.25 s         |
| run-up                                    | 6.0 m / 1.40 s | 4.2 m / 1.10 s | 2.2 m / 0.80 s |
| delivery clip                             | 0.62 s         | 0.56 s         | 0.50 s         |
| follow-through                            | 0.55 s         | 0.55 s         | 0.55 s         |

The bowler stands at his crease in the aiming shot (so the aim view can be steep and large) and walks back when
BOWL is pressed while the camera pulls out. Reduced motion shortens the walk-back and run-up. Run-up uses scripted
position, not root motion, in one place only, so there is no double movement; the end of the run-up lands within 0.4 m
of the crease (asserted).

## Left-arm and spin

Left-arm bowlers mirror the release side (`lineU` and shoulder side). Spinners have a shorter run-up and action. All
8 styles resolve to a clip; an unknown style or a missing clip falls back, keeping the bowler's real arm where
possible (same kind and arm, then medium with the same arm, then right-arm medium). The fallback is logged in
development and reported (`match_visual_error: asset_fallback`).

## Batter

The AI batter's swing is chosen from the engine's shot and contact quality: `SHOT_CLIPS` maps every Module 0 shot id to
a clip (`defend_front`, `defend_back`, `drive`, `flick`, `cut`, `pull`, `hook`, `loft`); an unmapped shot falls back to
its category and is reported. See [ball-trajectory](ball-trajectory.md) for how contact is presented.
