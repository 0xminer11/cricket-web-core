# Starter attributes and overall

## Principle

The client sends decisions; **the server derives every number** from game-core. Starting stats are **deterministic**: the same choices always give the same stats, so the wizard can show _exact_ previews (and they are tested to equal what creation stores). No randomness is used (no RNG seam is needed; `Math.random` is not involved), which also removes a source of unequal starts.

## Generation (`buildStarterPlayer`, `config/starter-player.config.ts`)

- **Batting and physical**: explicit per-role tables (`STARTER_ROLE_PROFILES`), shaped by the role's Module 0 `ROLE_WEIGHTS` emphasis.
- **Bowling**: one _bowling level_ per role and style; the eight bowling stats sit between a floor (20) and that level in proportion to the style's Module 0 `BOWLING_STYLE_WEIGHTS` (a spinner gets Spin, a quick gets Pace). No style = no bowling (all 20, bowling overall 0). Batting roles that pick a part-time style use level 28.
- **Personality**: baseline 50 per trait plus the archetype's deltas ([personality](personality.md)).
- **Level 1, 0 XP, form 50, fatigue 0**, career tier `academy`, reputation/fans/selector interest 0 (Module 0 defaults and database defaults).

## Balance

Every valid role + style combination is tuned to the same **Player Overall ≈ 40** (target `STARTER_TARGET_OVERALL`, tolerance ±2, inside the academy band 28–45). The solver that produced the tables equalises overall per style, so all-rounders trade specialisation for versatility instead of out-scoring everyone.

| Role                | Combinations | Player overall | Batting overall | Bowling overall (with a style) |
| ------------------- | -----------: | -------------: | --------------: | -----------------------------: |
| Opening Batter      |            9 |             39 |              38 |                          25–26 |
| Top-order Batter    |            9 |             40 |              40 |                          25–26 |
| Middle-order Batter |            9 |             40 |              37 |                          25–26 |
| Finisher            |            9 |             39 |              35 |                          25–26 |
| Wicketkeeper-Batter |            9 |             40 |              32 |                          25–26 |
| Batting All-Rounder |            8 |          40–41 |              38 |                          30–31 |
| Bowling All-Rounder |            8 |          39–40 |              38 |                          30–34 |
| Fast Bowler         |            2 |          39–40 |              30 |                             37 |
| Swing Bowler        |            4 |          39–40 |              30 |                          37–45 |
| Spin Bowler         |            4 |          39–40 |              30 |                          37–38 |

All numbers are **INITIAL BALANCE — SUBJECT TO PLAYTESTING** like the rest of Module 0. Retuning is a config change followed by `validateStarterConfig`, which fails the build/boot (outside production) if any combination leaves the tolerance.

## Overall (derived on read, never stored)

`config/overall.ts` implements the Module 0 chapter-15 formulas: batting (Timing 18 / Technique 16 / Shot selection 15 / Placement 14 / Footwork 12 / Defence 10 / Power 8 / Consistency 7), bowling (by style weights), physical (Stamina 22 / Fitness 20 / Reflex 17 / Agility 16 / Strength 14 / Recovery 11) and the role-weighted **Player Overall** from `ROLE_WEIGHTS`. The API computes them from stored attributes on every read, so a future formula change cannot leave stale values in the database.

## Validation at boot

`validateStarterConfig` (also part of `validateGameDefinitions`, so `pnpm build`, the API at boot outside production and tests all run it) checks: every role has a profile and valid stats; allowed styles exist and bowling roles define a level per style; the loadout covers every required slot with real items that fit the slot and the starting level; archetypes net to zero and stay in range; appearance ids are well-formed with at least one starter option per category; the starter team exists in the starter tier; the wallet is valid; and every combination builds within the overall tolerance. Broken configuration fails loudly; nothing is silently clamped.
