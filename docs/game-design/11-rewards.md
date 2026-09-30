# 11 — Rewards, Form, Fans and Performance Rating

## Match performance rating
Use **0.0–10.0** because it is player-readable and granular enough for short cricket matches.

### Batter conceptual rating
Combine contribution relative to match/target context, runs, risk-adjusted strike rate, wickets preserved and result contribution. Strike rate weight falls when chase context rewards survival.

### Bowler conceptual rating
Combine wickets, economy relative to format/par score, dot-ball rate and high-leverage wickets. Short-format wickets receive context weighting rather than a flat count only.

All-rounder rating blends batting/bowling by actual involvement, then clamps 0–10.

## Reward formula
`base = participation + resultBonus + performanceComponent`

`coins = round(base × careerTierMultiplier × formatMultiplier × antiFarmMultiplier)`

Loss result multiplier is approximately .75 rather than zero. Performance Coins may use `rating × 18`, capped by format config. XP uses similar bounded logic.

## Form
Store 0–100. Compute recent form with an exponentially weighted mean of last 8 performance ratings, newest weighted highest, then smooth:

`targetForm = clamp(EWMA_rating / 10 × 100, 0, 100)`
`newForm = .75 × oldForm + .25 × targetForm`

Bands: Excellent 80–100, Good 65–79, Average 45–64, Poor 30–44, Very Poor 0–29. Effective performance impact is capped at roughly ±6%.

## Fans
Suggested gain:
`fansGain = round(baseMilestoneFans × tierFanMultiplier × importance × performanceFactor × personalityPublicFactor)`

Routine matches should yield tens/hundreds early, major milestones much more. Poor form may lose fans only after sustained underperformance, with a per-match loss cap around 1.5%.
