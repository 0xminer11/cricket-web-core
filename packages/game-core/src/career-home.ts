import { CAREER_TIERS } from './config/career.config';
import { MATCH_FORMATS } from './config/match.config';
import { PITCHES } from './config/pitch.config';
import { PLAYER_CONFIG, xpToNextLevel } from './config/player.config';
import { TEAMS } from './seed/teams.seed';
import type {
  CareerTierId,
  MatchFormatId,
  PitchId,
  TeamId,
} from './types/common.types';
import type { PlayerRole } from './types/player.types';

/**
 * Presentation rules for the Career Home (Module 6). Everything here is DISPLAY configuration
 * derived from Module 0 values; no balance number is changed. Pure and platform independent so
 * the API (authoritative read model) and the web (labels) share one definition.
 */

// ---- career tiers ---------------------------------------------------------------------------

export const CAREER_TIER_ORDER: readonly CareerTierId[] = CAREER_TIERS.map(
  (t) => t.id,
);
/** Module 0 stores stable tier ids only; these are the friendly names (never persistence keys). */
export const TIER_PRESENTATION: Readonly<
  Record<CareerTierId, { readonly name: string; readonly blurb: string }>
> = {
  academy: {
    name: 'Academy',
    blurb: 'Learn the game and earn your first caps.',
  },
  club: { name: 'Club', blurb: 'Prove yourself against organised clubs.' },
  district: { name: 'District', blurb: 'Represent your district.' },
  domestic: { name: 'Domestic', blurb: 'Compete in the domestic circuit.' },
  franchise: { name: 'Franchise', blurb: 'Star in the franchise leagues.' },
  international: { name: 'International', blurb: 'Play for your country.' },
};

export interface TierStep {
  readonly id: CareerTierId;
  readonly name: string;
  readonly status: 'completed' | 'current' | 'locked';
  readonly minReputation: number;
}
export function tierPath(current: CareerTierId): readonly TierStep[] {
  const at = CAREER_TIER_ORDER.indexOf(current);
  return CAREER_TIERS.map((t, i) => ({
    id: t.id,
    name: TIER_PRESENTATION[t.id].name,
    status: i < at ? 'completed' : i === at ? 'current' : 'locked',
    minReputation: t.minReputation,
  }));
}
export function nextTier(current: CareerTierId): TierStep | null {
  return tierPath(current).find((t) => t.status === 'locked') ?? null;
}

// ---- level and XP ---------------------------------------------------------------------------

export interface XpProgress {
  readonly level: number;
  readonly levelCap: number;
  readonly isMaxLevel: boolean;
  readonly xp: number;
  /** XP needed to complete this level; null at the level cap (no impossible next target). */
  readonly xpToNext: number | null;
}
export function xpProgress(level: number, currentXp: number): XpProgress {
  const cap = PLAYER_CONFIG.levelCap;
  const isMax = level >= cap;
  return {
    level,
    levelCap: cap,
    isMaxLevel: isMax,
    xp: Math.max(0, Math.floor(currentXp)),
    xpToNext: isMax ? null : xpToNextLevel(level),
  };
}

// ---- form and fatigue ------------------------------------------------------------------------

export type FormBandId =
  'very_poor' | 'poor' | 'average' | 'good' | 'excellent';
/**
 * Module 0 defines the form range (0..100, neutral 50) but no labels. These bands only name five
 * equal parts of that range around the neutral point; they never feed a calculation.
 */
export const FORM_BANDS: readonly {
  readonly id: FormBandId;
  readonly label: string;
  readonly min: number;
  readonly max: number;
}[] = [
  { id: 'very_poor', label: 'Very Poor', min: 0, max: 19 },
  { id: 'poor', label: 'Poor', min: 20, max: 39 },
  { id: 'average', label: 'Average', min: 40, max: 59 },
  { id: 'good', label: 'Good', min: 60, max: 79 },
  { id: 'excellent', label: 'Excellent', min: 80, max: 100 },
];
export function formBand(form: number): (typeof FORM_BANDS)[number] {
  const f = Math.min(
    PLAYER_CONFIG.form.max,
    Math.max(PLAYER_CONFIG.form.min, Math.round(form)),
  );
  return FORM_BANDS.find((b) => f >= b.min && f <= b.max) ?? FORM_BANDS[2]!;
}

/**
 * Trend from the last performance ratings (newest first): compares the newest rating with the
 * average of the earlier ones. null when there is not enough history; nothing is invented.
 */
export function ratingTrend(
  ratingsNewestFirst: readonly number[],
): 'up' | 'down' | 'flat' | null {
  if (ratingsNewestFirst.length < 3) return null;
  const [latest, ...earlier] = ratingsNewestFirst as [number, ...number[]];
  const avg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  if (latest - avg >= 0.5) return 'up';
  if (avg - latest >= 0.5) return 'down';
  return 'flat';
}

