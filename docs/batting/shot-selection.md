# Shot selection

`core/batting-shot-selector.ts`. UI code never names a shot; it names an **action** and a **direction**, and the
selector turns them into one of the Module 0 shots using the delivery the player can see.

The choice follows the player's _intent_ first and only uses the ball to choose between the shots that intent allows.
It never "fixes" a bad decision: a drive to a bouncer is still a drive and the engine judges it as one.

| Action          | Rule                                                                                  |
| --------------- | ------------------------------------------------------------------------------------- |
| Defend          | short / bouncer -> back-foot defensive; otherwise forward defensive                   |
| Drive           | direction off -> cover drive; leg -> on drive; straight -> straight drive             |
| Leg side        | bouncer -> hook; short -> pull; otherwise flick                                       |
| Cut / back foot | wide of off on a good/short ball -> cut; otherwise back-foot defensive                |
| Loft            | direction off -> lofted off side; leg -> lofted leg side; straight -> lofted straight |

The selection is a pure function of `(action, direction, line, length)`: the same inputs always give the same shot,
for either hand (tested). Adding a shot (a sweep, a ramp) is a table change here, not a UI change.

## Hints (assist Normal / High / Auto)

`shotHint` shows one of three words (_Good shot option / Playable / Risky_) from the same line/length suitability the
engine uses; `suggestedAction` marks the sensible action with a dashed border. They are never the engine's number and
never replace the decision. With assist Off there are no hints.

## Advanced: choose the exact shot

The "Choose the exact shot" disclosure lists all 12 shots. Choosing one overrides the simple controls until the
player picks an action again.
