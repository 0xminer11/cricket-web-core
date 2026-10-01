import type { Database } from '@the-cricketer/database';
import { planStarterFixtures } from '@the-cricketer/game-core';
import type { TeamId } from '@the-cricketer/game-core';

/**
 * Gives a career its first few fixtures so the Career Home is never an empty screen. It is the
 * ONLY writer on the Career Home read path and is idempotent by construction:
 *
 *  - runs in one transaction that first row-locks the career, so two simultaneous first requests
 *    queue up instead of both inserting;
 *  - inserts only when the career has no fixture at all (any status), so a player who has played
 *    or finished every fixture is never re-seeded;
 *  - the plan is a pure function of (career start, tier, team), so nothing random is generated on
 *    refresh.
 *
 * This is deliberately not a season simulator: later modules own scheduling.
 */
export class FixtureBootstrapService {
  constructor(private readonly database: Database) {}

  /** Returns true when fixtures were created by this call. */
  async ensureStarterFixtures(career: {
    readonly id: string;
    readonly currentTier: Parameters<typeof planStarterFixtures>[0]['tier'];
    readonly startedAt: Date;
    readonly seasonNumber: number;
    readonly teamDefinitionId: string | null;
  }): Promise<boolean> {
    if (!career.teamDefinitionId) return false; // unattached career: nothing to schedule
    const plan = planStarterFixtures({
      careerStartedAt: career.startedAt,
      tier: career.currentTier,
      playerTeamId: career.teamDefinitionId as TeamId,
      seasonNumber: career.seasonNumber,
    });
    if (!plan.length) return false;
    return this.database.transaction(
      async (tx) => {
        const repos = this.database.repositories(tx);
        await repos.careerHome.lockCareer(career.id);
        if ((await repos.careerHome.countFixtures(career.id)) > 0) return false;
        const definitionIds = [
          ...new Set(
            plan.flatMap((f) => [
              f.homeTeamDefinitionId,
              f.awayTeamDefinitionId,
            ]),
          ),
        ];
        const rows = await repos.teams.ensureCanonicalTeams(definitionIds);
        const byDefinition = new Map(rows.map((t) => [t.definitionId, t.id]));
        for (const f of plan) {
          const home = byDefinition.get(f.homeTeamDefinitionId);
          const away = byDefinition.get(f.awayTeamDefinitionId);
          if (!home || !away) continue;
          await repos.teams.createFixture({
            careerId: career.id,
            competitionDefinitionId: f.competitionDefinitionId,
            homeTeamId: home,
            awayTeamId: away,
            matchFormatId: f.matchFormatId,
            scheduledAt: f.scheduledAt,
            seasonNumber: f.seasonNumber,
            round: f.round,
          });
        }
        return true;
      },
      { operation: 'career.bootstrap_fixtures' },
    );
  }
}