export type FatigueState = 'ready' | 'tired' | 'exhausted';
/** Uses only the Module 0 fatigue thresholds (soft warning 60, hard penalty from 75). */
export function fatigueState(fatigue: number): FatigueState {
  if (fatigue >= PLAYER_CONFIG.fatigue.hardPenaltyStart) return 'exhausted';
  if (fatigue >= PLAYER_CONFIG.fatigue.softWarning) return 'tired';
  return 'ready';
}

/** Gear a player cannot enter a match without (Module 4/5 equip it at creation, so this is a guard). */
export const MATCH_REQUIRED_SLOTS = ['bat'] as const;
export const EQUIPMENT_SLOT_LABELS: Readonly<Record<string, string>> = {
  bat: 'Bat',
  helmet: 'Helmet',
  gloves: 'Gloves',
  pads: 'Pads',
  shoes: 'Shoes',
  jersey: 'Kit',
  pants: 'Trousers',
};

// ---- competitions, venues, pitches ---------------------------------------------------------

export const COMPETITIONS: Readonly<
  Record<
    CareerTierId,
    { readonly id: `competition.${string}`; readonly name: string }
  >
> = {
  academy: { id: 'competition.academy.league', name: 'Academy League' },
  club: { id: 'competition.club.league', name: 'Club League' },
  district: { id: 'competition.district.league', name: 'District League' },
  domestic: { id: 'competition.domestic.league', name: 'Domestic League' },
  franchise: { id: 'competition.franchise.league', name: 'Franchise League' },
  international: {
    id: 'competition.international.series',
    name: 'International Series',
  },
};
export const COMPETITION_BY_ID: ReadonlyMap<
  string,
  { readonly id: string; readonly name: string; readonly tier: CareerTierId }
> = new Map(
  (
    Object.entries(COMPETITIONS) as [
      CareerTierId,
      { id: string; name: string },
    ][]
  ).map(([tier, c]) => [c.id, { ...c, tier }]),
);

export interface VenueDefinition {
  readonly id: `venue.${string}`;
  readonly name: string;
  readonly homeTeamId: TeamId;
  readonly pitchId: PitchId;
}
/** Generic fictional grounds (no stadium assets): one home ground per Module 0 team. */
export const VENUES: readonly VenueDefinition[] = [
  {
    id: 'venue.riverhawks_ground',
    name: 'River Hawks Ground',
    homeTeamId: 'team.academy.riverhawks',
    pitchId: 'pitch.green',
  },
  {
    id: 'venue.metro_oval',
    name: 'Metro Oval',
    homeTeamId: 'team.club.metro_stallions',
    pitchId: 'pitch.hard',
  },
  {
    id: 'venue.coastal_park',
    name: 'Coastal Park',
    homeTeamId: 'team.district.coastal_blaze',
    pitchId: 'pitch.dry',
  },
  {
    id: 'venue.deccan_arena',
    name: 'Deccan Arena',
    homeTeamId: 'team.domestic.deccan_falcons',
    pitchId: 'pitch.hard',
  },
  {
    id: 'venue.capital_stadium',
    name: 'Capital Stadium',
    homeTeamId: 'team.franchise.capital_comets',
    pitchId: 'pitch.green',
  },
];
export const VENUE_BY_TEAM: ReadonlyMap<string, VenueDefinition> = new Map(
  VENUES.map((v) => [v.homeTeamId, v]),
);
export const GENERIC_VENUE = {
  id: 'venue.neutral_ground',
  name: 'Neutral Ground',
} as const;

/** Short expectation per Module 0 pitch (derived from which multiplier each pitch favours). */
export const PITCH_PRESENTATION: Readonly<Record<PitchId, string>> = {
  'pitch.green': 'More seam and swing movement expected.',
  'pitch.hard': 'True bounce and pace; good for strokeplay.',
  'pitch.dry': 'Spinners are likely to grip as the match goes on.',
};
export const PITCH_BY_ID: ReadonlyMap<string, (typeof PITCHES)[number]> =
  new Map(PITCHES.map((p) => [p.id, p]));

export interface MatchFormatLabel {
  readonly id: string;
  readonly name: string;
  readonly overs: number | null;
}
/** Labels come from Module 0 formats, so a future format needs no UI change. */
export function formatLabel(id: string): MatchFormatLabel {
  const f = MATCH_FORMATS.find((x) => x.id === id);
  return f
    ? { id: f.id, name: f.displayName, overs: f.oversPerInnings }
    : {
        id,
        name: id.replace(/^format\./, '').replaceAll('_', ' '),
        overs: null,
      };
}

// ---- starter fixtures --------------------------------------------------------------------------

