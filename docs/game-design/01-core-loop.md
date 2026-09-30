# 01 — Core Loop

## Primary loop
Login → Create Cricketer → Career Dashboard → Select Activity → Train / Equip / Shop → Prepare Match → Play Match → Match Result → Rewards → Player XP + Skill XP → Form/Fatigue/Fans/Reputation update → Career events/contracts/selection → Next decision.

## Resource loops
| Loop | Inputs | Outputs | Main sinks / constraints |
|---|---|---|---|
| Match | time, current form, fatigue | coins, player XP, skill XP, fans, reputation, stats | fatigue, opportunity cost |
| Training | coins, fatigue capacity | targeted skill XP, player XP | coins, fatigue |
| Equipment | coins / premium cosmetic currency | small stat modifiers or cosmetics | purchase + deterministic upgrades |
| Career | performance, reputation, selector interest | stronger competition, contracts, fans | difficulty rises |
| Personality | event choices, outcomes | confidence/professionalism/leadership changes | trade-offs; no universally best profile |
| Sponsorship | fans, professionalism, tier | coins, items, cosmetics, objectives | objective commitment; no power paywall |
| Daily/weekly | optional play goals | modest coins/XP/cosmetics | none required for career |
| Achievements | milestones | one-time rewards | none |
| PvP future | eligible squad/player + matchmaking | rank/season rewards | server validation; no MVP dependency |

## Engagement design
A typical short session should support one of three intents: improve a specific skill, improve equipment/customization, or play a 2/5-over match. Progress is visible after each session without forcing energy-gate waiting.
