import type { Repositories } from '@the-cricketer/database';

/**
 * Retention sweep for the auth tables: sessions that expired or were revoked, and verification /
 * reset tokens that expired or were spent, more than `retentionDays` ago. Keeps the tables from
 * growing without bound. Run on a schedule: `pnpm auth:cleanup-sessions`.
 */
export async function cleanupAuthData(
  repos: Repositories,
  now: Date,
  retentionDays: number,
): Promise<{ sessions: number; tokens: number }> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  return {
    sessions: await repos.sessions.deleteExpired(cutoff),
    tokens: await repos.authTokens.deleteExpired(cutoff),
  };
}
