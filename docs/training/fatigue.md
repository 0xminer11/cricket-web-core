# Fatigue

Fatigue is a temporary 0-100 state (Module 0). Training raises it; rest lowers it. It never reduces a permanent skill.

## What a drill adds

`fatigueAdded = max(1, round(fatigueGain × staminaFactor))`, with `staminaFactor = 1 - 0.20 × (stamina-1)/99` (1.00 at Stamina 1, 0.80 at 100: Module 0 says Stamina reduces training fatigue gain). The result is clamped to 100 by the engine and again by SQL (`LEAST/GREATEST` in `adjustFatigue`), so concurrent sessions compose and the value can never leave 0-100.

## What fatigue does to training (Module 0 guardrail)

| Fatigue  | Skill and Player XP | Drills                                      |
| -------- | ------------------- | ------------------------------------------- |
| 0 - 59   | 100%                | allowed                                     |
| 60 - 74  | 85%                 | allowed, "HIGH FATIGUE" warning             |
| 75 - 94  | 60%                 | allowed, recommendation switches to rest    |
| 95 - 100 | n/a                 | **blocked** (`FATIGUE_TOO_HIGH`), rest only |

Thresholds are `PLAYER_CONFIG.fatigue.softWarning` (60) and `hardPenaltyStart` (75) plus the 95 block from `docs/game-design/08-training-system.md`. The two reduced multipliers are the numbers Module 0 left to "reduced" and "strongly reduced" and are **INITIAL BALANCE**. Fitness is not used here.

## What the player sees

The Training Hub readiness card shows a fatigue bar with text ("62% · Tired"), the current effectiveness percentage, drills done today, and a message: "HIGH FATIGUE: training effectiveness will be reduced" or "You are too tired for drills. Rest to recover." Drill cards and the detail page state the reason when blocked, and Start is disabled.

## No dead end

A fully exhausted player always has the free **rest** action ([recovery.md](recovery.md)). A test rests from 100 until drills unlock again (a handful of rests), and E2E does the same through the UI.
