# Asset guide (for the owner)

Every match asset is currently a **TEMPORARY PLACEHOLDER** drawn by code. Supplying real art never requires gameplay
changes: add the file to the match asset registry (`apps/web/src/features/match/core/assets.ts`) with its `url` and the
preload scene loads it; if it is missing or fails to load the scene keeps the placeholder, logs a warning and the match
stays playable.

## Asset ids

```text
match.pitch.green / match.pitch.hard / match.pitch.dry
match.ground.outfield, match.stadium.stands, match.stumps.standard, match.ball.red
bowler.fast.right.01, bowler.fast.left.01, bowler.medium.right.01, bowler.medium.left.01
bowler.spin.right.01, bowler.spin.left.01
batter.right.01, batter.left.01, match.ui.icons
```

## Bowler animations (per bowler family)

For each family (`FastBowler`, `MediumBowler`, `OffSpinner`, `LegSpinner`, plus left-arm versions) provide four clips:

```text
FastBowler_Idle           looping
FastBowler_RunUp          looping, one stride cycle (the engine controls distance)
FastBowler_Delivery       one shot, the release must be at a known normalized time
FastBowler_FollowThrough  one shot
(MediumBowler_*, OffSpinner_*, LegSpinner_*, LeftArmFast_*, LeftArmOrthodox_* ...)
```

| Requirement | Value                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orientation | character faces +Z (down the pitch, away from the camera), upright, feet on the origin                                                              |
| Scale       | 1.80 m tall at scale 1 (the scene uses metres)                                                                                                      |
| Hand        | the bowling hand must be named (right or left); left-arm clips are separate, not mirrored at runtime                                                |
| Release     | delivery clip: record the normalized release time in `releaseMarker` (0.60-0.70 typical); the ball starts from the bowling-hand joint               |
| Frame rate  | 30 fps (60 acceptable); delivery 0.5-0.65 s, follow-through about 0.55 s                                                                            |
| Root motion | none inside the run-up/delivery clips; position is scripted from the run-up distance (6.0 / 4.2 / 2.2 m) so there is no double movement             |
| Loops       | idle and run-up loop seamlessly; delivery and follow-through do not                                                                                 |
| Feet        | planted at the crease at the end of the delivery within 0.4 m (no sliding)                                                                          |
| Export      | spritesheet atlas (PNG or WebP) with a JSON frame list per clip, or a Spine export; maximum 2048 x 2048 per atlas, compressed, one atlas per family |

## Batter

`batter.right.01` / `batter.left.01` with clips for: stance, forward defensive, back-foot defensive, drive, flick, cut,
pull, hook and loft (the shot ids in `SHOT_CLIPS`). Each shot clip needs a marked **contact frame**. Left-hander clips are
separate (not a runtime mirror) so the bat is on the correct side.

## Scene art

Pitch surface in three variants (Green, Hard, Dry), outfield with mown stripes, boundary rope, stands/crowd layer,
stumps and bails, a red cricket ball (about 128 px), and match HUD icons. Keep textures compressed and under about 1 MB
each; do not ship 4K stadium backgrounds.

## Calibration

The release position and marker are data: edit `releaseMarker` in `BOWLING_ANIMATIONS`, or the bowler timeline in
`config/visual-config.ts` (`RUN_UP`). Use `/dev/bowling` (development only) to replay the same ball with the same seed
while adjusting.

## Validation checklist for a bowler clip

frame count and duration; release frame marked; orientation; scale; feet placement; no root motion; hand used;
bowling style. Report anything missing so the registry entry keeps the placeholder.
