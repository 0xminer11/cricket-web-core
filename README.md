# THE CRICKETER

Career cricket game. Module 0 defines the game; Module 1 provides repository, applications and development infrastructure; Module 2 adds the PostgreSQL persistence layer (schema, migrations, repositories, ledger, seeds, tests); Module 3 adds authentication (guest accounts, email/password, sessions, recovery, authorization foundation); Module 4 adds cricketer creation (a five-step wizard, server-derived starting state, atomic idempotent creation, starter kit and wallet). Module 5 adds the 3D cricketer viewer and dressing room (rigged GLB character, modular kit, appearance editing, asset pipeline and validator; placeholder art). Module 6 adds the Career Home hub (`/career`: player header, next match, readiness, progression, fixtures, objectives, history, training and match-preparation entry points). Module 7 adds training and skill progression (`/training`: 25 drills plus rest, server-authoritative Skill XP, attribute points, Player XP and levels, fatigue, coin costs through the wallet, history, a pure TrainingEngine and a balance simulator). Match gameplay, the career engine and payments are intentionally future work.

## Requirements and setup

Node **24.21.0**, pnpm **10.34.6**, Docker Engine/Desktop with Compose. Versions match CI and server images.

```bash
nvm install
nvm use
npm install --global pnpm@10.34.6
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d --wait
pnpm db:generate
pnpm dev
```

Preserve an existing .env instead of overwriting it. The checked-in connection examples are only for loopback local services. Authentication uses opaque server-side sessions, so there are no JWT/session signing secrets; development runs over HTTP with `AUTH_COOKIE_SECURE=false`, while staging/production require Secure cookies and explicit `AUTH_TRUSTED_ORIGINS` (see [docs/auth](docs/auth/overview.md)).

| Application   | Local URL                    |
| ------------- | ---------------------------- |
| Web           | http://localhost:3300        |
| API           | http://localhost:4300/health |
| Game server   | http://localhost:4310/health |
| Admin preview | http://localhost:3301        |

API/game-server also expose /version. Health is a success envelope with data.status=ok. The homepage displays actual API/game health and imports approved game-core formats. Admin is an unprotected shell, explicitly not production ready.

## Commands

```bash
pnpm dev:web
pnpm dev:api
pnpm dev:game-server
pnpm dev:admin
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm format
pnpm format:check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm audit:dependencies
```

The four dev:* commands start the requested app and its package watchers. pnpm dev runs all four. Do not start duplicate processes on occupied ports. Build uses Turbo's dependency graph and validates game definitions. Tests build shared packages first; unit tests do not require Docker. Integration tests and CI require live PostgreSQL/Redis.

```bash
pnpm db:generate      # generate SQL from schema changes
pnpm db:migrate       # apply migrations (the only command for staging/production)
pnpm db:migrate:dev   # generate + migrate
pnpm db:seed          # reference data; development players only in development/test
pnpm db:reset         # DEVELOPMENT ONLY: drop and re-migrate the local database
pnpm db:test          # database integration tests (isolated throwaway databases)
pnpm db:drift         # CI: committed migrations must match the schema
pnpm db:check
pnpm db:studio
```

Drizzle generates reviewed SQL in packages/database/migrations (33 tables, plus integrity triggers). Test databases are created and dropped automatically as cricketer_test_*; the developer database is never touched by tests. Studio is a local development utility. Never reset production; see [docs/database](docs/database/overview.md) for the schema, migration policy, transactions, ledger, backup/recovery and the Module 2 acceptance matrix.

3D character (Module 5): after creating a cricketer open http://localhost:3300/player (viewer) and /dressing-room. In development the dressing room has a **Dev: grant sample gear** button so alternatives exist before a shop does. `pnpm assets:validate` checks the character assets.

Training (Module 7): open http://localhost:3300/training (or press TRAIN on the Career Home). `pnpm simulate:training` prints the progression/economy balance report (see [docs/training/balancing.md](docs/training/balancing.md)).

Authentication (Module 3): run `pnpm db:migrate`, `pnpm dev`, then open http://localhost:3300 and choose Continue as Guest. In development, verification and password-reset links are printed in the API log and listed at http://localhost:4300/api/v1/dev/emails (loopback only). Maintenance commands:

```bash
pnpm auth:cleanup-sessions [days]            # delete long-dead sessions/tokens (schedule daily)
pnpm auth:create-test-user <email> <password> # DEVELOPMENT ONLY: verified account, refuses staging/production
pnpm auth:benchmark-hash                      # time Argon2id on this machine to tune AUTH_ARGON2_*
```

