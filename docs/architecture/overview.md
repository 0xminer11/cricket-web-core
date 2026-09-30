# Architecture overview

Module 1 is engineering infrastructure. Module 0 remains the source of truth; no cricket simulation, career behavior, payments or authentication is implemented.

Player web and admin use Next.js App Router, React and Tailwind. API and future realtime service use Fastify. Pure TypeScript game-core owns definitions and behavior; match-engine owns future simulation interfaces. Server-kit contains common HTTP infrastructure, not business rules.

Drizzle was chosen for explicit, reviewable SQL migrations and an empty initial schema. PostgreSQL owns future persisted progression. Redis connections are prepared for future sessions, rate limits and coordination. Health-only services deliberately do not open unused database connections; db:check and integration tests explicitly exercise both dependencies.

API flow: HTTP controller → application service → domain function → domain-specific persistence interface. Define interfaces when a real use case needs them, avoiding empty generic repositories.

State: server data belongs in a typed API/data-fetching layer; ephemeral UI state stays local until cross-component sharing requires a store. Simulation runtime belongs to the game engine. Currency, XP, inventory and results must be server-validated.

Persistence uses UTC timestamps; transport uses ISO 8601; localization happens at presentation. Entity IDs use UUIDs; static IDs retain Module 0 machine-readable values. Coins/gems are safe integers; money uses integer minor units or a dedicated decimal type, never floating point.

Module 2 adds domain schema, migrations and persistence adapters; Module 3 adds auth; Module 4 cricketer creation; Module 5 dynamically loaded Three.js character viewer; Module 6 career dashboard; Module 8+ implements the rendering-free cricket engine. Multiplayer attaches a realtime transport/room registry to game-server. Protected admin and LiveOps follow authentication and versioned configuration.

Future PWA: add manifest/installability and versioned asset caching at the web boundary; never cache authoritative writes or authenticated responses indiscriminately. Keep the initial compressed JS shell below a provisional 200 KB, measure with production builds, and refine after assets exist. Next routes split automatically; Phaser/Three.js and match assets must load dynamically only in their feature routes.

Technology references: [Node LTS policy](https://github.com/nodejs/Release), [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), and [Drizzle migration generation](https://orm.drizzle.team/docs/drizzle-kit-generate).
