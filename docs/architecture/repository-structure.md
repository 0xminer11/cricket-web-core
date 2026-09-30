# Repository structure

- apps/web: player-facing Next.js shell and typed API client.
- apps/api: HTTP application bootstrap, health/version and future domain modules.
- apps/game-server: HTTP bootstrap with rooms boundary; no realtime gameplay.
- apps/admin: visibly unprotected development shell; never expose as a production admin.
- packages/game-core: original Module 0 config/types/seeds plus asset registry, validators, clock, RNG and events.
- packages/match-engine: engine interface depending on core; no implementation.
- packages/shared-types: runtime-validated transport contracts.
- packages/config: environment validation, safe version constants, disabled feature flags.
- packages/database: PostgreSQL/Redis lifecycle, Drizzle schema and migrations.
- packages/logger: Pino with JSON production logs and readable development logs.
- packages/ui: generic primitives and tokens.
- packages/testing: isolated factories derived from approved definitions.
- packages/server-kit: shared request/error/security/shutdown infrastructure.
- infrastructure: scripts and multi-stage server Dockerfile.
- tests and e2e: Node/integration tests and browser shell tests.

Deviations: retained @the-cricketer namespace and Module 0 directories to avoid needless renaming. Added server-kit to prevent divergent safety/lifecycle implementations across servers. Domain types remain owned by game-core; shared-types contains transport contracts only. Empty directories/classes are replaced by explicit boundary documents until implementation needs them.
