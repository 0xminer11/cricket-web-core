Health, readiness and version are registered by server-kit. Modules follow controller -> service -> game-core -> explicit persistence interface.

`auth/` (Module 3) implements guest accounts, email/password, sessions, verification, recovery, authorization helpers and rate limiting; see docs/auth. Persistence for it lives in packages/database (Module 2 convention), not here. Player, career, inventory and match flows arrive in later modules and must use `request.auth` and the ownership helpers.

Module 8 `matches/` wraps the pure engine with current-player snapshots, authenticated fixture start/read and transactional internal ball processing. No browser ball transport or gameplay UI is exposed.
