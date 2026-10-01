# Recommendations

Simple, deterministic and explainable. No "AI" wording: the explanation is a sentence built from the numbers that decided it.

```text
priority(drill) = Σ over the drill's skills of
     (skill's share of the drill's XP) × (Module 0 role weight of the skill) × (100 − value)/99
     × 1.15 if the skill is within 30% of its next point
```

- Role importance is `ROLE_WEIGHTS[role][skill]` (Module 0). Skills a role does not list get a small floor (0.01) so non-role drills can still win when nothing else is useful.
- Deficit is how far the skill is from 100; closeness to the next point adds the 15% "finish what you started" boost (recent progress).
- Only drills the player can do **right now** are considered (level, style, coins, fatigue, maxed).
- **Readiness**: from fatigue 75 (Module 0 "strongly reduced"), or when nothing else is available/affordable, the recommendation is **rest** with an explanation ("Your fatigue is high, so drills would be much less effective right now. Rest first."). With zero fatigue and nothing available the answer is `null`.
- Ties are broken by drill id, so a player always gets the same answer for the same state.
- The response includes up to 3 alternatives.

Examples (tested): a batter with Timing 20 gets Timing Drill; a right-arm fast bowler with Pace 15 gets Pace Training; a leg spinner with Spin 15 gets Spin Training; the recommendation never names a drill the player cannot do (a fast bowler is never sent to Spin).

## Where it is shown

The Training Hub (recommended card + "Recommended" tag on the drill), Career Home's Training card (same function, same answer), and drill cards tagged **For your role** when the drill's primary skill has role weight of at least 10%. Role never hides a drill.

## Extending

Future inputs fit the same shape without changing callers: selector goals ("Timing > 60"), contract expectations (fitness, role skills) and match feedback can add terms to the priority or extra weight maps. Keep each added term explainable.
