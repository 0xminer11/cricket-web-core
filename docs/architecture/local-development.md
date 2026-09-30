# Local development

See root README for verified setup commands and URLs. pnpm dev starts four applications plus shared-package watchers after dependency builds. tsx watches imported server modules; Next handles frontend hot reload. Production starts use built output. Root .env is shared through explicit loaders, not copied into applications.

Use docker compose up -d --wait before database checks. docker compose down stops dependencies and preserves data volumes. Never add --volumes unless intentionally discarding local data. If a port conflicts, update corresponding ports and CORS/public URLs together. Docker service port remapping also requires URL changes.

API and game-server handle SIGINT/SIGTERM. Future persistence owners must construct one shared connection set per process, connect before accepting required requests, register close through onClose, and avoid per-request clients. Hot reload restarts the process; no global browser singleton is involved.

Build server images from root with the shared Dockerfile and SERVICE argument. Supply APP_ENV=production, NODE_ENV=production, CORS_ORIGINS and appropriate service port at runtime. Web/admin already use Next standalone output for future deployment packaging. Admin must remain private until authenticated.

Shared watchers emit JavaScript only to avoid retaining nine declaration compiler workers during development. Initial dependency builds and pnpm typecheck regenerate declaration files; run typecheck after changing a shared public type. Runtime hot reload remains automatic.

Database workflow (Module 2): `docker compose up -d --wait`, then `pnpm db:migrate` and `pnpm db:seed` (development players and a sample match are added only when APP_ENV is development/test). `pnpm db:reset` wipes and re-migrates the local database and refuses anything but a local host in development/test. Change the schema in `packages/database/src/schema`, run `pnpm db:migrate:dev`, review the generated SQL, and run `pnpm db:test`. Details: [docs/database](../database/overview.md). The API now owns one lazily-connecting pool per process (`app.database`) and `GET /ready` reports it.
