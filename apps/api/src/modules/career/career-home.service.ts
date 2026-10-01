import {
  battingAverage,
  bowlingAverage,
  economyRate,
  strikeRate,
} from '@the-cricketer/database';
import type {
  Database,
  PlayerStatsRecord,
  Repositories,
} from '@the-cricketer/database';
import {
  ACHIEVEMENTS,
  APPEARANCE_BY_ID,
  CAREER_EVENTS,
  EQUIPMENT_SLOT_LABELS,
  ITEMS,
  MATCH_REQUIRED_SLOTS,
  PERSONALITY_ARCHETYPES,
  recommendTraining,
  REST_TRAINING_ID,
  TRAINING_BY_ID,
  buildTrainingSnapshot,
  startOfUtcDay,
  resolveTraining,
  statFocus,
  fatigueState,
  formatLabel,
  playerOverall,
  GAME_BALANCE_VERSION,
  MATCH_FORMATS,
} from '@the-cricketer/game-core';
import { SystemClock } from '@the-cricketer/game-core';
import type { Clock, PlayerAttributes } from '@the-cricketer/game-core';
import { featureFlags } from '@the-cricketer/config';
import {
  careerHomeSchema,
  trainingResultSchema,
} from '@the-cricketer/shared-types';
import type {
  CareerHomeDto,
  ObjectiveSummary,
} from '@the-cricketer/shared-types';
import {
  CareerDataUnavailableError,
  CareerNotInitializedError,
} from './career.errors';
import { FixtureBootstrapService } from './fixture-bootstrap.service';
import { teamIdentity, toFixtureSummary } from './fixture-presenter';
import type { PlayerScope } from '../player/equipment.service';
import { buildCareerSummary, buildProgressionSummary } from './summaries';

const ITEM_NAME = new Map<string, string>(ITEMS.map((i) => [i.id, i.name]));
const EVENT_BY_ID = new Map<string, (typeof CAREER_EVENTS)[number]>(
  CAREER_EVENTS.map((e) => [e.eventId, e]),
);
const ARCHETYPE_NAME = new Map<string, string>(
  PERSONALITY_ARCHETYPES.map((a) => [a.id, a.name]),
);
const CURRENCY_NAME = { coins: 'Coins', gems: 'Gems' } as const;
const UPCOMING_SHOWN = 4;
const OBJECTIVES_SHOWN = 3;
const RECENT_SHOWN = 3;

interface Logger {
  warn(obj: unknown, msg?: string): void;
}

export const toObjective = (
  def: (typeof ACHIEVEMENTS)[number],
  row?: { progress: number; completed: boolean; rewardClaimed: boolean },
): ObjectiveSummary => {
  const target = Math.max(1, def.condition.value);
  const completed = row?.completed ?? false;
  return {
    id: def.id,
    title: def.name,
    description: def.description,
    progress: completed ? target : Math.min(target, row?.progress ?? 0),
    target,
    completed,
    reward: {
      coins: def.reward.coins ?? 0,
      xp: def.reward.playerXp ?? 0,
      fans: def.reward.fans ?? 0,
      reputation: def.reward.reputation ?? 0,
    },
    rewardClaimed: row?.rewardClaimed ?? false,
  };
};

/** Pure: fixed order by closeness to completion, then by id, so the list is stable between loads. */
export const sortObjectives = (list: ObjectiveSummary[]): ObjectiveSummary[] =>
  [...list].sort(
    (a, b) =>
      b.progress / b.target - a.progress / a.target || a.id.localeCompare(b.id),
  );

/** Career-level + role-aware statistics. Ratios that are undefined stay null (never NaN). */
export function summariseStats(
  role: Parameters<typeof statFocus>[0],
  s: PlayerStatsRecord | null,
  ballsPerOver = 6,
): CareerHomeDto['stats'] {
  const z = s ?? {
    matches: 0,
    matchesWon: 0,
    inningsBatted: 0,
    runs: 0,
    ballsFaced: 0,
    fifties: 0,
    hundreds: 0,
    highestScore: 0,
    notOuts: 0,
    ballsBowled: 0,
    runsConceded: 0,
    wickets: 0,
    bestBowlingWickets: 0,
    bestBowlingRuns: 0,
  };
  const round = (n: number | null): number | null =>
    n === null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10;
  return {
    focus: statFocus(role),
    matches: z.matches,
    wins: z.matchesWon,
    batting: {
      runs: z.runs,
      average: round(battingAverage(z)),
      strikeRate: round(strikeRate(z)),
      highestScore: z.highestScore,
      fifties: z.fifties,
      hundreds: z.hundreds,
    },
    bowling: {
      wickets: z.wickets,
      economy: round(economyRate(z, ballsPerOver)),
      average: round(bowlingAverage(z)),
      bestFigures:
        z.bestBowlingWickets > 0
          ? `${z.bestBowlingWickets}/${z.bestBowlingRuns}`
          : null,
    },
  };
}

