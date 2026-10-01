import { z } from 'zod';

/**
 * Training contracts (Module 7). The client sends ONLY a training id (in the path) and an
 * Idempotency-Key header: no skill, XP, fatigue, cost or player id is ever accepted. Everything
 * below is what the server computed and applied.
 */

export const TRAINING_ERROR_CODES = [
  'TRAINING_NOT_FOUND',
  'TRAINING_LOCKED',
  'TRAINING_ROLE_RESTRICTED',
  'TRAINING_STYLE_RESTRICTED',
  'TRAINING_ON_COOLDOWN',
  'FATIGUE_TOO_HIGH',
  'ALREADY_FRESH',
  'INSUFFICIENT_CURRENCY',
  'SKILL_MAXED',
  'TRAINING_ALREADY_PROCESSED',
  'TRAINING_CONFLICT',
  'TRAINING_FAILED',
] as const;
export type TrainingErrorCode = (typeof TRAINING_ERROR_CODES)[number];

export const TRAINING_UNAVAILABLE_REASONS = [
  'locked_level',
  'locked_role',
  'locked_style',
  'cooldown',
  'maxed_skill',
  'blocked_fatigue',
  'already_fresh',
  'insufficient_coins',
  'unsupported_requirement',
] as const;
const reasonSchema = z.enum(TRAINING_UNAVAILABLE_REASONS);
const nonNeg = z.number().int().min(0);
const categorySchema = z.enum(['batting', 'bowling', 'physical']);
const currencySchema = z.enum(['coins', 'gems']);

export const skillTargetSchema = z.object({
  statKey: z.string(),
  label: z.string(),
  description: z.string(),
  /** current attribute value */
  value: z.number().int(),
  /** Skill XP toward the next point */
  xp: nonNeg,
  /** null when maxed */
  xpToNext: nonNeg.nullable(),
  maxed: z.boolean(),
  /** configured XP for this skill and what the player would actually get now */
  baseXp: nonNeg,
  expectedXp: nonNeg,
  /** the skill weighs heavily for the player's role (Module 0 role weights) */
  roleImportant: z.boolean(),
});

export const drillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: categorySchema,
  kind: z.enum(['drill', 'recovery']),
  difficulty: z.enum(['easy', 'medium', 'hard', 'elite']),
  minimumLevel: z.number().int().nullable(),
  cost: z.object({ currency: currencySchema, amount: nonNeg }),
  skills: z.array(skillTargetSchema),
  /** expected values right now; the result of starting is exactly this */
  expected: z.object({
    playerXp: nonNeg,
    fatigueAdded: nonNeg,
    fatigueAfter: nonNeg,
    /** rest only */
    fatigueRecovered: nonNeg,
    efficiencyPercent: z.number().int(),
  }),
  available: z.boolean(),
  reason: reasonSchema.nullable(),
  detail: z
    .object({
      requiredLevel: z.number().int().optional(),
      requiredCoins: nonNeg.optional(),
      haveCoins: nonNeg.optional(),
      fatigue: nonNeg.optional(),
      matchesRemaining: nonNeg.optional(),
    })
    .nullable(),
  /** the drill's main skill matters for the player's role */
  forYourRole: z.boolean(),
  recommended: z.boolean(),
});
export type DrillDto = z.infer<typeof drillSchema>;

export const recommendationSchema = z.object({
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
});

