# Balancing

> INITIAL BALANCE - SUBJECT TO PLAYTESTING. Every number below comes from `pnpm simulate:training` (100 simulated players per scenario, seed 1, the real pure engine). It is a model, not telemetry: match income does not exist yet, so an income per day stands in for it.

## Targets used

Module 0: primary Skill XP 20-40 per drill, secondary 5-15; basic training 60-90 coins; "sessions to +1 skill" is a tracked metric; the level curve and skill curve are fixed. Module 0 gives no numeric target for sessions per point or levels per hour, so none was tuned to hit a made-up number. The simulation checks that nothing is broken, not that pacing is final.

## Progression (rookie profiles, a sensible player: follows the recommendation, rests from fatigue 75)

| Profile, policy                      | Sessions            | Skill points             | Sessions per point     | Player level  | Coins spent                  |
| ------------------------------------ | ------------------- | ------------------------ | ---------------------- | ------------- | ---------------------------- |
| Top-order batter, 3 drills/day       | 10 / 50 / 100 / 500 | 1.0 / 7.0 / 15.4 / 77.7  | 10.0 / 7.1 / 6.5 / 6.4 | 2 / 3 / 5 / 9 | 600 / 3,000 / 6,077 / 32,137 |
| Fast bowler, 3 drills/day            | 10 / 50 / 100 / 500 | 1.0 / 8.0 / 15.5 / 78.3  | 10.0 / 6.3 / 6.4 / 6.4 | 2 / 3 / 5 / 9 | 700 / 3,769 / 7,670 / 38,802 |
| Spinner (leg spin), 3 drills/day     | 10 / 50 / 100 / 500 | 1.0 / 9.0 / 17.9 / 80.4  | 10.0 / 5.6 / 5.6 / 6.2 | 2 / 3 / 5 / 9 | 745 / 3,729 / 7,369 / 37,106 |
| All-rounder (off spin), 3 drills/day | 10 / 50 / 100 / 500 | 2.0 / 11.2 / 20.9 / 91.5 | 5.0 / 4.5 / 4.8 / 5.5  | 2 / 3 / 5 / 9 | 700 / 3,500 / 6,894 / 35,112 |

Findings:

1. **Pacing is steady, not linear**: about 6-7 sessions per point early, creeping up as skills rise (the quadratic Module 0 curve), with about 38 Skill XP per session at full effectiveness. 100 sessions is roughly +15 skill points spread over the role-relevant skills, about +1 Overall.
2. **Level**: training alone reaches level 9 after 500 sessions (about 25 Player XP per drill). That is intended: Module 0 makes level a broad indicator and expects most XP from matches.
3. **All-rounders** progress about 20% faster _in skill points_ because more skills sit low; this is the natural effect of a wider deficit, and it is not a role multiplier.
4. **Specialisation works**: recommendations send each profile to its role's skills (bowlers to Pace/Spin/Accuracy, batters to Timing/Footwork), never to a style-restricted drill.
5. **Fatigue behaves**: average fatigue hovers around 65-75 for players who rest only from 75 and drops to about 10 after rests. Across all 1,200 simulated players the **highest fatigue ever seen was 87** and there were **zero refused attempts**: the 95 block is never reached when the recommendation is followed. Blocking happens only to a player who ignores the warnings.

## Economy

A 3-drills/day player spends about 65 coins per drill, so about 195 coins/day, roughly twice the stand-in income of 90/day: in the model such a player trains most days, not every day. 500 sessions cost 32-39k coins, comparable to several rare or epic items from the equipment bands (Module 0: rare 1,400-3,000, epic 3,000-6,500). Coins, not a timer, are the pacing resource, which matches the Module 0 economy notes ("avoid forcing repetitive low-value matches to fund basic progression" - training must not outprice a match).

**Open question for the match module**: at 60-90 coins a drill and 120-240 for a match, one match funds 2-3 drills. If playtests show training outpacing match income badly, lower costs or raise participation rewards; do not add timers.

## Infinite-farming review (required by the brief)

Can a player train forever with instant recovery and no meaningful constraint? **Not without paying coins, and not efficiently.** The constraints are: coin cost per drill, the fatigue guardrail (60% XP at 75+, blocked at 95), the soft daily load (down to 10%), and rest recovering less each time.

Grinder scenario (unlimited coins, 30 drills a day, rest whenever recommended):

|                                        | Casual (3/day) | Grinder (30/day) |
| -------------------------------------- | -------------- | ---------------- |
| Skill XP per session over 500 sessions | 39.4           | **12.3**         |
| Skill points after 500 sessions        | 77.7           | 25.8             |
| Days to finish                         | 330            | 17               |
| Coins                                  | 32,137         | 31,194           |

One-day probe (level-20 batter, unlimited coins, recovery allowed):

| Drills attempted | Rests used | Skill XP earned that day | XP per drill |
| ---------------- | ---------- | ------------------------ | ------------ |
| 3                | 0          | 123                      | 41           |
| 5                | 0          | 205                      | 41           |
| 10               | 0          | 302                      | 30           |
| 30               | 15         | 396                      | 13           |
| 100              | 113        | 676                      | 6.8          |
| 500              | 892        | 2,552                    | 5.1          |

The safeguard works as a soft cap: the marginal value of a drill after the 12th is about 10% of the first. Raw speed per _day_ for a grinder is still high **if coins are unlimited**, which is exactly why the cost per drill must stay meaningful relative to income. The safeguard does not remove that dependency; it limits the damage if coin supply is generous. No change to the numbers was made because of this run; the review is a tripwire for later balancing (see "Revisit when").

## No-deadlock check

Every grinder run ends with players able to act (each rest recovers at least 3 fatigue; the floor multiplier is 0.2). The engine test rests from 100 back under the 95 block in a few rests.

## Revisit when

- match rewards exist (re-run with real income; tune costs first),
- level progression from matches is known (does training XP dominate?),
- a second faucet appears (events, achievements), because the daily-load floor assumes coins are scarce.
