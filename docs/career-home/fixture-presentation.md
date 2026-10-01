# Fixture presentation and bootstrap

## Data

Fixtures are Module 2 rows (`fixtures`: career, competition id, home/away team, format id, scheduled time, status, season, round). The web never fabricates a fixture. `toFixtureSummary` (API) turns a row into a player-facing summary:

- **Your team / opponent**: the side belonging to the career's team; home/away flag.
- **Format**: label and overs from Module 0 `MATCH_FORMATS` through `formatLabel`. An unknown but valid future format id still renders (name derived from the id, `overs: null`); no UI switch on "2 or 5 overs".
- **Competition**: `COMPETITIONS[tier]` (`competition.<tier>.league`; "International Series" for the top tier).
- **Venue / pitch**: fixtures have neither column, so each team has a fictional home ground in `VENUES` with a pitch (`pitch.green|hard|dry`). A fixture's venue is the home team's ground and the pitch hint comes from `PITCH_PRESENTATION`. No stadium assets, no weather (no data).
- **Date**: ISO UTC from the server; the web shows the viewer's local date/time **and** relative wording (Today / Tomorrow / In n days). A past date reads "Available now" because there is no match engine to move the calendar yet.
- **Status**: scheduled, in_progress, completed, cancelled, postponed. "Next match" is the earliest `scheduled`/`in_progress` fixture; completed, cancelled and postponed fixtures are never "next".
- **Result** (completed only): won / lost / tied / no result from the linked match (`matches.fixture_id`).

## Starter fixtures

A new cricketer has no fixtures, so the first Career Home (or fixtures) request creates a short run-in via `FixtureBootstrapService`:

- **Deterministic**: `planStarterFixtures(careerStart, tier, team)` is pure. Opponents are the other fictional teams ordered by rating closeness; formats rotate through Module 0 formats; home/away alternate; 5 fixtures, the first 1 day after the career starts, then every 3 days at 15:00 UTC (`STARTER_FIXTURE_CONFIG`).
- **Idempotent**: one transaction that row-locks the career, counts its fixtures (any status) and inserts only when there are none. Concurrent first loads queue on the lock; the loser re-reads the fixtures (a bug caught by the E2E suite: both callers must re-list after bootstrapping). Refreshes never add rows and never change the plan.
- **Not a season simulator**: no table, standings or scheduling engine. Later modules extend the schedule; because the check is "no fixture at all", a career that has played or cancelled everything is never re-seeded.
- Unattached careers (no team) get no fixtures and see the no-match empty state.

## Pages

`/career/fixtures`: Upcoming / Completed toggle, cursor pagination ("Show more"), empty states for both. Only the caller's own career fixtures are ever returned (query joined on `career_id`).

## Match preparation (`/match/preparation`, `/play` redirects here)

A real screen with opponent, venue, pitch, date, readiness issues, role/overall/level and equipped gear, plus the notice "Match gameplay will be enabled in the upcoming Match module." It starts nothing and shows no result. The Match module replaces this route.
