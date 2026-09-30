# 02 — Player Attributes

## Scale
All cricket/physical/personality stats are integers 1–100. Suggested interpretation: Rookie 20–39, Amateur 35–54, Domestic 50–69, Elite 65–84, World-class 80–100. Overlap is intentional.

## Batting
- **Timing** — expands good/perfect input windows and reduces mistimes.
- **Power** — raises safe ball-exit-velocity ceiling; does not rescue poor contact.
- **Placement** — directional accuracy and ability to target gaps.
- **Defence** — control and wicket-avoidance when using defensive shots.
- **Footwork** — penalty reduction for suboptimal line/length and front/back-foot transitions.
- **Shot Selection** — improves outcome when chosen shot matches delivery; AI decision quality for CPU batters.
- **Technique** — baseline contact stability, especially conventional shots.
- **Consistency** — reduces execution variance across deliveries.

`Reaction` is not duplicated under batting; **Physical.Reflex** owns reaction speed. `Aggression` is not a batting skill; **Personality.RiskAppetite** / AI tactics own risk preference.

## Bowling
- **Pace** — velocity potential for pace styles only.
- **Accuracy** — target-point error radius.
- **Swing** — airborne movement potential for eligible pace/medium styles.
- **Seam** — post-pitch seam movement for eligible styles.
- **Spin** — turn/revolution potential for spin styles.
- **Control** — reduces line/length and variation execution penalties.
- **Variation** — effectiveness and disguise of non-stock deliveries.
- **Consistency** — reduces delivery-to-delivery execution variance.

Style-specific weights prevent irrelevant stats from inflating output. A fast bowler with Spin 90 receives no leg-spin movement unless the bowling style and delivery definition permit it.

## Physical
- **Strength** — contributes to batting power ceiling and pace endurance; not direct shot accuracy.
- **Stamina** — slows fatigue accumulation during matches and long spells.
- **Fitness** — general effective-performance retention under workload.
- **Reflex** — reaction window assistance and future wicketkeeping/fielding.
- **Agility** — footwork support and future running/fielding.
- **Recovery** — fatigue recovery between activities/matches and future injury recovery.

`Speed` is deferred until running/fielding needs it; current MVP avoids duplicating Agility.

## Effective skill model
Use additive deltas followed by bounded multipliers rather than uncontrolled multiplication:

`contextualBase = clamp(baseSkill + equipmentFlatBonus, 1, 100)`

`effective = clamp(contextualBase × formMod × fitnessMod × contextMod, 1, 100)`

Recommended clamps: Form 0.94–1.06, Fitness 0.92–1.02, Context 0.94–1.06, total equipment contribution capped near 12%.