export const trainingHubSchema = z.object({
  enabled: z.boolean(),
  player: z.object({
    level: z.number().int(),
    isMaxLevel: z.boolean(),
    xp: nonNeg,
    xpToNext: nonNeg.nullable(),
    role: z.string(),
    coins: nonNeg,
  }),
  readiness: z.object({
    fatigue: z.number().int().min(0).max(100),
    state: z.enum(['ready', 'tired', 'exhausted']),
    /** how much of a drill's XP the player would get from fatigue and daily load alone */
    efficiencyPercent: z.number().int(),
    drillsToday: nonNeg,
    restsToday: nonNeg,
    /** fatigue is so high that drills are blocked (rest is always available) */
    blocked: z.boolean(),
    message: z.string().nullable(),
  }),
  recommendation: recommendationSchema.nullable(),
  categories: z.array(
    z.object({
      category: categorySchema,
      name: z.string(),
      drills: z.array(drillSchema),
    }),
  ),
  recovery: drillSchema,
  development: z.object({
    overall: z.object({
      batting: z.number().int(),
      bowling: z.number().int(),
      physical: z.number().int(),
    }),
    week: z.object({
      sessions: nonNeg,
      rests: nonNeg,
      improvements: z.array(
        z.object({ label: z.string(), points: z.number().int() }),
      ),
    }),
  }),
  lastSession: z
    .object({
      name: z.string(),
      completedAt: z.iso.datetime(),
      kind: z.enum(['drill', 'recovery']),
    })
    .nullable(),
});
export type TrainingHubDto = z.infer<typeof trainingHubSchema>;
export const trainingHubEnvelopeSchema = z.object({ hub: trainingHubSchema });
export const trainingDetailEnvelopeSchema = z.object({ drill: drillSchema });

export const skillResultSchema = z.object({
  statKey: z.string(),
  label: z.string(),
  xpGained: nonNeg,
  xpBefore: nonNeg,
  xpAfter: nonNeg,
  xpToNextAfter: nonNeg.nullable(),
  valueBefore: z.number().int(),
  valueAfter: z.number().int(),
  maxed: z.boolean(),
});
export const trainingResultSchema = z.object({
  sessionId: z.string().uuid(),
  trainingId: z.string(),
  name: z.string(),
  kind: z.enum(['drill', 'recovery']),
  completedAt: z.iso.datetime(),
  /** true when this exact request was already processed and this is the stored answer */
  replayed: z.boolean(),
  playerXp: z.object({
    gained: nonNeg,
    levelBefore: z.number().int(),
    levelAfter: z.number().int(),
    xpBefore: nonNeg,
    xpAfter: nonNeg,
    xpToNext: nonNeg.nullable(),
  }),
  skills: z.array(skillResultSchema),
  fatigue: z.object({ before: z.number().int(), after: z.number().int() }),
  currency: z
    .object({ type: currencySchema, spent: nonNeg, balanceAfter: nonNeg })
    .nullable(),
  /** overall ratings after the session, so the screen can show a change without a refetch */
  overall: z.object({ player: z.number().int() }),
  balanceVersion: z.string(),
});
export type TrainingResultDto = z.infer<typeof trainingResultSchema>;
export const trainingResultEnvelopeSchema = z.object({
  result: trainingResultSchema,
});

export const trainingHistoryItemSchema = z.object({
  sessionId: z.string().uuid(),
  trainingId: z.string(),
  name: z.string(),
  kind: z.enum(['drill', 'recovery']),
  completedAt: z.iso.datetime(),
  skills: z.array(
    z.object({
      label: z.string(),
      xpGained: nonNeg,
      valueBefore: z.number().int(),
      valueAfter: z.number().int(),
    }),
  ),
  playerXpGained: nonNeg,
  levelUps: nonNeg,
  fatigue: z.object({ before: z.number().int(), after: z.number().int() }),
  coinsSpent: nonNeg,
});
export const trainingHistoryPageSchema = z.object({
  items: z.array(trainingHistoryItemSchema),
  nextCursor: z.string().nullable(),
});

export const TRAINING_ANALYTICS_EVENTS = [
  'training_hub_viewed',
  'training_selected',
] as const;
export const trainingTelemetrySchema = z.strictObject({
  event: z.enum(TRAINING_ANALYTICS_EVENTS),
  trainingId: z
    .string()
    .regex(/^training\.[a-z_]+\.[a-z_]+$/)
    .optional(),
});
export type TrainingTelemetryEvent = z.infer<typeof trainingTelemetrySchema>;

/** Stored with every completed session: enough to replay the answer and explain history later. */
export const TRAINING_OUTCOME_VERSION = 1;
