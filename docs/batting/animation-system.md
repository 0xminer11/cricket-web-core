# Animation system

There are no art assets yet: every swing is a **TEMPORARY PLACEHOLDER** drawn procedurally by `core/batting-rig.ts`.
The system is built so real clips can replace them without touching gameplay: gameplay asks for a shot id and gets a
definition ([animation-metadata](animation-metadata.md)); the rig turns it into a pose for any time.

## The rig

A skeleton of 12 joints (head, neck, pelvis, both shoulders and elbows, grip, knees, feet) plus the bat (grip, tip,
**sweet spot**, inside and outside edge). Everything is built in the batter's **own frame** (`off` toward the off
side, `fwd` toward the bowler, `z` up) and converted to the world by hand, which is why a left-hander is an _exact_
mirror image of a right-hander.

A swing is four phases: **stance -> backlift -> swing (to the contact frame) -> follow-through -> recovery**, with a
tiny breathing sway in the stance so the figure is not frozen.

## One swing, driven by the contact frame

The clip is not played by a timer that might finish early or late: it is driven to its **contact frame**, the moment
the bat meets the ball. If the umpire's answer has not arrived, the swing holds on that frame (≤ 3 s). When the result is a
contact the clock is aligned so the contact frame lands exactly on the ball (see [timing-system](timing-system.md#timing-the-picture-to-the-result)).

## Additive corrections, always cleared

Contact assist adds small corrections (root stride, hip and shoulder yaw, upper-body pitch, bat rotation). They are
**additive** and weighted by `adjustWeight`, which is zero outside the backlift-to-end window, so the batter starts
and ends every shot in exactly the stance pose. After 100 shots in a row nothing has moved (tested), and `reset()`
clears everything.

## Fallbacks

`resolveShotAnimation(shotId, unavailable)`: if a shot's clip fails, its family's generic clip plays; then the
forward defensive; then the minimal procedural swing (a straight drive). The _engine's_ shot never changes. A
warning is emitted once per shot (`?failAssets=batting.cover_drive` in development exercises it). A missing bat or
batter asset falls back to the plain drawn bat and figure; the match never crashes.
