import { parseEnvironment } from '@the-cricketer/config';
import { createDatabase } from '@the-cricketer/database';
import { cleanupAuthData } from '../modules/auth/auth.cleanup';

/**
 * Usage: pnpm auth:cleanup-sessions [retentionDays]   (default 7)
 * Safe to run in any environment and on a schedule: it only removes rows that are already dead.
 */
const days = Number(process.argv[2] ?? 7);
if (!Number.isInteger(days) || days < 0 || days > 3650) {
  console.error('retentionDays must be an integer between 0 and 3650');
  process.exit(1);
}
parseEnvironment(process.env);
const database = createDatabase(process.env);
try {
  const result = await cleanupAuthData(
    database.repositories(),
    new Date(),
    days,
  );
  console.log(
    `Removed ${result.sessions} expired/revoked sessions and ${result.tokens} spent/expired tokens (retention ${days}d).`,
  );
} catch {
  console.error('Cleanup failed; check DATABASE_URL and run pnpm db:migrate.');
  process.exitCode = 1;
} finally {
  await database.close();
}
