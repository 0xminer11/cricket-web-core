Committed SQL and drizzle metadata. Apply with `pnpm db:migrate`; generate with `pnpm db:generate`; never use push/reset in deployment.

- 0000_initial_schema: generated from `src/schema`.
- 0001_integrity_triggers: hand-written integrity triggers (see docs/database/migrations.md).

Commit SQL and `meta/` together. Back up before migrating production; recover by restoring a compatible backup and application release or by a forward corrective migration. No destructive automatic down migration exists. Full policy: `docs/database/migrations.md`.
