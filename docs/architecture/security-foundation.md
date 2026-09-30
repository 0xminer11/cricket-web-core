# Security foundation

Frontend/game clients are untrusted. API is authoritative for persistence/progression; future realtime server is authoritative for PvP. Browsers never connect to the database. Admin has no auth and is explicitly marked NOT PRODUCTION READY; do not publicly deploy it until Module 3 protection exists.

Fastify installs Helmet, explicit CORS allowlists, a 64 KiB body limit, request/connection timeouts and per-process rate limiting. Production allows 120 requests/minute/IP; development 1000. This is single-process infrastructure only; future high-risk routes need route-specific policies and shared Redis-backed limits. CORS is not authorization. TLS/proxy topology belongs to deployment.

Do not put tokens, secrets or private data into public environment variables, logs, source maps or examples. Compose credentials are deliberately local-only fixtures; services bind loopback. Production images run non-root without development dependencies. No deployment is automated.

Use pnpm audit:dependencies before releases. Review direct and transitive changes, update lockfile intentionally, run all gates and audit again. Avoid blanket forced upgrades. Full development-tool audit findings should be tracked separately from production exposure.
