# Persistence and authority

`MatchSnapshotService` reads current DB attributes, personality, handedness/style, form/fatigue and equipped item base/upgrade modifiers. Cosmetic meshes have no authority. The match uses this detached snapshot for its lifetime; training affects the next match only. Fictional opponents use existing team strengths expanded into ordinary player attributes.

Authenticated `POST /api/v1/career/matches/:fixtureId/start` resolves the player's career from their session, validates ownership, locks player state/career, and creates at most one match for the fixture. `GET /api/v1/matches/:matchId` checks participation and returns no-store state without seed/snapshots. There is no public ball endpoint or new playable UI.

Internal `MatchService.resolveBall`: transaction → match row lock → participant check → versioned replay → sequence/action validation → resolve → normalized ball/over/innings aggregates → final result/ratings once → checkpoint/replay revision → commit. Invalid actions roll back all changes; concurrent retries produce one ball. Existing repository aggregate checks and normalized foreign keys remain in use.

`match_engine_sessions` adds replay, state, participant-ID map and revision beside normalized tables. DB participant UUIDs are mapped from stable domain IDs. Replay global sequence differs from normalized per-innings sequence. Match header pins engine/balance/schema/RNG versions. Database ball speed is km/h; domain is m/s. Fixtures complete with the match; reward/career-stat services remain separate.

Use forward migrations 0006 (sessions) and 0007 (delivery capacity). The match-ball per-over bound aligns with the engine safety limit, allowing repeated illegal deliveries. Only the service may write engine sessions; no new browser controls are added.
