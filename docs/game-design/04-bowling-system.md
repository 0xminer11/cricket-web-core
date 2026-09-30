# 04 — Bowling System

## Delivery dimensions
**Length:** Yorker, Full, Good, Short, Bouncer.  
**Line:** Wide Off, Outside Off, Off Stump, Middle, Leg, Wide Leg.

## Initial delivery definitions
Pace/medium: Stock, Outswing, Inswing, Cutter, Slower, Bouncer, Yorker, Medium Seam. Spin: Stock Off-break, Stock Leg-break, Arm Ball, Googly, Top Spinner, Flipper.

Each delivery specifies eligible styles, default length, difficulty, control penalty, movement profile/strength, stamina cost and ideal attribute.

## Execution concept
`targetError = baseError × accuracyModifier × controlModifier × variationDifficulty × fatigueModifier × consistencyVariance`

Movement strength is then calculated from the delivery's eligible movement profile, the relevant bowling stat, pitch modifier and bounded randomness. Irrelevant style/stat combinations contribute zero.

## Archetype behavior
- Fast: Pace + Accuracy primary; Seam/Swing secondary depending subtype.
- Medium: Accuracy/Control + Swing/Seam; lower dependence on Pace.
- Finger spin: Spin + Control + Accuracy.
- Wrist spin: Spin + Variation; higher difficulty and execution variance.

No AI difficulty mode may give impossible reaction or hidden stat boosts; it may only reduce decision/execution mistakes within the same stat model.
