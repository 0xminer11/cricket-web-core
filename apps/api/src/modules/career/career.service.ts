import { isUuid } from '@the-cricketer/database';
import type { Database, Repositories } from '@the-cricketer/database';
import {
  ACHIEVEMENTS,
  CAREER_EVENTS,
  TIER_PRESENTATION,
  nextTier,
} from '@the-cricketer/game-core';
import type { CareerTierId } from '@the-cricketer/game-core';
import { ONBOARDING_STEPS } from '@the-cricketer/shared-types';
import type { CareerHomeDto } from '@the-cricketer/shared-types';
import {
  CareerEventNotFoundError,
  CareerNotInitializedError,
  OnboardingStepUnknownError,
} from './career.errors';
import { sortObjectives, toObjective } from './career-home.service';
import { teamIdentity, toFixtureSummary } from './fixture-presenter';
import { FixtureBootstrapService } from './fixture-bootstrap.service';
import { buildCareerSummary, buildProgressionSummary } from './summaries';
import type { PlayerScope } from '../player/equipment.service';

const EVENT_BY_ID = new Map<string, (typeof CAREER_EVENTS)[number]>(
  CAREER_EVENTS.map((e) => [e.eventId, e]),
);

/** Human-readable career history (Module 2 `career_history` event types). */
const HISTORY_TITLES: Readonly<Record<string, string>> = {
  career_started: 'Career started',
  team_joined: 'Joined a team',
  team_left: 'Left a team',
  tier_promoted: 'Promoted',
  tier_demoted: 'Moved down a level',
  contract_signed: 'Signed a contract',
  contract_ended: 'Contract ended',
  sponsorship_signed: 'Signed a sponsorship',
  captaincy_awarded: 'Made captain',
  international_selected: 'Selected for international duty',
  season_started: 'New season began',
  retired: 'Retired',
};

const asTier = (id: string | null): CareerTierId | null =>
  id && id in TIER_PRESENTATION ? (id as CareerTierId) : null;

export class CareerService {
  private readonly bootstrap: FixtureBootstrapService;
  constructor(private readonly database: Database) {
    this.bootstrap = new FixtureBootstrapService(database);
  }

  private async context(scope: PlayerScope, repos: Repositories) {
    const dashboard = await repos.players.getDashboard(scope.playerId);
    if (!dashboard?.career) throw new CareerNotInitializedError();
    return { ...dashboard, career: dashboard.career };
  }

  /** Paged fixtures of the caller's own career. First visit seeds the starter schedule (once). */
  async fixtures(
    scope: PlayerScope,
    filter: 'upcoming' | 'completed',
    page: { limit?: number; cursor?: string },
  ) {
    const repos = this.database.repositories();
    const { career, currentTeam } = await this.context(scope, repos);
    let result = await repos.careerHome.listFixtures(career.id, filter, page);
    if (filter === 'upcoming' && !page.cursor && !result.items.length) {
      await this.bootstrap.ensureStarterFixtures({
        id: career.id,
        currentTier: career.currentTier,
        startedAt: career.startedAt,
        seasonNumber: career.seasonNumber,
        teamDefinitionId: currentTeam?.definitionId ?? null,
      });
      result = await repos.careerHome.listFixtures(career.id, filter, page);
    }
    return {
      items: result.items.map((v) => toFixtureSummary(v, career.currentTeamId)),
      nextCursor: result.nextCursor,
    };
  }

