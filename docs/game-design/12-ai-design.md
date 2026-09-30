# 12 — AI Design

## Shared player model
AI players use the same batting, bowling, physical and role definitions as human players. There is no hidden “AI power stat.”

## Tier generation ranges
- Academy: roughly 28–48 OVR
- Club: 38–58
- District: 46–66
- Domestic: 54–76
- Franchise: 64–86
- International: 74–96

Ranges overlap so prospects and declining veterans can exist outside the tier median.

## Difficulty modes
Rookie / Amateur / Pro / Elite alter:
- decision noise
- execution variance
- risk discipline
- tactical memory/window

They do **not** change physics, give impossible reaction speed, or add hidden raw-stat multipliers. Career strength should primarily come from player/team stats and tier.

## Batting decisions
AI evaluates required rate, wickets remaining, delivery read confidence, shot suitability, batter Risk Appetite, current form and boundary need. It samples from valid shots rather than selecting a guaranteed best response.

## Bowling decisions
AI chooses line/length/variation based on batter weaknesses, recent outcomes, pitch and bowler strengths, then passes the choice through the same accuracy/control execution model as humans.
