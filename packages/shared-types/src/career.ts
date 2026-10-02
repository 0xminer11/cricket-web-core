import { z } from 'zod';

/**
 * Career Home contracts (Module 6). These are read-only summaries: nothing in them can change
 * progression, currency or schedule. Persistence ids (users, sessions, wallet rows) never appear;
 * fixture and event ids are included only because a link needs them, and the server resolves
 * every one of them against the caller's own career.
 */

export const CAREER_ERROR_CODES = [
  'CAREER_NOT_FOUND',
  'CAREER_NOT_INITIALIZED',
  'FIXTURE_NOT_FOUND',
  'CAREER_EVENT_NOT_FOUND',
  'ONBOARDING_STEP_UNKNOWN',
  'CAREER_DATA_UNAVAILABLE',
] as const;
export type CareerErrorCode = (typeof CAREER_ERROR_CODES)[number];

export const careerTierIdSchema = z.enum([
  'academy',
  'club',
  'district',
  'domestic',
  'franchise',
  'international',
]);
const roleSchema = z.string().min(1).max(40);
const nonNegInt = z.number().int().min(0);

export const homePlayerSchema = z.object({
  displayName: z.string(),
  primaryRole: roleSchema,
  countryCode: z.string(),
  jerseyNumber: z.number().int(),
  battingHand: z.enum(['right', 'left']),
  overall: z.number().int(),
  /** just enough to draw the lightweight 2D portrait (no 3D assets are involved) */
  portrait: z.object({
    skinColor: z.string(),
    hairColor: z.string(),
    bald: z.boolean(),
    beard: z.boolean(),
  }),
});

export const progressionSummarySchema = z.object({
  level: z.number().int().min(1),
  levelCap: z.number().int(),
  isMaxLevel: z.boolean(),
  xp: nonNegInt,
  /** null at the level cap */
  xpToNext: nonNegInt.nullable(),
  form: z.number().int().min(0).max(100),
  formLabel: z.string(),
  formBand: z.enum(['very_poor', 'poor', 'average', 'good', 'excellent']),
  /** null when there is not enough match history to say anything */
  formTrend: z.enum(['up', 'down', 'flat']).nullable(),
  fatigue: z.number().int().min(0).max(100),
  readiness: z.enum(['ready', 'tired', 'exhausted']),
});

export const currencySummarySchema = z.object({
  code: z.enum(['coins', 'gems']),
  name: z.string(),
  balance: nonNegInt,
});

export const tierStepSchema = z.object({
  id: careerTierIdSchema,
  name: z.string(),
  status: z.enum(['completed', 'current', 'locked']),
  minReputation: nonNegInt,
});
export const careerSummarySchema = z.object({
  tier: careerTierIdSchema,
  tierName: z.string(),
  teamName: z.string().nullable(),
  teamShortName: z.string().nullable(),
  season: z.number().int().min(1),
  reputation: nonNegInt,
  reputationMax: z.number().int(),
  fans: nonNegInt,
  selectorInterest: nonNegInt,
  selectorInterestMax: z.number().int(),
  tiers: z.array(tierStepSchema),
  nextTier: tierStepSchema.nullable(),
});

const teamRefSchema = z.object({
  name: z.string(),
  shortName: z.string(),
  rating: z.number().int(),
});
export const fixtureStatusSchema = z.enum([
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'postponed',
]);
export const fixtureSummarySchema = z.object({
  id: z.string().uuid(),
  status: fixtureStatusSchema,
  competition: z.object({ id: z.string(), name: z.string() }),
  format: z.object({
    id: z.string(),
    name: z.string(),
    overs: z.number().int().nullable(),
  }),
  yourTeam: teamRefSchema,
  opponent: teamRefSchema,
  isHome: z.boolean(),
  venue: z.object({ id: z.string(), name: z.string() }),
  pitch: z
    .object({ id: z.string(), name: z.string(), hint: z.string() })
    .nullable(),
  scheduledAt: z.iso.datetime(),
  round: z.number().int(),
  season: z.number().int(),
  /** completed fixtures only */
  result: z.enum(['won', 'lost', 'tied', 'no_result']).nullable(),
  /** The match created for this fixture (in progress or finished), so Career Home can resume it. */
  matchId: z.string().uuid().nullable().default(null),
});
export type FixtureSummary = z.infer<typeof fixtureSummarySchema>;

export const readinessIssueSchema = z.object({
  code: z.enum(['EQUIPMENT_MISSING', 'FATIGUE_HIGH', 'FATIGUE_VERY_HIGH']),
  severity: z.enum(['info', 'warning', 'blocking']),
  message: z.string(),
});
export const matchReadinessSchema = z.object({
  status: z.enum(['ready', 'caution', 'blocked']),
  issues: z.array(readinessIssueSchema),
});

export const statsSummarySchema = z.object({
  focus: z.enum(['batting', 'bowling', 'all_round']),
  matches: nonNegInt,
  wins: nonNegInt,
  /** null ratios mean "undefined" (no dismissals / no balls), never NaN */
  batting: z.object({
    runs: nonNegInt,
    average: z.number().nullable(),
    strikeRate: z.number().nullable(),
    highestScore: nonNegInt,
    fifties: nonNegInt,
    hundreds: nonNegInt,
  }),
  bowling: z.object({
    wickets: nonNegInt,
    economy: z.number().nullable(),
    average: z.number().nullable(),
    bestFigures: z.string().nullable(),
  }),
});

