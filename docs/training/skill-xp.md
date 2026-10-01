# Skill XP

## Where Skill XP comes from

A drill's `grants` list. The first entry is the primary skill, the rest secondary (typically 20-40 primary, 5-15 secondary). `scale(base, multiplier) = max(1, round(base × multiplier))` per skill, so a skill with a base grant always gets at least 1 XP unless it is maxed.

## What scales it

```text
skillXp = base × fatigueEfficiency × dailyLoad × discipline × performance      (clamped 0.05 .. 1.10 overall)
```

| Factor             | Range                                                               | Source                                                  |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------- |
| Fatigue efficiency | 1.00 below 60, 0.85 at 60-74, 0.60 at 75-94                         | Module 0 guardrail ([fatigue.md](fatigue.md))           |
| Daily load         | 1.0 for the first 5 drills of the UTC day, then 0.6, 0.3, floor 0.1 | safeguard ([economy.md](economy.md))                    |
| Discipline         | 0.95 - 1.05 across Discipline 1-100                                 | Module 0: Discipline = training efficiency; kept modest |
| Performance        | 1.0 (none); a future minigame score maps to 0.8 - 1.2               | hook only                                               |

Deliberately **not** used: role multipliers (they would make a later role change painful; role only guides recommendations), Fitness (Module 0 uses it for performance retention, and stacking would be excessive), Form and Confidence (training does not change them).

The engine returns the multiplier it used and every individual modifier, so a debugger or the UI can explain a number.

## Preview equals result

The hub and drill pages call the same pure function the server uses, with the same snapshot. With no randomness the preview is exactly the XP you get, unless something changed in between (another session, another device), in which case the server's answer is authoritative and is what the result screen shows. Tested: preview `expectedXp` equals the applied `xpGained`.

## Display

`SkillProgress` shows value, a progress bar and the text "142 / 277 XP" (never colour alone, and never NaN: the bar clamps zero targets, negatives and overflow). The result bars sweep from the old to the new position unless `prefers-reduced-motion` is set.

## Not awarded

Maxed skills; skills of a drill the player is refused; anything for a failed or rolled-back request (the transaction removes it).
