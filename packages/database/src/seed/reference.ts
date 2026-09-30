import { TEAMS } from '@the-cricketer/game-core';
import type { Database } from '../connection';
import type { GameVersionRecord, TeamRecord } from '../records';

/**
 * Canonical reference rows needed in every environment: the active version triple and one team row
 * per Module 0 team definition. Idempotent (upserts on stable keys); safe to run on each deploy.
 * Nothing else from game-core is copied into PostgreSQL.
 */
export async function seedReferenceData(
  database: Database,
): Promise<{ version: GameVersionRecord; teams: readonly TeamRecord[] }> {
  return database.transaction(
    async (tx) => {
      const repos = database.repositories(tx);
      const version =
        await repos.gameVersions.ensureCurrent('Seeded by db:seed');
      const teams = await repos.teams.ensureCanonicalTeams(
        TEAMS.map((t) => t.teamId),
      );
      return { version, teams };
    },
    { operation: 'seed.reference' },
  );
}
