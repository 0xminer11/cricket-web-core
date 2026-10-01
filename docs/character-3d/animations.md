# Animations

## Logical clips

| Logical (`LogicalAnimation`) | Right-hander clip  | Left-hander clip   | Used for                     |
| ---------------------------- | ------------------ | ------------------ | ---------------------------- |
| `idle`                       | `Idle`             | `Idle`             | relaxed standing, no bat     |
| `idle_bat`                   | `Idle_Bat_R`       | `Idle_Bat_L`       | holding the bat (default)    |
| `batting_stance`             | `Batting_Stance_R` | `Batting_Stance_L` | ready stance (lean + crouch) |

`ANIMATION_CLIP_MAP` maps logical names to clip names. The code asks for `play('idle_bat')`; handedness picks the clip. The viewer plays `idle_bat` when a bat is equipped and `idle` otherwise.

## Behaviour

- `AnimationController` wraps one `AnimationMixer` bound to the base skeleton root. Because clothing is rebound to the same skeleton, every garment animates with the body.
- Switching clips cross-fades. Missing clips degrade to `idle`; if no clip exists the character simply holds the rest pose.
- The mixer only advances while the render loop runs (hidden tab and off-screen viewers do not animate). With `prefers-reduced-motion: reduce` the character holds a static pose instead of looping.
- `idle_bat` is a relaxed two-handed hold with a slight lean; `batting_stance` leans further forward with bent knees. Both are authored for a right-hander and mirrored for left (the `_L` clips are generated mirrors).

## Placeholder status

All five clips are **TEMPORARY PLACEHOLDER** procedural keyframes (small bone rotations on the real skeleton). Real motion-captured or hand-authored clips replace them by shipping them in the base GLB (or later in `game-assets/animations/`) under the same clip names.

## Adding a clip

1. Add the logical name to `LOGICAL_ANIMATIONS` and a right/left pair to `ANIMATION_CLIP_MAP`.
2. Author it against the canonical skeleton (bone names in [character-skeleton.md](character-skeleton.md)); left-hand clips must be true mirrors.
3. `pnpm assets:validate` checks every mapped clip exists in the base GLB.
4. Add a viewer button/test if the dressing room needs it.

## Match engine compatibility

Match animation (batting strokes, bowling actions) is a later module. Those clips will use the same logical-bone skeleton and the same handedness rule, so no character re-export is needed. Animation never mutates gameplay state.
