# Player summary, form, fitness and presentation rules

All of these are in `packages/game-core/src/career-home.ts` so the API and any future client share one definition.

| Concept       | Rule                                                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall       | `playerOverall(attributes, role)` (Module 0), identical to `/player`. No "+n this season": no historical overall is stored.                                                               |
| Level / XP    | `xpProgress`, `xpToNextLevel`, `PLAYER_CONFIG.levelCap`.                                                                                                                                  |
| Form band     | `FORM_BANDS`: very poor 0-19, poor 20-39, average 40-59, good 60-79, excellent 80-100. Presentation only (Module 0 has the range and neutral 50 but no labels). Validated for contiguity. |
| Form trend    | `ratingTrend` over recent performance ratings; null without history.                                                                                                                      |
| Fatigue state | `fatigueState`: ready < 60, tired 60-74, exhausted ≥ 75.                                                                                                                                  |
| Tier names    | `TIER_PRESENTATION`; persistence always uses the stable id.                                                                                                                               |
| Stat focus    | `statFocus(role)`: batting, bowling or all-round. Wicketkeeper-batters show batting (no keeping stats exist in Module 0).                                                                 |

## Role-aware statistics

Batter: runs, average, strike rate, 50s/100s. Bowler: wickets, economy, average, best figures. All-rounder: both. Counters are zero for a new career (shown as 0, not an error); ratios with no denominator are "—" (no dismissals, no balls). Role also drives the training recommendation via Module 0 role weights.

## Portrait

A 2D SVG built from the saved skin/hair/beard colours the API sends (`portrait`). No GLB, Three.js or WebGL on the hub; clicking it opens `/player`.

## Personality

Archetype name plus confidence and discipline. Read-only: personality changes through gameplay and career events, never from the hub.

## Money

`currencies` are read-only summaries. There is no setter anywhere in the web feature (test-enforced). Large values compact on screen with the exact value in the tooltip.
