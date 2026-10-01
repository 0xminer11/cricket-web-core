# Skill progression

Two numbers per skill, kept apart on purpose:

|                 | What it is                                        | Stored in                                                                 |
| --------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| **Skill value** | the attribute used by gameplay, 1-100 (Timing 52) | `player_attributes`                                                       |
| **Skill XP**    | progress toward the _next_ point (71 / 277)       | `player_skill_progress` (sparse: a row exists once a skill has earned XP) |

Mixing them in one field would make "Timing 52" ambiguous (value or XP?) and make rebalancing the curve rewrite player stats, so they are separate columns/tables (Module 2 already provided both; Module 7 adds no table).

## The rule (Module 0)

Training adds Skill XP. Each time XP reaches `skillXpToNextPoint(value)`, the skill rises by one and the remainder carries over. It never jumps a point just because a drill was done, and a session may cross zero, one or several thresholds.

```text
Timing 52, XP 71/277.  +35  →  XP 106/277, Timing 52   (no point yet; the UI shows no arrow)
Timing 52, XP 267/277. +35  →  Timing 53, XP 25/next    (arrow "52 → 53")
```

`applySkillXp(value, xp, gain)` does exactly this, in game-core, for the server and for previews.

## Caps and maxed skills

- The hard cap is 100. At the cap XP is **not credited** (no unusable XP piles up), the bar shows MAX and the stored XP for that skill is 0.
- A drill whose _every_ skill is maxed is refused with `SKILL_MAXED` and shown as "Already at maximum". If only some are maxed the drill still works for the others and the result lists the maxed skill as `MAX +0`.
- There are no role limits, training caps or career caps in Module 0, so none are invented.

## Diminishing returns

Built into the curve: `skillXpToNextPoint(s) = round(45 + 1.6 s + 0.055 s²)` (stat 30 → 142 XP, 52 → 277, 90 → 634). The same drill gives the same XP at every level, so a point at 90 takes about 4.5 times as many sessions as one at 30. Tested monotonic for 1..99.

## Which skills can improve

Exactly the 22 attributes in `TRAINABLE_SKILL_KEYS` (8 batting, 8 bowling, 6 physical), mirrored in the database `SKILL_STAT_KEYS` (a test keeps them equal). Reputation, fans, form, selector interest and personality are not trainable and have no drill. Normal training never lowers a skill; fatigue changes readiness, not permanent skill.

## Persistence

`addSkillXp` (atomic upsert-increment) then, if a point was earned, `applySkillPoint` (compare-and-set of XP remainder and new value, inside the same transaction). The service verifies the XP total equals what the engine assumed; a mismatch (another writer touched the skill) aborts and retries.

## Overall ratings

Overall is derived on read from the attributes with the Module 0 formulas (`playerOverall`, `battingOverall`, `bowlingOverall`, `physicalOverall`); nothing is stored twice. The result screen and Career Home show the recalculated value.
