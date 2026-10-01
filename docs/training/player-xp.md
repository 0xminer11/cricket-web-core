# Player XP and levels

Player XP is separate from Skill XP. It drives the broad player level (cap 50, `xpToNextLevel(level) = round(120 × level^1.45 + 80)`), which gates content; it does not raise any attribute. Module 0 calls it "a secondary reward" of training, so each drill grants a modest amount (20-40).

## Calculation

`playerXp = base × fatigueEfficiency × dailyLoad × performance` (no Discipline: personality only touches Skill XP). `applyPlayerXp({level, xp, gain})` in game-core then:

- adds the gain, and **loops** while `xp >= xpToNextLevel(level)`: any number of level-ups from one award, remainder carried;
- stops at the level cap: at the cap the gain is not credited, XP shows MAX and no impossible next target is displayed;
- returns `levelChanges`, the XP left, and the XP needed for the next level.

```text
Level 4, 1,310/1,318, +25  →  Level 5, 17/next
```

## Persistence

`awardXp` (atomic `current_xp + n`, also bumps monotonic `lifetime_xp`) and, when levels changed, `applyLevelUp` (compare-and-set on the row version; the row is already locked by the transaction). Lifetime XP never decreases (a database trigger enforces it).

## Events

One `player.level_up` per session that changed level (`oldLevel`, `newLevel`, `source: 'training'`), published after commit, plus analytics `training_level_up`. The result screen shows a lightweight **LEVEL UP!** banner; there is no cinematic.

## Tests

Single, multiple and capped level-ups (engine), crossing a threshold through the API with persisted level and remainder, and a player at level 50 who can still train (E2E).
