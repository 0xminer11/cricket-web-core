# Testing

```bash
pnpm test                 # unit tests (no database)
pnpm test:integration     # + API/database (needs docker compose up -d)
pnpm test:e2e             # Playwright (starts pnpm dev if nothing is running)
```

| Layer             | File                                | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules (19)        | `tests/career/career-logic.test.ts` | config consistency, form bands, fatigue thresholds, XP and max level, rating trend, tier path, deterministic starter fixtures for every team, stat focus, safe stats (no NaN), readiness, objective clamping, fixture presentation (home/away, results, unknown format), formatters (0, 999, 10K, 1.5M, dashes, relative dates), progress maths, web hygiene (no game-core/storage/Three/fetch, no write calls)                                                  |
| API (14)          | `tests/career/career-home.test.ts`  | 401/404 on every route, full starter payload and consistency with `/player`, no secrets, bootstrap idempotency under 6 concurrent first loads, no reseed after all fixtures are finished, pagination/filters/rejected params, per-player isolation and event ownership, pending event labels only, fatigue/level cap/1.5M fans/missing bat, role-aware stats, progression/history/objectives/onboarding, training catalogue, funnel events, constant query count |
| E2E (14)          | `e2e/career-home.spec.ts`           | guest hub + Training/Dressing Room/Player round trips + refresh, prepare-match placeholder, guest upgrade keeps career, registered sign out/in, route guards, API failure + retry (session kept), empty states, extremes at 320 px, degraded section, intro dismissal persistence, every career section, phone layout at 320/390, desktop width + keyboard                                                                                                       |
| Accessibility (3) | `e2e/career-a11y.spec.ts`           | axe (WCAG 2 A/AA, 2.1 A/AA) on 8 pages at 1280 and 360 px with zero serious/critical violations, one h1 and no skipped heading levels, keyboard focus rings, reduced motion, text equivalents for progress                                                                                                                                                                                                                                                       |

Existing suites were updated where the product changed: shell route loop (training/play are now guarded pages), table count (34), the Module 5 leak test navigates through the hub, and the player-creation hygiene threshold.

## Bugs the tests found (fixed)

1. A race in first-load fixture bootstrap: the request that lost the lock did not re-read the fixtures and showed "No match scheduled".
2. Currency chips overflowed at 320 px with large balances.
3. Invalid definition-list markup in the stat cards and an unlabeled SVG (axe).
4. `sessionStorage` use in the guest banner violated the project's storage rule (hygiene test).

## Manual verification checklist (also covered above)

Guest login → create cricketer → Career Home → Training → back → Dressing Room → back → Player → back → refresh → upgrade → sign out → sign in; states: no fixture, zero stats, high fatigue, max level, no event, 1.5M fans, 987M coins, 320 px, API error.

## Not covered

Lighthouse scoring (not installed; axe, bundle sizes and request counts are reported instead), real-device touch testing, and match-driven data (completed fixtures, recent matches from real play) beyond what the repository tests insert.
