# Animation asset guide (for the owner)

This is exactly how to supply a batting animation so a new shot can be added **without rewriting gameplay**. Every
shot in the game is currently a TEMPORARY PLACEHOLDER drawn procedurally; this guide is what real clips must provide.

## What to send for every animation

| Field              | What we need                                                                                                                   | Example                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| **Shot name**      | the cricket name                                                                                                               | Cover Drive                           |
| **Shot ID**        | the Module 0 shot it plays (one of the 12; a new shot needs a Module 0 definition first)                                       | `shot.cover_drive`                    |
| **Source file**    | the file(s), one per clip, named after the animation id                                                                        | `bat.cover_drive.glb`                 |
| **Skeleton**       | the rig it was authored on; must be the project's batter skeleton (humanoid, the 12 joints below + a bat socket)               | `batter_v1`                           |
| **Handedness**     | `mirror` (one right-handed clip; we mirror it) or `dedicated` (a left- and a right-handed clip)                                | mirror                                |
| **FPS**            | the authored frame rate                                                                                                        | 30                                    |
| **Duration**       | seconds from the first frame of the backlift to the end of the follow-through (recovery excluded)                              | 1.10                                  |
| **Contact frame**  | the frame where the bat meets the ball (number **and** seconds). Not a guess: scrub to the moment the blade is at the ball     | frame 14 = 0.46 s                     |
| **Foot movement**  | which foot moves, which way, and how far (metres). Front-foot shots: the stride; back-foot: the step back/across               | front foot, +0.40 m toward the bowler |
| **Root motion**    | whether the pelvis translates in the clip (and by how much). Prefer **in place** (the engine adds the step). Declare it if not | none                                  |
| **Bat grip**       | where the bat attaches (hand socket name) and its length                                                                       | `hand_r_socket`, 0.85 m               |
| **Recovery frame** | the frame at which the Cricketer is back in the stance, or the seconds of the recovery clip                                    | 0.40 s                                |

Also: the **ideal contact point** of the sweet spot at the contact frame, in the batter's frame (metres: `off` toward the
off side for a right-hander, `height` above the ground). If you cannot measure it, say so and we will read it from the
clip in the batting lab.

## Rules for the clips

1. One clip per shot; do not bake the contact **timing** into a clip's length (we drive the clip _to_ its contact frame).
2. The stance (frame 0) and the final frame must be the **same stance pose**, so shots chain with no pop.
3. No camera, no ball, no extra props in the file; the bat is a socket.
4. Right-handed unless declared `dedicated`.
5. Keep the swing's duration realistic: 0.9–1.3 s including follow-through; contact at 38–45 % of it for a drive.

## Joints we need

`head, neck, pelvis, shoulder_l, shoulder_r, elbow_l, elbow_r, grip (the hands' meeting point), knee_l, knee_r,
foot_l, foot_r`, plus the bat's `grip` and `tip` sockets. Extra bones are fine; these are required.

## What we do with it ("New shot asset workflow")

1. **Validate the skeleton** against the required joints (a mismatch is rejected with a message).
2. **Import / convert** to the runtime format.
3. **Register the asset** in `core/assets.ts` (id `batting.<shot>`).
4. **Map `ShotDefinitionId`**: the animation row in `config/batting-animations.ts` (`shotId`, `animationId`).
5. **Configure the contact frame** (`contactNormalizedTime = contactSeconds / duration`).
6. **Configure the ideal contact point** (`idealContact`, `reach`).
7. **Configure handedness** (`handednessMode`).
8. **Test in `/dev/batting`**: pick the shot, both hands.
9. **Force a Perfect result** (Forced result -> perfect, speed 0.25×, freeze at contact).
10. **Inspect contact**: the overlay shows `ball→bat` and `closest` (metres); a Perfect should be within a couple of centimetres.
11. **Tune the small assist offsets** (`CONTACT_ASSIST`) only if a whole family needs it; never per ball.
12. **Test Edge and Miss**: the ball meets the edge; the bat clears the ball by daylight.
13. **Test mobile performance** (phone landscape; see [performance](performance.md)).

No gameplay engine rewrite is required at any step: the engine decides the result; the assist, the timing, the ball
path and the HUD read the definition.

## If an asset fails to load

The scene falls back (the family's generic clip -> forward defensive -> the minimal procedural swing), says so once in
development (`?failAssets=batting.cover_drive` reproduces it) and the match stays playable. The result is never
affected.

## Contact validation tool

`/dev/batting` is the contact debugger: it draws the sweet spot and both edges, prints `ball→bat` and `closest`, and lets
you step frame by frame at 0.1× to 1× speed with a **Forced result** of Perfect, Good, Okay, Poor, Edge, Miss, Bowled, LBW,
Caught, Four, Six or Wide. The same numbers are asserted automatically for both hands in `e2e/batting.spec.ts`.
