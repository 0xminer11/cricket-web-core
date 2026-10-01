import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAREER_TIER_ORDER,
  FORM_BANDS,
  MATCH_FORMATS,
  PLAYER_CONFIG,
  STARTER_FIXTURE_CONFIG,
  TEAMS,
  fatigueState,
  formBand,
  nextTier,
  planStarterFixtures,
  ratingTrend,
  statFocus,
  tierPath,
  validateCareerHomeConfig,
  xpProgress,
  xpToNextLevel,
} from '../../packages/game-core/src/index';
import { progressPercent, clampProgress } from '../../packages/ui/src/progress';
import {
  formatCount,
  formatRatio,
  percent,
  relativeDay,
  roleName,
} from '../../apps/web/src/features/career/utils/format';
import {
  buildReadiness,
  sortObjectives,
  summariseStats,
  toObjective,
} from '../../apps/api/src/modules/career/career-home.service';
import { toFixtureSummary } from '../../apps/api/src/modules/career/fixture-presenter';

describe('career home rules (game-core)', () => {
  it('keeps its presentation config consistent with Module 0', () => {
    expect(validateCareerHomeConfig()).toEqual([]);
  });

  it('labels form with five contiguous bands and clamps out-of-range values', () => {
    expect(FORM_BANDS[0]?.min).toBe(0);
    expect(FORM_BANDS.at(-1)?.max).toBe(PLAYER_CONFIG.form.max);
    expect(formBand(PLAYER_CONFIG.form.neutral).label).toBe('Average');
    expect(formBand(0).id).toBe('very_poor');
    expect(formBand(100).id).toBe('excellent');
    expect(formBand(-50).id).toBe('very_poor');
    expect(formBand(500).id).toBe('excellent');
    expect(formBand(Number.NaN).label).toBeDefined();
  });

  it('derives readiness only from the Module 0 fatigue thresholds', () => {
    const { softWarning, hardPenaltyStart } = PLAYER_CONFIG.fatigue;
    expect(fatigueState(softWarning - 1)).toBe('ready');
    expect(fatigueState(softWarning)).toBe('tired');
    expect(fatigueState(hardPenaltyStart - 1)).toBe('tired');
    expect(fatigueState(hardPenaltyStart)).toBe('exhausted');
  });

  it('shows XP toward the next level and no impossible target at the cap', () => {
    expect(xpProgress(4, 1240)).toMatchObject({
      level: 4,
      isMaxLevel: false,
      xpToNext: xpToNextLevel(4),
      xp: 1240,
    });
    const max = xpProgress(PLAYER_CONFIG.levelCap, 999_999);
    expect(max).toMatchObject({ isMaxLevel: true, xpToNext: null });
    expect(xpProgress(1, -5).xp).toBe(0);
  });

  it('only reports a trend when there is history', () => {
    expect(ratingTrend([])).toBeNull();
    expect(ratingTrend([7, 5])).toBeNull();
    expect(ratingTrend([8, 5, 5, 5])).toBe('up');
    expect(ratingTrend([3, 6, 6, 6])).toBe('down');
    expect(ratingTrend([6, 6, 6.2, 5.9])).toBe('flat');
  });

  it('builds the tier path from the real tiers', () => {
    expect(tierPath('academy').map((t) => t.id)).toEqual([
      ...CAREER_TIER_ORDER,
    ]);
    expect(tierPath('district').map((t) => t.status)).toEqual([
      'completed',
      'completed',
      'current',
      'locked',
      'locked',
      'locked',
    ]);
    expect(nextTier('academy')?.id).toBe('club');
    expect(nextTier('international')).toBeNull();
  });

  it('plans the same starter fixtures every time, for every team', () => {
    for (const team of TEAMS) {
      const input = {
        careerStartedAt: new Date('2026-03-04T10:15:00Z'),
        tier: team.careerTier,
        playerTeamId: team.teamId,
      };
      const a = planStarterFixtures(input);
      expect(a).toEqual(planStarterFixtures(input));
      expect(a).toHaveLength(STARTER_FIXTURE_CONFIG.count);
      expect(
        a.every((f) =>
          [f.homeTeamDefinitionId, f.awayTeamDefinitionId].includes(
            team.teamId,
          ),
        ),
      ).toBe(true);
      expect(
        a.every((f) => f.homeTeamDefinitionId !== f.awayTeamDefinitionId),
      ).toBe(true);
      const times = a.map((f) => f.scheduledAt.getTime());
      expect([...times].sort((x, y) => x - y)).toEqual(times);
      expect(new Set(a.map((f) => f.matchFormatId))).toEqual(
        new Set(MATCH_FORMATS.map((f) => f.id)),
      );
    }
  });

  it('chooses a statistics focus per role', () => {
    expect(statFocus('top_order_batter')).toBe('batting');
    expect(statFocus('wicketkeeper_batter')).toBe('batting');
    expect(statFocus('fast_bowler')).toBe('bowling');
    expect(statFocus('batting_all_rounder')).toBe('all_round');
    expect(statFocus('bowling_all_rounder')).toBe('all_round');
  });
});

