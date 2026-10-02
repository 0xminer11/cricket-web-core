# Animation metadata

`config/batting-animations.ts` holds one `BattingAnimationDefinition` per Module 0 shot. Adding a shot means adding a
row here and an asset id, **not** changing gameplay code.

| Field                     | Meaning                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `shotId`                  | the Module 0 shot (`shot.cover_drive`)                                                          |
| `animationId`             | asset/clip id (`bat.cover_drive`)                                                               |
| `clipClass`               | family: defend_front, defend_back, drive, flick, cut, pull, hook, loft                          |
| `stanceType`              | front_foot or back_foot                                                                         |
| `duration`                | whole swing + follow-through, seconds                                                           |
| `contactNormalizedTime`   | when the bat meets the ball, as a fraction of `duration` (**the contact frame**, not a timeout) |
| `recoveryTime`            | seconds to settle back into the stance                                                          |
| `idealContact`            | `{ off, height }` metres, batter frame: where the sweet spot is at the contact frame            |
| `reach`                   | `{ off: [min,max], height: [min,max] }` how far the shot can reasonably go                      |
| `footStep`                | metres the leading foot travels                                                                 |
| `handednessMode`          | `mirror` (one clip, mirrored) or `dedicated` (one per hand)                                     |
| `compatibleLines/Lengths` | copied from the shot definition                                                                 |

## The current placeholder clips

| Shot                     | Animation               | Class        | Stance     | Duration s | Contact (s)   | Recovery s | Ideal contact off / height m | Foot step m | Total s |
| ------------------------ | ----------------------- | ------------ | ---------- | ---------- | ------------- | ---------- | ---------------------------- | ----------- | ------- |
| shot.forward_defensive   | bat.forward_defensive   | defend_front | front_foot | 0.95       | 0.38 (0.36 s) | 0.35       | 0.03 / 0.50                  | 0.32        | 1.30    |
| shot.back_foot_defensive | bat.back_foot_defensive | defend_back  | back_foot  | 0.90       | 0.40 (0.36 s) | 0.30       | 0.25 / 0.82                  | 0.18        | 1.20    |
| shot.straight_drive      | bat.straight_drive      | drive        | front_foot | 1.05       | 0.42 (0.44 s) | 0.40       | 0.03 / 0.45                  | 0.36        | 1.45    |
| shot.cover_drive         | bat.cover_drive         | drive        | front_foot | 1.10       | 0.42 (0.46 s) | 0.40       | 0.48 / 0.55                  | 0.40        | 1.50    |
| shot.on_drive            | bat.on_drive            | drive        | front_foot | 1.10       | 0.42 (0.46 s) | 0.40       | −0.35 / 0.45                 | 0.36        | 1.50    |
| shot.flick               | bat.flick               | flick        | front_foot | 1.00       | 0.42 (0.42 s) | 0.38       | −0.35 / 0.58                 | 0.30        | 1.38    |
| shot.cut                 | bat.cut                 | cut          | back_foot  | 1.00       | 0.42 (0.42 s) | 0.38       | 0.70 / 1.05                  | 0.20        | 1.38    |
| shot.pull                | bat.pull                | pull         | back_foot  | 1.05       | 0.42 (0.44 s) | 0.40       | −0.15 / 1.20                 | 0.20        | 1.45    |
| shot.hook                | bat.hook                | hook         | back_foot  | 1.05       | 0.42 (0.44 s) | 0.40       | −0.15 / 1.40                 | 0.18        | 1.45    |
| shot.lofted_straight     | bat.lofted_straight     | loft         | front_foot | 1.20       | 0.44 (0.53 s) | 0.45       | 0.03 / 0.58                  | 0.38        | 1.65    |
| shot.lofted_off_side     | bat.lofted_off_side     | loft         | front_foot | 1.20       | 0.44 (0.53 s) | 0.45       | 0.48 / 0.58                  | 0.40        | 1.65    |
| shot.lofted_leg_side     | bat.lofted_leg_side     | loft         | front_foot | 1.20       | 0.44 (0.53 s) | 0.45       | −0.38 / 0.58                 | 0.38        | 1.65    |

(`off` is toward the off side for a right-hander; a left-hander is the mirror.) These numbers are regenerated from the
config, so treat the config as the source of truth.

## Registering new assets

`battingClipId(shotId)` is the id a clip is registered and reported under (`batting.cover_drive`). The registry
(`core/assets.ts`) lists the bat as `batting.bat.01`. Full workflow: [animation-asset-guide](animation-asset-guide.md).

## Validation

The metadata is validated by tests, not by eye (`tests/batting/batting-core.test.ts`): every Module 0 shot has a
definition; its contact frame lies between 20 % and 70 % of the clip; the clip is longer than 0.6 s and recovers for more
than 0.1 s; the time from the start of the swing to contact is under 0.6 s (so the bounce can still be read before
committing); its compatible lines and lengths equal the shot's; both hands produce exact mirror poses at every moment; and
the stance returns exactly after every shot. For a new clip the same checks run unchanged, and
`tests/batting/contact-quality-report.test.ts` reports how far the bat is from a ball it should meet
([contact-assist](contact-assist.md#contact-quality-report-forced-perfect-per-animation-brief-259)).