After pnpm build, production-output smoke tests can use:

```bash
pnpm --filter @the-cricketer/api start
pnpm --filter @the-cricketer/game-server start
pnpm --filter @the-cricketer/web start
pnpm --filter @the-cricketer/admin start
```

These run in separate terminals. Deployment supplies NODE_ENV=production, APP_ENV=production, explicit CORS_ORIGINS and appropriate URLs; local .env retains development labeling. Admin remains a preview regardless of build mode.

```bash
docker build -f infrastructure/docker/server.Dockerfile --build-arg SERVICE=api -t cricketer-api .
docker build -f infrastructure/docker/server.Dockerfile --build-arg SERVICE=game-server -t cricketer-game-server .
```

Non-root multi-stage images contain production dependencies. No automatic production deployment exists. Stop local dependencies with docker compose down (volumes persist).

## Architecture and contribution

apps contains web, api, game-server and admin. packages contains game-core, match-engine, shared-types, database, config, logger, ui, testing and server-kit. infrastructure contains Docker and scripts; docs/game-design is the approved Module 0 specification; docs/architecture explains ownership and operational decisions.

Use public @the-cricketer/* exports. Domain code stays rendering-independent. Transport contracts belong to shared-types; ORM models belong to database. Keep rules out of controllers/components. No explicit any, secrets, authoritative browser progression or cross-application imports. Every change must pass CI: frozen install, lint, formatting, typecheck, integration tests, build and browser smoke tests. Commit migrations and lockfile changes intentionally.

See [Training docs](docs/training/overview.md), [Career Home docs](docs/career-home/overview.md), [3D character docs](docs/character-3d/overview.md) (viewer, asset pipeline, dressing room, owner asset guide), [player creation docs](docs/player-creation/overview.md), [authentication docs](docs/auth/overview.md) (threat model, sessions, CSRF, recovery, testing), [architecture overview](docs/architecture/overview.md), [dependency rules](docs/architecture/dependency-rules.md), [environment](docs/architecture/environment.md), [testing](docs/architecture/testing.md), and [Module 0 integration notes](docs/architecture/module-0-integration-notes.md).

## Troubleshooting

- Wrong Node/pnpm: run nvm use; root packageManager prevents an unrelated parent workspace selecting Yarn.
- Docker unavailable: start Docker Desktop; inspect docker compose ps and docker compose logs.
- Ports occupied: stop the conflicting process or update ports, public URLs and CORS together.
- Missing workspace dist files: run pnpm build; standard dev/test/typecheck commands build dependencies automatically.
- Homepage says unavailable: check both health endpoints and NEXT_PUBLIC_* URLs; the page does not fake health.
- Production fails environment validation: provide explicit CORS origins and NODE_ENV=production for staging/production.
- Placeholder 3D art: Module 5 ships generated TEMPORARY PLACEHOLDER models; run `pnpm assets:generate` to rebuild them and `pnpm assets:validate` to check them. Final art: see docs/character-3d/owner-asset-guide.md.

## Roadmap

Module 2: database schema/repositories. Module 3: authentication/authorization. Module 4: create cricketer. Module 5: lazy-loaded character viewer (done). Module 6: Career Home (done). Module 7: Training (done). Module 8: deterministic headless cricket engine (see [engine documentation](docs/match-engine/overview.md)). Module 9: bowling gameplay and the visual match scene (see [match visual documentation](docs/match-visual/overview.md)). Module 10: batting gameplay, shot selection, timing and assisted bat-ball contact (see [batting documentation](docs/batting/overview.md)). Module 11: the complete match flow, with team sheets, toss, innings break, scorecard, over summaries, result screen and post-match career effects (see [match flow documentation](docs/match-flow/overview.md)). Later: authoritative multiplayer, protected admin and versioned LiveOps. Module 1 does not begin these implementations.

Headless match tools: `pnpm simulate:match`, `pnpm simulate:deliveries`, and `pnpm simulate:matches --format=5over --count=1000`. See the [Module 8 balance report](docs/match-engine/MODULE-8-BALANCE-REPORT.md). Development tools (development builds only): the bowling lab at `/dev/bowling` (Module 9), the batting lab at `/dev/batting` (Module 10) and the match flow lab at `/dev/match-flow` (Module 11: arrange a toss or force a win, loss or tie to look at the result screen).