export const recentMatchSchema = z.object({
  matchId: z.string().uuid(),
  opponentName: z.string(),
  formatName: z.string(),
  result: z.enum(['won', 'lost', 'tied', 'no_result']),
  scoreLine: z.string().nullable(),
  performanceRating: z.number().nullable(),
  completedAt: z.iso.datetime().nullable(),
});

export const objectiveSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  progress: nonNegInt,
  target: z.number().int().min(1),
  completed: z.boolean(),
  reward: z.object({
    coins: nonNegInt,
    xp: nonNegInt,
    fans: nonNegInt,
    reputation: nonNegInt,
  }),
  rewardClaimed: z.boolean(),
});
export type ObjectiveSummary = z.infer<typeof objectiveSummarySchema>;

export const careerEventSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  type: z.string(),
  status: z.enum(['pending', 'resolved', 'expired', 'dismissed']),
  triggeredAt: z.iso.datetime(),
});
export const careerEventDetailSchema = careerEventSummarySchema.extend({
  /** labels only: effects, weights and cooldowns are internal configuration */
  choices: z.array(z.object({ id: z.string(), label: z.string() })),
  selectedChoiceId: z.string().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
});

export const contractSummarySchema = z.object({
  teamName: z.string(),
  role: z.string(),
  matchesPlayed: nonNegInt,
  durationMatches: z.number().int(),
  matchFeeCoins: nonNegInt,
});

const equippedPieceSchema = z.object({ itemId: z.string(), name: z.string() });
export const equippedSummarySchema = z.object({
  bat: equippedPieceSchema.nullable(),
  kit: equippedPieceSchema.nullable(),
  equippedCount: nonNegInt,
  missingRequired: z.array(z.string()),
});

export const trainingRecommendationSchema = z.object({
  trainingId: z.string(),
  name: z.string(),
  reason: z.enum([
    'weakest_role_skill',
    'close_to_next_point',
    'recover_first',
    'no_options',
  ]),
  explanation: z.string(),
  statLabel: z.string().nullable(),
  statValue: z.number().int().nullable(),
  category: z.enum(['batting', 'bowling', 'physical']),
  /** fatigue the session would add (rest: 0) */
  fatigueAdded: nonNegInt,
  cost: z.object({ currency: z.enum(['coins', 'gems']), amount: nonNegInt }),
});
export const lastTrainingSchema = z.object({
  name: z.string(),
  completedAt: z.iso.datetime(),
  /** skills that went up in that session, e.g. "Timing 52 -> 53" */
  improvements: z.array(z.string()),
});

export const personalitySummarySchema = z.object({
  archetype: z.string(),
  confidence: z.number().int(),
  discipline: z.number().int(),
});

export const careerHomeSchema = z.object({
  player: homePlayerSchema,
  progression: progressionSummarySchema,
  currencies: z.array(currencySummarySchema),
  career: careerSummarySchema,
  nextMatch: fixtureSummarySchema.nullable(),
  readiness: matchReadinessSchema,
  upcomingFixtures: z.array(fixtureSummarySchema),
  recentMatches: z.array(recentMatchSchema),
  stats: statsSummarySchema,
  objectives: z.array(objectiveSummarySchema),
  achievements: z.object({ completed: nonNegInt, total: nonNegInt }),
  /** null when nothing is pending, or when this optional widget could not be read */
  careerEvent: careerEventSummarySchema.nullable(),
  contract: contractSummarySchema.nullable(),
  equipped: equippedSummarySchema,
  training: trainingRecommendationSchema.nullable(),
  lastTraining: lastTrainingSchema.nullable(),
  personality: personalitySummarySchema,
  onboarding: z.object({ introCompleted: z.boolean() }),
  features: z.object({
    training: z.boolean(),
    matches: z.boolean(),
    shop: z.boolean(),
  }),
  /** sections that failed to load and were left out (the rest of the page still renders) */
  degraded: z.array(z.enum(['careerEvent', 'objectives', 'recentMatches'])),
  gameVersion: z.string(),
});
export type CareerHomeDto = z.infer<typeof careerHomeSchema>;
export const careerHomeEnvelopeSchema = z.object({ home: careerHomeSchema });

export const fixturePageSchema = z.object({
  items: z.array(fixtureSummarySchema),
  nextCursor: z.string().nullable(),
});
export const CAREER_FIXTURE_FILTERS = ['upcoming', 'completed'] as const;

export const historyEntrySchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  season: z.number().int().nullable(),
  occurredAt: z.iso.datetime(),
});
export const historyPageSchema = z.object({
  items: z.array(historyEntrySchema),
  nextCursor: z.string().nullable(),
});

export const progressionPageSchema = z.object({
  career: careerSummarySchema,
  progression: progressionSummarySchema,
  guidance: z.string(),
});
export const objectivesPageSchema = z.object({
  active: z.array(objectiveSummarySchema),
  completed: z.array(objectiveSummarySchema),
});
export const eventsPageSchema = z.object({
  items: z.array(careerEventSummarySchema),
  nextCursor: z.string().nullable(),
});
export const eventEnvelopeSchema = z.object({ event: careerEventDetailSchema });

export const ONBOARDING_STEPS = ['career_home_intro'] as const;
export const onboardingParamSchema = z.enum(ONBOARDING_STEPS);

export const CAREER_ANALYTICS_EVENTS = [
  'career_home_viewed',
  'next_match_opened',
  'training_opened',
  'dressing_room_opened',
  'player_profile_opened',
  'career_progression_opened',
  'fixture_list_opened',
] as const;
export const careerEventTelemetrySchema = z.strictObject({
  event: z.enum(CAREER_ANALYTICS_EVENTS),
});
export type CareerAnalyticsEvent = (typeof CAREER_ANALYTICS_EVENTS)[number];
