# MODULE 0 ARCHITECTURE SUMMARY

## Product
**The Cricketer** is a web-first cricket career RPG. The player creates one cricketer, develops cricket ability and personality, equips gear, plays short matches, earns progression resources, climbs fictional career tiers and eventually becomes eligible for franchise/international play and future PvP.

## Architectural boundaries
1. **Game Design Data** — immutable/versioned definitions: shots, deliveries, pitches, items, teams, training, events, formats.
2. **Player Save Data** — owned mutable state: XP, individual skill XP, inventory instances, currencies, form, fatigue, career tier, fans.
3. **Match Runtime Data** — deterministic match state: innings, overs, balls, striker, bowler, target, RNG seed/version.
4. **Backend Configuration** — authority rules, anti-cheat thresholds, persistence and service settings.
5. **LiveOps Configuration** — seasonal objectives, reward overrides, featured cosmetics, event schedules; never changes core rules mid-match.

## Key decisions
- Stats are bounded integers **1–100**; no infinite scaling.
- Player level cap is **50** for initial release. Level represents career breadth; individual skills use separate Skill XP.
- No generic all-stat Overall. Batting, bowling and physical sub-ratings are calculated independently; Player Overall is role-weighted.
- Equipment contributes a maximum of roughly **12%** to effective skill and cosmetics add zero competitive stats.
- Match formats, shots, deliveries and pitches are definitions, not hardcoded branches.
- All valuable outcomes are server-authoritative.
- Headless simulation and graphical gameplay must consume the same game-core definitions.
- Multiplayer is future scope and must reuse MatchEngine contracts rather than create a second rules engine.

## Initial balance status
All numeric values in Module 0 are **INITIAL BALANCE — SUBJECT TO PLAYTESTING**.
