# Match preparation

`/match/preparation` is the last stop before a match. It shows the next fixture from Career Home and nothing else is
started by opening it (a test checks the fixture is still `scheduled`).

Shown: competition, opponent and rating, venue, pitch name and its short hint, format, your Cricketer (role, overall,
level), fatigue and form with their label, readiness issues (missing gear, high fatigue) and the equipped bat and kit.

The primary button reads **CONTINUE TO TEAM SHEETS** for a new fixture and **RESUME MATCH** when a match already
exists for it. Pressing it calls `POST /career/matches/:fixtureId/start`, which is idempotent: it returns the same
match every time. The match is created before the toss with:

- the two team snapshots (your Cricketer replaces the AI player with the closest role; AI names are unique and
  deterministic),
- the engine in `created` then `ready` (it is not started),
- the toss prepared in `match_engine_sessions.flow` (which side calls, and the AI's call if it calls),
- the fixture marked `in_progress`.

Career Home's Next Match card shows **RESUME MATCH** (linking straight to `/match/:id`) once a match exists, and its
Recent list links each completed match to `/match/:id/result`.

Your skills, equipment and fatigue are snapshotted at this moment. Training done later never changes a match that has
been created.