describe('career home read model helpers (api)', () => {
  const zero = {
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
  it('never produces NaN or Infinity for empty statistics', () => {
    const s = summariseStats('top_order_batter', null);
    expect(s.batting).toMatchObject({
      runs: 0,
      average: null,
      strikeRate: null,
    });
    expect(s.bowling).toMatchObject({
      wickets: 0,
      economy: null,
      average: null,
      bestFigures: null,
    });
    expect(JSON.stringify(s)).not.toMatch(/NaN|Infinity/);
    expect(summariseStats('fast_bowler', zero as never).focus).toBe('bowling');
  });
  it('computes cricket ratios with the shared derivations', () => {
    const s = summariseStats('batting_all_rounder', {
      ...zero,
      matches: 4,
      inningsBatted: 4,
      notOuts: 1,
      runs: 116,
      ballsFaced: 82,
      ballsBowled: 24,
      runsConceded: 30,
      wickets: 2,
      bestBowlingWickets: 2,
      bestBowlingRuns: 11,
    } as never);
    expect(s.batting.average).toBe(38.7);
    expect(s.batting.strikeRate).toBe(141.5);
    expect(s.bowling).toMatchObject({
      economy: 7.5,
      average: 15,
      bestFigures: '2/11',
    });
  });
  it('flags missing gear as blocking and fatigue as advice only', () => {
    expect(buildReadiness(10, []).status).toBe('ready');
    expect(buildReadiness(70, []).status).toBe('caution');
    expect(buildReadiness(90, []).issues[0]?.severity).toBe('warning');
    const blocked = buildReadiness(10, ['bat']);
    expect(blocked.status).toBe('blocked');
    expect(blocked.issues[0]?.message).toBe('Bat required before a match.');
  });
  it('clamps objective progress and orders objectives stably', () => {
    const def = {
      id: 'achievement.x',
      name: 'X',
      description: 'd',
      category: 'batting',
      condition: { metric: 'm', operator: 'gte', value: 50 },
      reward: {
        coins: 1,
        playerXp: 2,
        skillXpGrants: [],
        fans: 0,
        reputation: 0,
      },
    } as never;
    expect(
      toObjective(def, {
        progress: 500,
        completed: false,
        rewardClaimed: false,
      }).progress,
    ).toBe(50);
    expect(toObjective(def).progress).toBe(0);
    const a = toObjective(def, {
      progress: 10,
      completed: false,
      rewardClaimed: false,
    });
    const b = { ...a, id: 'achievement.a', progress: 40 };
    expect(sortObjectives([a, b]).map((o) => o.id)).toEqual([
      'achievement.a',
      'achievement.x',
    ]);
  });
  it('presents fixtures with data-driven labels, home/away and results', () => {
    const team = (definitionId: string, id: string) => ({
      id,
      definitionId,
      nameOverride: null,
      active: true,
    });
    const view = (
      over: Record<string, unknown> = {},
      match: unknown = null,
    ) => ({
      fixture: {
        id: '00000000-0000-4000-8000-000000000001',
        careerId: 'c',
        competitionDefinitionId: 'competition.academy.league',
        homeTeamId: 'h',
        awayTeamId: 'a',
        matchFormatId: 'format.5_over',
        scheduledAt: new Date('2026-05-01T15:00:00Z'),
        status: 'scheduled',
        seasonNumber: 1,
        round: 2,
        ...over,
      },
      homeTeam: team('team.academy.riverhawks', 'h'),
      awayTeam: team('team.club.metro_stallions', 'a'),
      match,
    });
    const home = toFixtureSummary(view() as never, 'h');
    expect(home).toMatchObject({
      isHome: true,
      yourTeam: { name: 'River Hawks Academy' },
      opponent: { name: 'Metro Stallions' },
      format: { name: '5 Overs', overs: 5 },
      venue: { name: 'River Hawks Ground' },
      result: null,
    });
    const away = toFixtureSummary(view() as never, 'a');
    expect(away).toMatchObject({
      isHome: false,
      yourTeam: { name: 'Metro Stallions' },
    });
    expect(
      toFixtureSummary(view({ matchFormatId: 'format.99_over' }) as never, 'h')
        .format,
    ).toMatchObject({ id: 'format.99_over', overs: null });
    const done = (winner: string | null, resultType: string) =>
      toFixtureSummary(
        view(
          { status: 'completed' },
          { status: 'completed', resultType, winnerTeamId: winner },
        ) as never,
        'h',
      ).result;
    expect(done('h', 'win')).toBe('won');
    expect(done('a', 'win')).toBe('lost');
    expect(done(null, 'tie')).toBe('tied');
    expect(done(null, 'no_result')).toBe('no_result');
  });
});

describe('presentation helpers (web, ui)', () => {
  it('formats counts for small, boundary and very large values', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1248)).toBe('1,248');
    expect(formatCount(9999)).toBe('9,999');
    expect(formatCount(10_000)).toBe('10K');
    expect(formatCount(18_400)).toBe('18.4K');
    expect(formatCount(1_500_000)).toBe('1.5M');
    expect(formatCount(2_400_000_000)).toBe('2.4B');
    expect(formatCount(Number.NaN)).toBe('0');
    expect(formatCount(-5)).toBe('0');
  });
  it('shows a dash for undefined ratios', () => {
    expect(formatRatio(null)).toBe('—');
    expect(formatRatio(Number.NaN)).toBe('—');
    expect(formatRatio(38.66)).toBe('38.7');
    expect(formatRatio(141.5, 0)).toBe('142');
  });
  it('words dates relative to the viewer day, never ambiguous for the past', () => {
    const now = new Date(2026, 5, 10, 23, 30);
    expect(relativeDay(new Date(2026, 5, 10, 8).toISOString(), now)).toBe(
      'Today',
    );
    expect(relativeDay(new Date(2026, 5, 11, 1).toISOString(), now)).toBe(
      'Tomorrow',
    );
    expect(relativeDay(new Date(2026, 5, 13, 12).toISOString(), now)).toBe(
      'In 3 days',
    );
    expect(relativeDay(new Date(2026, 5, 1).toISOString(), now)).toBe(
      'Available now',
    );
    expect(relativeDay('nonsense', now)).toBe('');
  });
  it('keeps progress maths safe', () => {
    expect(progressPercent(50, 200)).toBe(25);
    expect(progressPercent(500, 200)).toBe(100);
    expect(progressPercent(-5, 200)).toBe(0);
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressPercent(Number.NaN, 10)).toBe(0);
    expect(progressPercent(1, Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampProgress(300, 200)).toBe(200);
    expect(percent(44, 100)).toBe(44);
    expect(percent(1, 0)).toBe(0);
    expect(roleName('top_order_batter')).toBe('Top Order Batter');
  });
});