/** Fatigue and gear checks only. Never alters a match outcome. */
export function buildReadiness(
  fatigue: number,
  missingRequired: readonly string[],
): CareerHomeDto['readiness'] {
  const issues: CareerHomeDto['readiness']['issues'] = [];
  for (const slot of missingRequired)
    issues.push({
      code: 'EQUIPMENT_MISSING',
      severity: 'blocking',
      message: `${EQUIPMENT_SLOT_LABELS[slot] ?? slot} required before a match.`,
    });
  const state = fatigueState(fatigue);
  if (state === 'tired')
    issues.push({
      code: 'FATIGUE_HIGH',
      severity: 'warning',
      message:
        'Your fatigue is high. Consider recovery before intensive training.',
    });
  if (state === 'exhausted')
    issues.push({
      code: 'FATIGUE_VERY_HIGH',
      severity: 'warning',
      message: 'Your fatigue is very high and will hurt your performance.',
    });
  return {
    status: issues.some((i) => i.severity === 'blocking')
      ? 'blocked'
      : issues.length
        ? 'caution'
        : 'ready',
    issues,
  };
}

/**
 * Assembles the Career Home in two fixed stages (no per-row lookups):
 *   1. player dashboard (profile+state, career+team, balances, equipped) and upcoming fixtures
 *   2. everything else in parallel (attributes, appearance, stats, recent matches, events,
 *      achievements, contract, onboarding, team names)
 * Optional widgets (event, objectives, recent matches) fail soft: the section is omitted and
 * named in `degraded`, the rest of the page still renders.
 */
export class CareerHomeService {
  private readonly bootstrap: FixtureBootstrapService;

  constructor(
    private readonly database: Database,
    private readonly log: Logger,
    private readonly clock: Clock = new SystemClock(),
  ) {
    this.bootstrap = new FixtureBootstrapService(database);
  }

