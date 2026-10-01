# Career Home data (`GET /api/v1/career/home`)

Requires a signed-in user who owns a cricketer. The player is resolved from the session; there is **no** player or career id in the path, query or body. Response is `{ success, data: { home } }`, `Cache-Control: no-store`, validated by `careerHomeSchema` (`packages/shared-types/src/career.ts`).

| Field                            | Contents                                                                                                               | Source                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `player`                         | name, role, country, jersey, batting hand, `overall`, `portrait` (skin/hair colours, bald, beard)                      | profile + attributes + appearance; `playerOverall`                                |
| `progression`                    | level, `levelCap`, `isMaxLevel`, `xp`, `xpToNext` (null at cap), form + label + band + `formTrend`, fatigue, readiness | `player_state`; `xpToNextLevel`, `formBand`, `fatigueState`                       |
| `currencies`                     | `coins`, `gems` with names and balances                                                                                | `currency_balances` (never the ledger)                                            |
| `career`                         | tier + friendly name, team, season, reputation (max 1000), fans, selector interest (max 100), `tiers[]`, `nextTier`    | `careers`, `CAREER_TIERS`                                                         |
| `nextMatch` / `upcomingFixtures` | fixture summaries (up to 4 upcoming)                                                                                   | `fixtures` joined with teams ([fixture-presentation.md](fixture-presentation.md)) |
| `readiness`                      | `ready / caution / blocked` + issues                                                                                   | fatigue thresholds and required gear                                              |
| `stats`                          | role-aware career counters and derived ratios                                                                          | `player_stats` (career scope), `stats-derivations`                                |
| `recentMatches`                  | up to 3 completed matches with result and score line                                                                   | `match_participants`/`matches` (no balls)                                         |
| `objectives`, `achievements`     | up to 3 in-progress goals; completed/total                                                                             | Module 0 achievements + `player_achievements`                                     |
| `careerEvent`                    | one pending event (title, description) or null                                                                         | `career_event_instances` + `CAREER_EVENTS`                                        |
| `contract`                       | active contract summary or null                                                                                        | `contracts`                                                                       |
| `equipped`                       | bat, kit, count, missing required slots                                                                                | `equipped_items`                                                                  |
| `training`                       | recommended action (drill or rest) with explanation, skill, fatigue it adds, cost                                      | `recommendTraining` (game-core training module, shared with `/training`)          |
| `lastTraining`                   | last completed session and what improved                                                                               | `training_sessions` result snapshot                                               |
| `personality`                    | archetype name, confidence, discipline                                                                                 | `player_personality`                                                              |
| `onboarding`                     | `introCompleted`                                                                                                       | `player_onboarding`                                                               |
| `features`                       | `training`, `matches`, `shop` flags                                                                                    | `@the-cricketer/config`                                                           |
| `degraded`                       | optional sections that failed                                                                                          | service                                                                           |

## Not in the response (on purpose)

Email, auth identities, sessions, password data, the wallet ledger, inventory lists, ball-by-ball data, full achievement and event history, asset manifests, internal row ids (fixture/event/match ids appear only where a link needs them and are scoped to the caller's own career), RNG seeds, event weights or effects.

## Derived values

- **Form label**: five equal bands over 0-100 (`FORM_BANDS`); neutral 50 is "Average". Presentation only.
- **Form trend**: from the last performance ratings (newest vs the average of earlier ones, ±0.5). `null` with fewer than 3 ratings; no history, no arrow.
- **Readiness**: fatigue ≥ 60 = tired, ≥ 75 = exhausted (Module 0 `softWarning` / `hardPenaltyStart`). Fatigue is advice, never a block. Missing **bat** is blocking (`MATCH_REQUIRED_SLOTS`), normally impossible after Modules 4/5.
- **Training recommendation**: since Module 7 this is the training module's recommender ([docs/training/recommendations.md](../training/recommendations.md)): role weight × skill deficit, boosted near a skill point, only for drills available now, rest when very tired. Same function as `/training`, so both screens always agree.
- **Stats ratios** use the shared derivations (`battingAverage`, `strikeRate`, `economyRate`, `bowlingAverage`); undefined ratios are `null` and render as "—".

## Other endpoints (all `requirePlayer`, no ids for self data)

| Route                                          | Notes                                                   |
| ---------------------------------------------- | ------------------------------------------------------- |
| `GET /career/fixtures?status=upcoming          | completed&limit&cursor`                                 | keyset paginated, limit ≤ 50, unknown params rejected (400) |
| `GET /career/history?limit&cursor`             | newest first, human-readable titles                     |
| `GET /career/progression`                      | tier path, reputation, selector interest, guidance text |
| `GET /career/objectives`                       | active / completed                                      |
| `GET /career/events`, `GET /career/events/:id` | own events only; choices as labels                      |
| `POST /career/onboarding/career_home_intro`    | idempotent UX flag                                      |
| `POST /career/telemetry`                       | funnel events ([security.md](security.md))              |

Errors: `CRICKETER_NOT_FOUND` (404, from the guard), `CAREER_NOT_INITIALIZED` (409), `CAREER_EVENT_NOT_FOUND` (404), `ONBOARDING_STEP_UNKNOWN` (400), `CAREER_DATA_UNAVAILABLE` (503). Messages are player-safe; details are logged with the request id.
