# Player attributes in batting

Module 10 invents no new attribute and adds no formula to Module 8. Attributes act in three places.

## 1. Interpreting the player's timing (server, before the engine)

`packages/match-engine/src/batting/human-input.ts`:

```text
forgiveness = clamp(1 − timing/100 × 0.30 − reflex/100 × 0.12 × clamp(speed/38, 0, 1.3), 0.4, 1)
engine timingInput = clamp(clientTiming × assistScale × forgiveness, −1, 1)
```

Better **Timing** forgives more of a timing error; better **Reaction (reflex)** helps most against pace. It is
deliberately gentle: skill makes a good input more reliable, it does not make timing automatic. The batter's
_effective_ attributes (form, fatigue, equipment already applied) are used.

## 2. Inside Module 8's contact formula (unchanged)

| Attribute                      | Where it acts                                           |
| ------------------------------ | ------------------------------------------------------- |
| Timing, Technique, Consistency | batting skill term of the contact score                 |
| Reaction                       | timing term (more against pace)                         |
| Footwork                       | recovers part of a shot/ball mismatch (`fit`)           |
| Shot selection                 | scales the suitability term                             |
| Placement                      | narrows the random spread of the shot's direction       |
| Power                          | exit speed (`exitSpeed`), hence distance and boundaries |
| Defence                        | lowers the wicket chance of **defensive** shots         |
| Form, fatigue, confidence      | small additive terms                                    |

## 3. Presentation only

**Footwork** also stretches how far the Cricketer's body may step toward the line of the ball (the root stride budget
is scaled by `0.7 + 0.6 × footwork`). This changes only how contact is _drawn_; it never changes the result.

## What skill should feel like

- Beginner (Batting ~30): appropriate shot + reasonable timing gives frequent, meaningful contact; goodOrBetter is rare, runs/ball low.
- Elite (~90): far more Perfect/Good contact, better placement, more boundaries and fewer wickets; **not** automatic sixes.

The numbers are in the [simulation report](testing.md#simulation-report).
