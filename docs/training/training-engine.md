# The Training Engine

`packages/game-core/src/training/training-engine.ts`: pure, deterministic, no database, React, clock, RNG or I/O. The API and the simulator call the same functions, so previews, applied results and balance reports can never disagree.

```ts
resolveTraining({ player, training, performanceScore? }) →
  { ok: false, availability }                       // not allowed: reason + detail
  { ok: true, result }                              // everything that will happen

previewTraining(input)   // same numbers with the availability gates ignored (for locked/expensive drill cards; never applied)
```

## Input: `TrainingPlayerSnapshot`

`level, xp, role, bowlingStyle, attributes, skillXp (sparse), fatigue, coins, sessionsToday, restsToday, matchesSinceLast?`. It is assembled from persisted facts by `buildTrainingSnapshot` (also pure). The engine never reads time: "today" is already folded into the two counters by the caller.

## Output: `TrainingEngineResult`

`kind` (drill | recovery), per-skill `SkillXpChange` (base XP, XP gained, XP and value before/after, XP-to-next before/after, maxed), `attributeChanges` (only skills that really rose), Player XP application (levels before/after, remainder, `levelChanges`), `fatigue {before, after, delta}`, `cost`, every `modifier` used, the effective `skillXpMultiplier`, and the definition `balanceVersion`.

## Order of evaluation

1. Availability (level → role → style → cooldown → [rest: already fresh] → maxed skills → fatigue block → coins).
2. Modifiers (fatigue efficiency, daily load, Discipline, optional performance; Stamina for fatigue gain), each clamped, the product clamped to 0.05-1.10.
3. Skill XP per grant, then `applySkillXp` (thresholds, remainder, cap).
4. Player XP, then `applyPlayerXp` (multi-level, cap).
5. Fatigue, clamped.

## Determinism and randomness

No `Math.random()` anywhere in domain logic (a repository-wide check is part of the acceptance review). MVP training has **no randomness**: a drill's result is a function of the snapshot, which makes preview exact and balance reasoning simple. If a future mode needs variance, it must inject a seeded RNG (`SeededRandomSource` exists) through a new input, not reach for globals.

## Optional performance score (future)

`performanceScore` (0-1) is accepted and scales XP 0.8-1.2; absent means no effect. Module 7 never supplies it and the API cannot receive it from a client. See [future-minigames.md](future-minigames.md).

## Related pure modules

`getSkillXpRequired`/`applySkillXp` (skill-xp), `applyPlayerXp` (progression), `fatigueEfficiency`/`dailyLoadMultiplier`/`recoveryReduction` (modifiers), `trainingAvailability`, `recommendTraining`, `validateTrainingConfig`.

## Tests

`tests/training/training-engine.test.ts` (33): config validity, grant ranges, curve monotonicity, threshold/remainder/cap, multi-point, multi-skill, diminishing returns, level-up/multi-level/cap, fatigue bounds and bands, soft daily load, discipline modesty, determinism, performance hook, recovery incl. dead-end check, every availability reason, role/cooldown restrictions, recommendations for all roles.