export const STARTER_FIXTURE_CONFIG = {
  /** How many scheduled matches a new career receives (a short run-in, not a season). */
  count: 5,
  /** The first fixture becomes available this many days after the career starts. */
  firstAfterDays: 1,
  daysBetween: 3,
  /** UTC hour of day the fixtures are scheduled for. */
  hourUtc: 15,
} as const;

export interface PlannedFixture {
  readonly competitionDefinitionId: string;
  readonly homeTeamDefinitionId: TeamId;
  readonly awayTeamDefinitionId: TeamId;
  readonly matchFormatId: MatchFormatId;
  readonly scheduledAt: Date;
  readonly round: number;
  readonly seasonNumber: number;
}

/**
 * The first few fixtures of a new career, fully determined by (career start, tier, team): the
 * opponents are the other fictional teams ordered by closeness of rating, formats rotate through
 * the Module 0 list, and home/away alternate. Calling it again with the same input yields the
 * same plan, which is what makes bootstrapping idempotent and testable.
 */
export function planStarterFixtures(input: {
  readonly careerStartedAt: Date;
  readonly tier: CareerTierId;
  readonly playerTeamId: TeamId;
  readonly seasonNumber?: number;
}): readonly PlannedFixture[] {
  const own = TEAMS.find((t) => t.teamId === input.playerTeamId);
  const opponents = TEAMS.filter((t) => t.teamId !== input.playerTeamId)
    .map((t) => ({
      id: t.teamId,
      gap: Math.abs(t.rating - (own?.rating ?? t.rating)),
    }))
    .sort((a, b) => a.gap - b.gap || a.id.localeCompare(b.id));
  if (!opponents.length) return [];
  const { count, firstAfterDays, daysBetween, hourUtc } =
    STARTER_FIXTURE_CONFIG;
  const day0 = Date.UTC(
    input.careerStartedAt.getUTCFullYear(),
    input.careerStartedAt.getUTCMonth(),
    input.careerStartedAt.getUTCDate(),
    hourUtc,
  );
  return Array.from({ length: count }, (_, i) => {
    const opponent = opponents[i % opponents.length]!.id;
    const home = i % 2 === 0;
    return {
      competitionDefinitionId: COMPETITIONS[input.tier].id,
      homeTeamDefinitionId: home ? input.playerTeamId : opponent,
      awayTeamDefinitionId: home ? opponent : input.playerTeamId,
      matchFormatId: MATCH_FORMATS[i % MATCH_FORMATS.length]!.id,
      scheduledAt: new Date(
        day0 + (firstAfterDays + i * daysBetween) * 24 * 60 * 60 * 1000,
      ),
      round: i + 1,
      seasonNumber: input.seasonNumber ?? 1,
    };
  });
}

/** What a role's career summary should emphasise (one dashboard, role-aware content). */
export type StatFocus = 'batting' | 'bowling' | 'all_round';
export function statFocus(role: PlayerRole): StatFocus {
  if (role === 'batting_all_rounder' || role === 'bowling_all_rounder')
    return 'all_round';
  return role.endsWith('bowler') ? 'bowling' : 'batting';
}

// ---- validation -------------------------------------------------------------------------------

/** Cross-checks the presentation config against Module 0 (called from validateGameDefinitions). */
export function validateCareerHomeConfig(): readonly string[] {
  const errors: string[] = [];
  for (const t of CAREER_TIERS) {
    if (!TIER_PRESENTATION[t.id])
      errors.push(`Tier ${t.id} has no presentation`);
    if (!COMPETITIONS[t.id]) errors.push(`Tier ${t.id} has no competition`);
  }
  let expected = 0;
  for (const b of FORM_BANDS) {
    if (b.min !== expected)
      errors.push(`Form bands are not contiguous at ${b.id}`);
    expected = b.max + 1;
  }
  if (expected - 1 !== PLAYER_CONFIG.form.max)
    errors.push('Form bands do not cover the Module 0 form range');
  const pitchIds = new Set<string>(PITCHES.map((p) => p.id));
  const teamIds = new Set<string>(TEAMS.map((t) => t.teamId));
  for (const p of PITCHES)
    if (!PITCH_PRESENTATION[p.id])
      errors.push(`Pitch ${p.id} has no description`);
  for (const v of VENUES) {
    if (!teamIds.has(v.homeTeamId)) errors.push(`${v.id}: unknown team`);
    if (!pitchIds.has(v.pitchId)) errors.push(`${v.id}: unknown pitch`);
  }
  for (const t of TEAMS)
    if (!VENUE_BY_TEAM.has(t.teamId))
      errors.push(`${t.teamId} has no home ground`);
  for (const t of TEAMS) {
    const plan = planStarterFixtures({
      careerStartedAt: new Date(0),
      tier: t.careerTier,
      playerTeamId: t.teamId,
    });
    if (plan.length !== STARTER_FIXTURE_CONFIG.count)
      errors.push(`Starter fixtures for ${t.teamId} are incomplete`);
  }
  return errors;
}
