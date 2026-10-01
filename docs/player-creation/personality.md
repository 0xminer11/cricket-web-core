# Personality

Module 0 defines six stored traits (Confidence, Discipline, Leadership, Professionalism, Risk Appetite, Team Mindset, 1–100). Module 4 adds **starting archetypes**: small, zero-sum tendencies on a baseline of 50, so no archetype is a free bonus and none is "best".

| Archetype (`personality.*`) | Leans toward                                     | Gives up a little                                   |
| --------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| `balanced`                  | even-handed                                      | —                                                   |
| `calm`                      | Confidence +6, Discipline +4, Professionalism +2 | Risk appetite −8, Team mindset −4                   |
| `aggressive`                | Risk appetite +9, Confidence +4                  | Discipline −6, Professionalism −3, Team mindset −4  |
| `disciplined`               | Discipline +8, Professionalism +5                | Confidence −5, Risk appetite −4, Leadership −4      |
| `entertainer`               | Confidence +6, Risk appetite +5, Leadership +3   | Discipline −7, Professionalism −7                   |
| `team_leader`               | Leadership +8, Team mindset +6                   | Risk appetite −6, Confidence −4, Professionalism −4 |

- The **resulting trait values** are stored in `player_personality` (the live state). The chosen archetype id is stored once in `player_profiles.starter_personality_id` for history/analytics only.
- Traits are not permanent: career events, training and match situations will modify them (Module 0 chapter 07: ±1–4 steps, clamped 1–100).
- The sum of traits is 300 for every archetype (tested); deltas never push a trait outside 35–65.
- The UI shows "Leans toward / Gives up a little" copy from config and never uses words such as _best_, _recommended_ or _perfect_ (tested).