  async home(
    scope: PlayerScope,
    repos: Repositories = this.database.repositories(),
  ): Promise<CareerHomeDto> {
    const dashboard = await repos.players.getDashboard(scope.playerId);
    if (!dashboard?.career) throw new CareerNotInitializedError();
    const { career, profile, state, currentTeam } = dashboard;

    let upcoming = await repos.careerHome.listFixtures(career.id, 'upcoming', {
      limit: UPCOMING_SHOWN + 2,
    });
    if (!upcoming.items.length) {
      // Empty may just mean "first visit". Bootstrapping is idempotent and serialised, so even if
      // another request created the fixtures a moment ago this call must re-read them.
      await this.bootstrap.ensureStarterFixtures({
        id: career.id,
        currentTier: career.currentTier,
        startedAt: career.startedAt,
        seasonNumber: career.seasonNumber,
        teamDefinitionId: currentTeam?.definitionId ?? null,
      });
      upcoming = await repos.careerHome.listFixtures(career.id, 'upcoming', {
        limit: UPCOMING_SHOWN + 2,
      });
    }

    const degraded = new Set<CareerHomeDto['degraded'][number]>();
    const soft = async <T>(
      section: CareerHomeDto['degraded'][number],
      fallback: T,
      task: () => Promise<T>,
    ): Promise<T> => {
      try {
        return await task();
      } catch (error) {
        degraded.add(section);
        this.log.warn({ err: error, section }, 'career home section failed');
        return fallback;
      }
    };

    const [
      attributes,
      appearance,
      stats,
      ratings,
      recentEntries,
      pendingEvents,
      achievementRows,
      contract,
      onboarding,
      skillProgress,
      trainingCounts,
      lastTrainingRows,
    ] = await Promise.all([
      repos.players.getAttributes(scope.playerId),
      repos.players.getAppearance(scope.playerId),
      repos.players.getStats(scope.playerId),
      repos.matches.getRecentPerformanceRatings(scope.playerId, 5),
      soft('recentMatches', null, () =>
        repos.matches.listPlayerMatchHistory(scope.playerId, { limit: 8 }),
      ),
      soft('careerEvent', null, () =>
        repos.careers.listEventInstances(career.id, {
          status: 'pending',
          limit: 1,
        }),
      ),
      soft('objectives', null, () => repos.achievements.list(scope.playerId)),
      repos.careers.getActiveContract(career.id),
      repos.careerHome.completedOnboardingSteps(scope.playerId),
      repos.players.getSkillProgress(scope.playerId),
      repos.training.countSince(
        scope.playerId,
        startOfUtcDay(this.clock.now()),
        REST_TRAINING_ID,
      ),
      soft('objectives', null, () =>
        repos.training.listCompleted(scope.playerId, { limit: 1 }),
      ),
    ]);
    if (!attributes || !appearance) throw new CareerDataUnavailableError();

    const completedMatches = (recentEntries?.items ?? [])
      .filter((m) => m.status === 'completed')
      .slice(0, RECENT_SHOWN);
    const teamIds = [
      ...new Set([
        ...completedMatches.map((m) => m.opponentTeamId),
        ...(contract ? [contract.teamId] : []),
      ]),
    ];
    const teamRows = teamIds.length ? await repos.teams.getByIds(teamIds) : [];
    const teamById = new Map(teamRows.map((t) => [t.id, t]));

    const fixtureSummaries = upcoming.items.map((v) =>
      toFixtureSummary(v, career.currentTeamId),
    );
    const playable = fixtureSummaries.filter(
      (f) => f.status === 'scheduled' || f.status === 'in_progress',
    );
    const nextMatch = playable[0] ?? null;

    const equippedBySlot = new Map(
      dashboard.equipped.map((e) => [e.equipmentSlot, e.itemDefinitionId]),
    );
    const piece = (slot: string) => {
      const itemId = equippedBySlot.get(slot as never);
      return itemId ? { itemId, name: ITEM_NAME.get(itemId) ?? itemId } : null;
    };
    const missingRequired = MATCH_REQUIRED_SLOTS.filter(
      (slot) => !equippedBySlot.has(slot),
    );

    const achievementByDef = new Map(
      (achievementRows ?? []).map((r) => [r.achievementDefinitionId, r]),
    );
    const objectiveList = sortObjectives(
      ACHIEVEMENTS.map((def) => toObjective(def, achievementByDef.get(def.id))),
    );
    const active = objectiveList.filter((o) => !o.completed);

    const pending = pendingEvents?.items[0];
    const eventDef = pending
      ? EVENT_BY_ID.get(pending.eventDefinitionId)
      : null;

    const coins =
      dashboard.balances.find((b) => b.currencyType === 'coins')?.balance ?? 0;
    const trainingSnapshot = buildTrainingSnapshot({
      level: state.level,
      xp: state.currentXp,
      role: profile.primaryRole,
      bowlingStyle: profile.bowlingStyle,
      attributes: attributes as PlayerAttributes,
      skillProgress,
      fatigue: state.fatigue,
      coins,
      drillsToday: trainingCounts.drills,
      restsToday: trainingCounts.rests,
    });
    const recommendation = recommendTraining(trainingSnapshot);
    const recommendedDef = recommendation
      ? TRAINING_BY_ID.get(recommendation.trainingId)
      : undefined;
    const recommendedRun =
      recommendedDef &&
      resolveTraining({ player: trainingSnapshot, training: recommendedDef });
    const lastTrainingResult = (() => {
      const row = lastTrainingRows?.items[0];
      const parsed = trainingResultSchema.safeParse(
        row?.outcome && typeof row.outcome === 'object'
          ? (row.outcome as Record<string, unknown>)['result']
          : null,
      );
      return parsed.success ? parsed.data : null;
    })();

    const balanceOf = (code: 'coins' | 'gems') =>
      dashboard.balances.find((b) => b.currencyType === code)?.balance ?? 0;

    const dto: CareerHomeDto = {
      player: {
        displayName: profile.displayName,
        primaryRole: profile.primaryRole,
        countryCode: profile.countryCode,
        jerseyNumber: profile.jerseyNumber,
        battingHand: profile.battingHand,
        overall: playerOverall(attributes, profile.primaryRole),
        portrait: {
          skinColor:
            APPEARANCE_BY_ID.get(appearance.skinToneId)?.swatch ?? '#b9805a',
          hairColor:
            APPEARANCE_BY_ID.get(appearance.hairColorId)?.swatch ?? '#14110f',
          bald: appearance.hairStyleId.includes('bald'),
          beard:
            (appearance.beardStyleId ?? 'appearance.beard.none') !==
            'appearance.beard.none',
        },
      },
      progression: buildProgressionSummary(state, ratings),
      currencies: (['coins', 'gems'] as const).map((code) => ({
        code,
        name: CURRENCY_NAME[code],
        balance: balanceOf(code),
      })),
      career: buildCareerSummary(career, currentTeam),
      nextMatch,
      readiness: buildReadiness(state.fatigue, missingRequired),
      upcomingFixtures: playable.slice(0, UPCOMING_SHOWN),
      recentMatches: completedMatches.map((m) => {
        const mine = m.scores.find((s) => s.teamId === m.playerTeamId);
        const theirs = m.scores.find((s) => s.teamId !== m.playerTeamId);
        const opponent = teamById.get(m.opponentTeamId);
        return {
          matchId: m.matchId,
          opponentName: opponent ? teamIdentity(opponent).name : 'Opponent',
          formatName: formatLabel(m.matchFormatId).name,
          result:
            m.resultType === 'win'
              ? m.won
                ? ('won' as const)
                : ('lost' as const)
              : m.resultType === 'tie'
                ? ('tied' as const)
                : ('no_result' as const),
          scoreLine:
            mine && theirs
              ? `${mine.runs}/${mine.wickets} v ${theirs.runs}/${theirs.wickets}`
              : null,
          performanceRating: m.performanceRating,
          completedAt: m.completedAt?.toISOString() ?? null,
        };
      }),
      stats: summariseStats(
        profile.primaryRole,
        stats,
        MATCH_FORMATS[0]?.ballsPerOver ?? 6,
      ),
      objectives: active.slice(0, OBJECTIVES_SHOWN),
      achievements: {
        completed: objectiveList.filter((o) => o.completed).length,
        total: ACHIEVEMENTS.length,
      },
      careerEvent:
        pending && eventDef
          ? {
              id: pending.id,
              title: eventDef.title,
              description: eventDef.description,
              type: eventDef.type,
              status: pending.status,
              triggeredAt: pending.triggeredAt.toISOString(),
            }
          : null,
      contract: contract
        ? {
            teamName: teamById.get(contract.teamId)
              ? teamIdentity(teamById.get(contract.teamId)!).name
              : 'Your team',
            role: contract.expectedRole,
            matchesPlayed: contract.matchesPlayed,
            durationMatches: contract.durationMatches,
            matchFeeCoins: contract.matchFeeCoins,
          }
        : null,
      equipped: {
        bat: piece('bat'),
        kit: piece('jersey'),
        equippedCount: dashboard.equipped.length,
        missingRequired: [...missingRequired],
      },
      training:
        recommendation && recommendedDef
          ? {
              trainingId: recommendation.trainingId,
              name: recommendedDef.displayName,
              reason: recommendation.reason,
              explanation: recommendation.explanation,
              statLabel: recommendation.statLabel ?? null,
              statValue: recommendation.statValue ?? null,
              category: recommendedDef.category,
              fatigueAdded: recommendedRun?.ok
                ? Math.max(0, recommendedRun.result.fatigue.delta)
                : recommendedDef.fatigueGain,
              cost: recommendedDef.cost,
            }
          : null,
      lastTraining: lastTrainingResult
        ? {
            name: lastTrainingResult.name,
            completedAt: lastTrainingResult.completedAt,
            improvements: lastTrainingResult.skills
              .filter((k) => k.valueAfter > k.valueBefore)
              .map((k) => `${k.label} ${k.valueBefore} → ${k.valueAfter}`),
          }
        : null,
      personality: {
        archetype:
          ARCHETYPE_NAME.get(profile.starterPersonalityId ?? '') ?? 'Balanced',
        confidence: attributes.personality.confidence,
        discipline: attributes.personality.discipline,
      },
      onboarding: { introCompleted: onboarding.includes('career_home_intro') },
      features: {
        training: featureFlags['training.enabled'],
        matches: featureFlags['matches.enabled'],
        shop: featureFlags['shop.enabled'],
      },
      degraded: [...degraded],
      gameVersion: GAME_BALANCE_VERSION,
    };
    const checked = careerHomeSchema.safeParse(dto);
    if (!checked.success) {
      this.log.warn(
        { issues: checked.error.issues },
        'career home dto invalid',
      );
      throw new CareerDataUnavailableError();
    }
    return checked.data;
  }
}
