Committed SQL and drizzle metadata. Apply with `pnpm db:migrate`; generate with `pnpm db:generate`; never use push/reset in deployment.

- 0000_initial_schema: generated from `src/schema`.
- 0001_integrity_triggers: hand-written integrity triggers (see docs/database/migrations.md).
- 0002_auth_accounts: Module 3 `users.account_type`/`registered_at`, `auth_identities`, `auth_sessions`, `auth_tokens`, `user` audit actor. Existing users become `guest` accounts.
- 0003_auth_integrity_triggers: hand-written guards (no registered -> guest, identities are never reassigned).

Commit SQL and `meta/` together. Back up before migrating production; recover by restoring a compatible backup and application release or by a forward corrective migration. No destructive automatic down migration exists. Full policy: `docs/database/migrations.md`.
- 0004_player_creation_metadata: Module 4 nullable creation key/hash/balance version/starter personality on `player_profiles`.
- 0005_career_onboarding: Module 6 `player_onboarding` (player id + step, primary key, step format CHECK) for one-time UX flags such as the Career Home intro.

Module 8 adds `match_engine_sessions` in 0006 for versioned replay/state alongside normalized scoring. Migration 0007 aligns delivery-within-over capacity with the engine safety limit; no prior migration is rewritten.
