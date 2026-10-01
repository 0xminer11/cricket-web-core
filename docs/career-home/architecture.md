# Architecture

## Request flow

```text
browser ── GET /api/v1/career/home (cookie) ──▶ requirePlayer (session → user → player)
        ◀── CareerHomeDto (validated with zod)       │
                                                     ▼
                                CareerController ─▶ CareerHomeService
                                                     │ stage 1: dashboard (4 queries, parallel) + upcoming fixtures
                                                     │ stage 2: attributes, appearance, stats, ratings, matches,
                                                     │          events, achievements, contract, onboarding (parallel)
                                                     ▼
                                            CareerHomeRepository / existing repositories
```

- **Controller**: authentication context, input validation, envelope. No rules, no SQL.
- **CareerHomeService** (`career-home.service.ts`): builds the DTO and validates it against `careerHomeSchema` before returning (a drifting DTO becomes `CAREER_DATA_UNAVAILABLE`, never a malformed page).
- **CareerService** (`career.service.ts`): fixtures, history, progression, objectives, events and onboarding for the detail pages.
- **CareerHomeRepository**: set-based read model (fixtures joined with both teams and the linked match in one query).
- **FixtureBootstrapService**: the only writer on the read path ([fixture-presentation.md](fixture-presentation.md)).
- **Pure helpers**: `summaries.ts`, `fixture-presenter.ts`, and `game-core/career-home.ts` (unit-tested without a database).

## Degradation

Optional sections (career event, objectives, recent matches) are wrapped so a failure omits the section and lists it in `degraded`; the web shows "Some sections couldn't load" and renders the rest. Core data (player, career, fixtures) failing is a real error (`CAREER_DATA_UNAVAILABLE`, 503) with a Try Again button; it never signs the player out.

## Web

`features/career/` follows the project pattern (api client, hooks, components, utils):

- `api/career-client.ts`: the only caller of `/api/v1/career/*`; every response is parsed with the shared zod schema.
- `hooks/use-career-data.ts`: `loading | ready | error | missing`, retry, refetch when the tab becomes visible, 401 → session ended, `CRICKETER_NOT_FOUND` → creation. No copy of server state is kept anywhere else, so screens cannot disagree.
- `components/primitives.tsx`: `RequirePlayer` guard, skeletons, error panel, tracked links, sub-navigation, 2D portrait.
- `components/career-home.tsx`, `home-cards.tsx`, `pages.tsx`, `app-nav.tsx` (training lives in `features/training`, Module 7).

### Invalidation

There is no client cache to invalidate: Career Home reloads when it mounts (so returning from the Dressing Room, Training or a future match shows fresh data) and when the tab regains focus. Backend events that should refresh a dashboard in future modules: `player.created`, `equipment.changed`, `training.completed`, `match.completed`, `career.promoted`, `currency.changed`, `objective.updated`, `career_event.resolved`. A short-lived server cache can be added later behind the same service without changing the contract.

## Navigation

One information architecture, two presentations (`app-nav.tsx`): Home `/career`, Play `/match/preparation`, Train `/training`, Player `/player` (+ Dressing Room), Career `/career/*`. Top bar from 48rem, labelled bottom bar below it. Shown only to a signed-in player with a cricketer.

## Future module integration points

| Module               | Hook                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7 Training           | **Done (Module 7)**: `/training` hub, `POST /training/:id`; Career Home's Training card shows the same recommendation and the last session, and reloads on mount |
| 8 Match engine       | writes fixtures' `in_progress/completed`, matches and `player_stats`; `nextMatch`, `recentMatches`, `stats` and `result` light up with no UI change              |
| 9-11 Gameplay/HUD    | replace `/match/preparation`; `matches.enabled` flips the PREPARE button to PLAY                                                                                 |
| 12 AI                | opponent strength already surfaced as team rating                                                                                                                |
| Career engine        | creates `career_event_instances`, promotions (history entries), resolves events (`POST .../choice` is deliberately absent today)                                 |
| Contracts / sponsors | `contract` is already presented when an active contract exists; sponsors stay hidden behind `sponsorships.enabled`                                               |
| Shop                 | `features.shop` flag; Career Home never depends on it                                                                                                            |
| PvP                  | independent of the single-player hub                                                                                                                             |
