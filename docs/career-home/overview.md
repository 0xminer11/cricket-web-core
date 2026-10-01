# Career Home (Module 6)

The Career Home is the screen a player sees after creating a cricketer and every time they return: **who am I, how good am I, what is next, what should I do, how am I progressing, what have I earned, what am I working toward.** It is a hub that sends the player to Training, the Dressing Room, the Player profile and (later) the Match module. It does **not** simulate matches, sell items or schedule a season; training itself lives in Module 7 (`/training`).

```text
Login / guest ─▶ has cricketer? ─ no ─▶ /create-player
                       │ yes
                       ▼
                    /career  ── GET /api/v1/career/home (one request renders the whole screen)
   ┌──────────────┬────┴─────┬──────────────┬─────────────────┐
   │ /training    │/dressing-│ /player      │ /match/preparation │  + /career/{fixtures,history,
   │ (drill list) │ room (M5)│ (profile M5) │ (placeholder)      │    progression,objectives,events}
```

## What the screen shows (in priority order)

1. Player header: portrait, name, role, OVR, level, XP bar, team and level of the career.
2. **Next match**: teams, competition, format, venue, pitch, date (exact + relative), readiness, **PREPARE MATCH**.
3. Primary actions: Training (recommended drill), Dressing Room (equipped bat/kit), Player profile.
4. Currencies, form, fatigue, fans, career path, reputation, selector interest.
5. Career event (only when one is pending), objectives, role-aware career stats, recent matches (only with real history), upcoming fixtures, contract (only when active), personality.
6. Guest banner (guests only), first-visit intro (once).

Every optional block disappears when there is nothing real to show; nothing is invented.

## Principles

- **Server authoritative, client presentational.** Level, XP, overall, form, fatigue, currencies, fans, reputation, selector interest, tier, team, schedule, objectives and events all come from the server. The web feature contains no game-core import, no storage, no write calls except the intro flag and funnel telemetry (enforced by `tests/career/career-logic.test.ts`).
- **One source of truth.** Overall uses `playerOverall` (same as `/player`); XP uses `xpToNextLevel`; thresholds come from Module 0 or are named presentation config in `packages/game-core/src/career-home.ts` ([player-summary.md](player-summary.md)).
- **Light.** One JSON response (≈5.9 KB, 1.7 KB gzip), no Three.js, no GLB, no match runtime ([performance.md](performance.md)).
- **Honest.** Missing data is shown as an empty state or a dash, never a fake number.

## Where things live

| Area                                                              | Location                                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Presentation rules, starter fixture plan, training recommendation | `packages/game-core/src/career-home.ts`                                                                    |
| Contracts (zod DTOs, error codes, analytics events)               | `packages/shared-types/src/career.ts`                                                                      |
| Read model + onboarding table                                     | `packages/database/src/repositories/career-home.repository.ts`, migration `0005_career_onboarding.sql`     |
| API                                                               | `apps/api/src/modules/career/`                                                                             |
| Web feature                                                       | `apps/web/src/features/career/`, routes under `apps/web/src/app/career`, `/training`, `/match/preparation` |
| Shared UI primitives                                              | `packages/ui` (`ProgressBar`, `StatCard`, `SectionHeader`, `EmptyState`)                                   |

## Conflicts with the brief and how they were resolved

| Brief example                       | Module 0 reality                                                          | Resolution                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Tiers "Local, Club, District…"      | tiers are `academy, club, district, domestic, franchise, international`   | real tiers; friendly names in `TIER_PRESENTATION`                                                          |
| "Mysore Strikers" etc.              | five fictional teams (one per tier)                                       | real teams; opponents are the other teams ordered by rating closeness                                      |
| Form labels with thresholds         | form has a range (0-100, neutral 50) but no labels                        | five equal presentation bands, documented as non-balance                                                   |
| Fitness % and fatigue %             | only fatigue exists (soft warning 60, penalty from 75)                    | fatigue + readiness derived from those thresholds                                                          |
| Daily objectives                    | no objective system; achievements exist                                   | objectives are the Module 0 achievements with real persisted progress (see [objectives.md](objectives.md)) |
| Venue / pitch / weather on fixtures | fixtures have none                                                        | venue and pitch come from per-ground config; weather omitted                                               |
| Fixture status "ready"              | fixture statuses: scheduled, in_progress, completed, cancelled, postponed | those statuses; readiness is a separate card                                                               |
| Feature flags                       | `career.enabled` was `false`                                              | set to `true`; added `matches.enabled` (false); `training.enabled` was turned on by Module 7               |

Related: [architecture.md](architecture.md), [testing.md](testing.md), [security.md](security.md).
