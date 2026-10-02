# Contact assist (BatBallContactPresenter)

`core/contact-assist.ts`. **The engine has already decided the contact quality; this decides how to _show_ it.**

The bat never decides anything by touching the ball. Raw bat-mesh collision would make a result depend on frame
rate, animation drift and bone offsets; here the result depends only on Module 8, and the picture is bent a small,
capped amount so that it agrees.

## Priority (what is tried first)

1. Choose the correct animation for the shot.
2. Align timing: for a contact, land the swing's contact frame on the ball ([timing-system](timing-system.md#timing-the-picture-to-the-result)); the plan also records a small playback warp (at most ±10 %).
3. A small **bat** correction (rotation).
4. A small **shoulder and hip** correction.
5. **Upper-body pitch**, then a **root** step toward the ball (footwork stride, a small lean or crouch).
6. If the body still cannot reach: nudge the _ball_ a little toward the bat (`maxBallShift`), and only if that is not
   enough, further (`maxBallShiftReach`) and flag the plan **`exceeded`**.

It **never distorts the body past the limits to chase a bad delivery.** (A pull to a ball well outside off stays a pull.)

## Configuration (`CONTACT_ASSIST`)

| Limit               | Value           | Meaning                                                      |
| ------------------- | --------------- | ------------------------------------------------------------ |
| `maxRootStride`     | 0.5 m           | sideways step toward the line (scaled by Footwork 0.7–1.3×)  |
| `maxRootOffset`     | 0.12 m          | forward lean                                                 |
| `maxRootDrop`       | 0.3 m           | knees bending / rising on the toes (scaled by Footwork)      |
| `maxHipYaw`         | 0.30 rad (~17°) | hips                                                         |
| `maxShoulderYaw`    | 0.30 rad        | shoulders                                                    |
| `maxUpperBodyPitch` | 0.12 rad        | lean over the ball                                           |
| `maxBatRotation`    | 0.30 rad        | angle of the blade                                           |
| `maxTimingWarp`     | ±10 %           | swing speed                                                  |
| `maxBallShift`      | 0.14 m          | ordinary visual tolerance for the ball (about one bat-width) |
| `maxBallShiftReach` | 0.40 m          | used only when the body cannot reach; plan marked `exceeded` |

The values were set by measuring real balls (below) and are tuned in the batting lab; changing them is a config
edit with a test, not a code change.

## How each quality is shown

| Engine says | The bat…                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| Perfect     | meets the ball on the sweet spot (residual 0)                                                               |
| Good        | meets it ~1.5 cm from the sweet spot                                                                        |
| Okay        | ~5 cm off: visibly less clean                                                                               |
| Poor        | ~9 cm off (the toe or the splice); the body budget is 85 %                                                  |
| Edge        | meets the ball with the bat's inside or outside **edge** (half a blade-width to one side)                   |
| Miss        | gets **no correction**: the bat goes where the shot goes; the ball passes over, under, inside or outside it |
| Wide        | never contact, whatever the shot                                                                            |

Every real contact keeps (almost) the full body budget; qualities differ in _how cleanly_, not in _whether_ the bat
reaches. The side of mis-centring or edge is a pure function of the ball's place in the **batter's** frame, so the same
ball is always met the same way and a left-hander gets the mirror image.

## How well does it cover real play?

`tests/batting/ai-contact-coverage.test.ts` plays the real AI bowler's deliveries through the real engine with the
shots a player picks and asks, whenever the **engine says the bat met the ball**, whether the bat visibly met it.
Measured (about 4,000 contacts, five bowling styles, three pitches):

| Engine contact | Within the ordinary tolerance | `exceeded` (needed the longer nudge) | p90 distance left over |
| -------------- | ----------------------------- | ------------------------------------ | ---------------------- |
| Good / Perfect | ~98 %                         | ~2 %                                 | 0 cm                   |
| Okay / Poor    | ~62 %                         | ~38 %                                | ~8 cm                  |

Some "okay" contacts on wide balls need the longer 0.4 m nudge, and about 1 % of the widest are still short of the bat.
This is a known limitation of procedural placeholders and a measurement to repeat when real clips arrive (a clip for
reaching wide, or high, balls removes it). It is flagged in the plan (`exceeded`, `residual`) and shown in the lab.

## Contact quality report: forced Perfect, per animation (brief 259)

`tests/batting/contact-quality-report.test.ts` forces a **Perfect** contact for every shot over every ball the shot
_suits by line and length class_ (a 9×9 grid of pitching points × three speeds × three bounces), and reports the distance
between the bat's middle and the ball at the contact frame, **before** the ball is nudged. The numbers are identical for a
left-hander (tested). There is deliberately no universal target before real animation assets are measured.

| Shot                     | Balls | Average gap (cm) | p90 gap (cm) | Needed the long nudge |
| ------------------------ | ----- | ---------------- | ------------ | --------------------- |
| shot.forward_defensive   | 54    | 5.9              | 37.3         | 16.7 %                |
| shot.back_foot_defensive | 144   | 4.2              | 11.8         | 0 %                   |
| shot.straight_drive      | 18    | 0                | 0            | 0 %                   |
| shot.cover_drive         | 108   | 13.6             | 38.2         | 33.3 %                |
| shot.on_drive            | 27    | 0                | 0            | 0 %                   |
| shot.flick               | 135   | 15.6             | 53.4         | 33.3 %                |
| shot.cut                 | 54    | 7.2              | 26.4         | 33.3 %                |
| shot.pull                | 216   | 18.9             | 66.6         | 33.3 %                |
| shot.hook                | 72    | 12.1             | 32.8         | 33.3 %                |
| shot.lofted_straight     | 54    | 3.8              | 28.9         | 11.1 %                |
| shot.lofted_off_side     | 108   | 13               | 38.2         | 33.3 %                |
| shot.lofted_leg_side     | 135   | 14.8             | 47.8         | 28.9 %                |

How to read it: the grid includes the **widest and highest** balls each shot's class admits, which is why a pull or a flick
(wide classes) shows a larger p90 than a straight drive (one narrow line). In play the engine gives such balls Okay or Poor
contact, not Perfect, so the table above ("How well does it cover real play?") is the practical measure. A real clip for a
reach or a high ball removes most of the gap; until then these are the placeholder limits.

## Developer metrics (section 258)

The lab and `?debug=1` overlay show, per ball: contact offset (`ballToSweetSpot`, `closestToSweetSpot`), the timing
warp, how much of each budget was used (root, hips, shoulders, bat), and whether the plan was `exceeded`.