describe('career web feature hygiene', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  walk('apps/web/src/features/career');
  const code = (f: string) =>
    readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('keeps rules, storage, rendering engines and ad-hoc fetching out of the Career Home', () => {
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) {
      const c = code(f);
      expect(c, f).not.toMatch(
        /@the-cricketer\/game-core|@the-cricketer\/database/,
      );
      expect(c, f).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie/,
      );
      expect(c, f).not.toMatch(
        /from 'three|from "three|phaser|match-engine|player-3d/,
      );
      expect(c, f).not.toMatch(/Math\.random|\bany\b\s*[;,)=>]/);
      if (f.endsWith('.tsx')) expect(c, f).not.toMatch(/\bfetch\(/);
    }
  });
  it('has no way to change currency, XP or progression from the client', () => {
    const everything = files.map(code).join('\n');
    expect(everything).not.toMatch(
      /\bset(Coins|Gems|Xp|Level|Currency|Balance)\b/i,
    );
    expect(everything).not.toMatch(/method:\s*'(PUT|PATCH|DELETE)'/);
    // the only write calls are the intro flag and funnel telemetry
    expect(
      [...everything.matchAll(/send\(\s*'POST',\s*'([^']+)'/g)]
        .map((m) => m[1])
        .sort(),
    ).toEqual(['/onboarding/career_home_intro', '/telemetry']);
  });
});