  async history(scope: PlayerScope, page: { limit?: number; cursor?: string }) {
    const repos = this.database.repositories();
    const { career } = await this.context(scope, repos);
    const result = await repos.careers.listHistory(career.id, page);
    const teamIds = [
      ...new Set(
        result.items
          .filter((h) => h.eventType.startsWith('team_') && h.referenceId)
          .map((h) => h.referenceId as string)
          .filter(isUuid),
      ),
    ];
    const teams = teamIds.length ? await repos.teams.getByIds(teamIds) : [];
    const teamName = new Map(teams.map((t) => [t.id, teamIdentity(t).name]));
    return {
      items: result.items.map((h) => {
        const tier = asTier(h.referenceId);
        const team = h.referenceId ? teamName.get(h.referenceId) : undefined;
        const season = h.metadata['season'];
        return {
          id: h.id,
          type: h.eventType,
          title:
            h.eventType === 'team_joined' && team
              ? `Joined ${team}`
              : h.eventType === 'team_left' && team
                ? `Left ${team}`
                : h.eventType === 'tier_promoted' && tier
                  ? `Promoted to ${TIER_PRESENTATION[tier].name}`
                  : h.eventType === 'tier_demoted' && tier
                    ? `Moved down to ${TIER_PRESENTATION[tier].name}`
                    : (HISTORY_TITLES[h.eventType] ?? 'Career update'),
          detail: null,
          season: typeof season === 'number' ? season : null,
          occurredAt: h.occurredAt.toISOString(),
        };
      }),
      nextCursor: result.nextCursor,
    };
  }

  async progression(scope: PlayerScope) {
    const repos = this.database.repositories();
    const { career, currentTeam, state } = await this.context(scope, repos);
    const ratings = await repos.matches.getRecentPerformanceRatings(
      scope.playerId,
      5,
    );
    const summary = buildCareerSummary(career, currentTeam);
    const next = nextTier(career.currentTier);
    const guidance = next
      ? `Build your reputation to ${next.minReputation} and keep performing to attract the ${next.name} selectors. Selectors notice consistent performances; nothing is guaranteed.`
      : 'You are at the top level. Keep your reputation and form high.';
    return {
      career: summary,
      progression: buildProgressionSummary(state, ratings),
      guidance,
    };
  }

  async objectives(scope: PlayerScope) {
    const repos = this.database.repositories();
    const rows = await repos.achievements.list(scope.playerId);
    const byId = new Map(rows.map((r) => [r.achievementDefinitionId, r]));
    const all = sortObjectives(
      ACHIEVEMENTS.map((def) => toObjective(def, byId.get(def.id))),
    );
    return {
      active: all.filter((o) => !o.completed),
      completed: all.filter((o) => o.completed),
    };
  }

  async events(scope: PlayerScope, page: { limit?: number; cursor?: string }) {
    const repos = this.database.repositories();
    const { career } = await this.context(scope, repos);
    const result = await repos.careers.listEventInstances(career.id, page);
    return {
      items: result.items.flatMap((e) => {
        const def = EVENT_BY_ID.get(e.eventDefinitionId);
        return def
          ? [
              {
                id: e.id,
                title: def.title,
                description: def.description,
                type: def.type,
                status: e.status,
                triggeredAt: e.triggeredAt.toISOString(),
              },
            ]
          : [];
      }),
      nextCursor: result.nextCursor,
    };
  }

  /** 404 for both "does not exist" and "belongs to someone else" (no existence leak). */
  async event(scope: PlayerScope, eventId: string) {
    if (!isUuid(eventId)) throw new CareerEventNotFoundError();
    const repos = this.database.repositories();
    const { career } = await this.context(scope, repos);
    const instance = await repos.careerHome.getEventInstance(
      career.id,
      eventId,
    );
    const def = instance ? EVENT_BY_ID.get(instance.eventDefinitionId) : null;
    if (!instance || !def) throw new CareerEventNotFoundError();
    return {
      id: instance.id,
      title: def.title,
      description: def.description,
      type: def.type,
      status: instance.status,
      triggeredAt: instance.triggeredAt.toISOString(),
      choices: def.choices.map((c) => ({ id: c.choiceId, label: c.label })),
      selectedChoiceId: instance.selectedChoiceId,
      resolvedAt: instance.resolvedAt?.toISOString() ?? null,
    };
  }

  async completeOnboarding(scope: PlayerScope, step: string): Promise<void> {
    if (!(ONBOARDING_STEPS as readonly string[]).includes(step))
      throw new OnboardingStepUnknownError();
    await this.database
      .repositories()
      .careerHome.completeOnboardingStep(scope.playerId, step);
  }
}

export type { CareerHomeDto };
