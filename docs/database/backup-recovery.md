# Backup and recovery

Vendor-specific infrastructure is not chosen yet; these are the requirements for whichever managed PostgreSQL or self-hosted setup is used.

## Requirements

1. **Automated backups** at least daily, stored in a separate failure domain (region/account) from the primary, encrypted at rest.
2. **Point-in-time recovery** (continuous WAL archiving) so the ledger and match results can be recovered to seconds before an incident. RPO target: minutes; RTO target: to be set with operations.
3. **Retention**: dailies for 14-30 days, weeklies for 3 months (tune to legal/support needs). Wallet ledger, matches, contracts and audit logs are retained indefinitely inside the database, so backups protect against loss, not routine cleanup.
4. **Pre-migration backup** (or verified restore point) before every production `pnpm db:migrate`.
5. **Access control**: backup storage is private, restores are restricted and audited, credentials are never committed. Compose credentials are for loopback development only.

## A backup is not trustworthy until it has been restored

Schedule a **restore drill** (at least quarterly and after major schema changes):

1. Restore the latest backup, or a PITR target, into an isolated instance.
2. Run `pnpm db:migrate` (should be a no-op) and `pnpm db:check`.
3. Run integrity queries: `WalletRepository.reconcile` sampled across players (or the equivalent SQL: `balance = SUM(amount)` per wallet), `verifyInningsAggregates` on recent matches, no rows in `users` with `origin <> 'organic'` (production), foreign-key validity (`SELECT` counts of orphans should be 0).
4. Record time taken and any gaps; fix runbooks accordingly.

## Recovery policy

- Migrations are forward-only (see [migrations.md](migrations.md)); recovery from a bad migration is a corrective forward migration, or restore + a compatible application release.
- Never run `db:reset` outside local development.
- After a point-in-time restore, compare the ledger against the payment/reward provider events (future modules) before re-opening writes.
