# Career events

Module 0 defines ten `CAREER_EVENTS` (coach, media, selection, contract, sponsor, team, rivalry, milestone) and Module 2 stores occurrences in `career_event_instances` (pending, resolved, expired, dismissed; at most one pending per definition). No engine creates occurrences yet, so Module 6 builds the **presentation and ownership foundation** only.

- **Hub card**: shown only when an occurrence is `pending` and its definition still exists: title, description, **VIEW**. Otherwise nothing is rendered (no "no offers" filler).
- **`GET /career/events`**: the caller's occurrences, newest first, paginated. **`GET /career/events/:id`**: one occurrence with choice **labels** only.
- **Ownership**: the lookup is scoped by the caller's career id. Someone else's id and an unknown id both return `404 CAREER_EVENT_NOT_FOUND`, so existence is not leaked. A non-UUID id is also a 404.
- **Hidden configuration**: effects, deltas, weights, cooldowns, requirements and the effects snapshot are never serialised (tested).
- **Choosing**: `POST /career/events/:id/choice` does **not** exist. Resolving an event changes reputation, fans, coins and personality, which needs the Career Engine (effects application, ledger entries, cooldowns). The detail page says responses arrive in an upcoming update. When the engine exists it adds that endpoint and `career_event.resolved` invalidation.
- **Pages**: `/career/events` (list or empty state), `/career/events/[id]` (detail).
