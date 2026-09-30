# 08 — Training System

## Philosophy
Training improves specific abilities through Skill XP. Generic player XP is a secondary reward; it cannot directly upgrade all stats.

## Initial activities
- Timing Drill → Timing + Footwork
- Power Hitting → Power + Strength
- Bowling Accuracy → Accuracy + Control
- Variation Lab → Variation + Control
- Conditioning → Stamina + Recovery + Fitness

Future activities can cover Defence, Placement, Reaction, Swing, Pace and Spin without schema changes.

## Skill progression
For a stat `s` from 1..99:

`skillXpToNextPoint(s) = round(45 + 1.6s + 0.055s²)`

On threshold crossing, increase the stat by one and retain overflow XP. Stat 100 is hard cap. This creates diminishing returns naturally.

Training grants typically 20–40 primary Skill XP and 5–15 secondary Skill XP. Coaches may later multiply grants within a clamp, e.g. 0.9–1.2x.

## Fatigue guardrail
Training is allowed at normal efficiency below 60 fatigue, reduced at 60–74, strongly reduced at 75+, and blocked only near exhaustion (e.g. 95+) for player protection. No real-time energy timer is required. Recovery happens after matches/rest activities and via Recovery/Stamina modifiers.
