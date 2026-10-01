import { z } from 'zod';

/**
 * Player-creation contracts shared by the API and the web client (Module 4).
 *
 * The request contains ONLY decisions a player may make. Stats, XP, coins, items, career tier and
 * ids are server-generated, so the schema is strict: unknown fields (a smuggled `power: 100`)
 * are rejected, never silently stripped. Choice-like fields are plain strings here on purpose:
 * game-core owns the lists, and the server answers with stable per-field error codes.
 */

/** Mirrors the persisted CHECK on player_profiles.display_name (3-24 code points, trimmed). */
export const DISPLAY_NAME_RULES = { minLength: 3, maxLength: 24 } as const;
export const JERSEY_NUMBER_RULES = { min: 0, max: 99 } as const;
/** Header carrying the client-generated key that makes creation safe to retry. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export const PLAYER_ERROR_CODES = [
  'CRICKETER_ALREADY_EXISTS',
  'CRICKETER_NOT_FOUND',
  'INVALID_PLAYER_NAME',
  'INVALID_COUNTRY',
  'INVALID_JERSEY_NUMBER',
  'INVALID_PLAYER_ROLE',
  'INVALID_BATTING_HAND',
  'INVALID_BOWLING_STYLE',
  'ROLE_BOWLING_STYLE_MISMATCH',
  'INVALID_APPEARANCE_OPTION',
  'INVALID_PERSONALITY_ARCHETYPE',
  'CREATION_CONFIG_CHANGED',
  'IDEMPOTENCY_KEY_REUSED',
  'PLAYER_CREATION_FAILED',
  // Module 5: equipment and appearance editing
  'ITEM_NOT_OWNED',
  'INVALID_EQUIPMENT_SLOT',
  'ITEM_SLOT_MISMATCH',
  'ITEM_UNAVAILABLE',
  'ITEM_REQUIREMENT_NOT_MET',
] as const;
export type PlayerErrorCode = (typeof PLAYER_ERROR_CODES)[number];

/**
 * Canonical form: Unicode NFC, any run of whitespace collapsed to one space, trimmed. Applied
 * on the client for previews and again on the server, which is authoritative.
 */
export function normalizeDisplayName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\s\p{Z}]+/gu, ' ')
    .trim();
}

const ALLOWED_NAME_CHARS = /^[\p{L}\p{M}\p{N} '’.\-_‌‍]+$/u;
export type NameProblem = 'length' | 'characters' | 'no_letters';
/**
 * Unicode-friendly name check on an already-normalised name. Letters and combining marks from
 * every script are fine (Devanagari, Tamil, Arabic, Chinese...). ZWNJ/ZWJ are allowed only
 * between letters/marks because Indic and Persian scripts need them. Control characters,
 * zero-width spaces, bidi overrides, emoji and other symbols are rejected, and a name must contain
 * at least one letter so it cannot be invisible or all punctuation.
 */
export function checkDisplayName(name: string): NameProblem | null {
  const length = Array.from(name).length;
  if (
    length < DISPLAY_NAME_RULES.minLength ||
    length > DISPLAY_NAME_RULES.maxLength
  )
    return 'length';
  if (!ALLOWED_NAME_CHARS.test(name)) return 'characters';
  if (/(?<![\p{L}\p{M}])[‌‍]|[‌‍](?![\p{L}\p{M}])/u.test(name))
    return 'characters';
  if (!/\p{L}/u.test(name)) return 'no_letters';
  return null;
}

const idString = z.string().min(1).max(80);
export const appearanceChoiceSchema = z.strictObject({
  bodyPresetId: idString,
  facePresetId: idString,
  skinToneId: idString,
  hairStyleId: idString,
  hairColorId: idString,
  beardStyleId: idString,
  heightScale: z.number().finite(),
});

export const createPlayerRequestSchema = z.strictObject({
  /** Raw text; normalised and validated server-side (INVALID_PLAYER_NAME). */
  displayName: z.string().max(200),
  countryCode: z.string().max(8),
  jerseyNumber: z.number().finite(),
  battingHand: z.string().max(20),
  primaryRole: z.string().max(40),
  bowlingStyle: z.string().max(40).nullable().optional(),
  appearance: appearanceChoiceSchema,
  personalityArchetypeId: idString,
  /** Version the wizard was built against; informational (the server always applies current rules). */
  gameBalanceVersion: z.string().max(20).optional(),
});
export type CreatePlayerRequest = z.infer<typeof createPlayerRequestSchema>;

const stat = z.number().int().min(1).max(100);
export const attributesSchema = z.object({
  batting: z.object({
    timing: stat,
    power: stat,
    placement: stat,
    defence: stat,
    footwork: stat,
    shotSelection: stat,
    technique: stat,
    consistency: stat,
  }),
  bowling: z.object({
    pace: stat,
    accuracy: stat,
    swing: stat,
    seam: stat,
    spin: stat,
    control: stat,
    variation: stat,
    consistency: stat,
  }),
  physical: z.object({
    strength: stat,
    stamina: stat,
    fitness: stat,
    reflex: stat,
    agility: stat,
    recovery: stat,
  }),
  personality: z.object({
    confidence: stat,
    discipline: stat,
    leadership: stat,
    professionalism: stat,
    riskAppetite: stat,
    teamMindset: stat,
  }),
});
export type PlayerAttributesDto = z.infer<typeof attributesSchema>;

export const overallSchema = z.object({
  player: z.number().int(),
  batting: z.number().int(),
  bowling: z.number().int(),
  physical: z.number().int(),
});

/** Small, stable read model future modules can reuse. Never exposes database internals. */
export const playerSummarySchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  countryCode: z.string(),
  jerseyNumber: z.number().int(),
  primaryRole: z.string(),
  battingHand: z.string(),
  bowlingStyle: z.string().nullable(),
  level: z.number().int(),
  overall: z.number().int(),
  careerTier: z.string(),
  form: z.number().int(),
});
export type PlayerSummary = z.infer<typeof playerSummarySchema>;

export const playerProfileSchema = z.object({
  summary: playerSummarySchema,
  overall: overallSchema,
  attributes: attributesSchema,
  personalityArchetypeId: z.string().nullable(),
  appearance: appearanceChoiceSchema,
  xp: z.number().int(),
  fatigue: z.number().int(),
  /** Every trainable skill with its value and progress toward the next point (Module 7). */
  skills: z.array(
    z.object({
      statKey: z.string(),
      label: z.string(),
      group: z.enum(['batting', 'bowling', 'physical']),
      value: z.number().int(),
      xp: z.number().int().min(0),
      xpToNext: z.number().int().min(0).nullable(),
      maxed: z.boolean(),
    }),
  ),
  career: z.object({
    id: z.uuid(),
    tier: z.string(),
    seasonNumber: z.number().int(),
    reputation: z.number().int(),
    fans: z.number().int(),
    selectorInterest: z.number().int(),
    teamId: z.string().nullable(),
    teamName: z.string().nullable(),
  }),
  equipped: z.array(
    z.object({ slot: z.string(), itemId: z.string(), name: z.string() }),
  ),
  createdAt: z.iso.datetime(),
});
export type PlayerProfileDto = z.infer<typeof playerProfileSchema>;

export const playerEnvelopeSchema = z.object({ player: playerProfileSchema });
export const createPlayerResponseSchema = z.object({
  player: playerProfileSchema,
  /** false when an identical request (same Idempotency-Key) was already completed. */
  created: z.boolean(),
});

const previewSchema = z.object({
  attributes: attributesSchema,
  overall: overallSchema,
});
export const creationOptionsSchema = z.object({
  gameBalanceVersion: z.string(),
  nameRules: z.object({ minLength: z.number(), maxLength: z.number() }),
  jerseyRange: z.object({ min: z.number(), max: z.number() }),
  heightRange: z.object({
    min: z.number(),
    max: z.number(),
    step: z.number(),
    default: z.number(),
  }),
  countries: z.object({
    priority: z.array(z.string()),
    all: z.array(z.string()),
  }),
  battingHands: z.array(z.string()),
  bowlingStyles: z.array(z.object({ id: z.string(), name: z.string() })),
  roles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      strengths: z.array(z.string()),
      typicalPosition: z.string(),
      bowlingExpectation: z.string(),
      bowling: z.enum(['none', 'optional', 'required']),
      allowedBowlingStyles: z.array(z.string()),
      /** Exact starting stats per bowling style ("none" key = no bowling style). */
      previews: z.record(z.string(), previewSchema),
    }),
  ),
  personalities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      leansToward: z.array(z.string()),
      givesUp: z.array(z.string()),
      traits: attributesSchema.shape.personality,
    }),
  ),
  appearance: z.array(
    z.object({
      category: z.enum([
        'body',
        'face',
        'skin',
        'hairStyle',
        'hairColor',
        'beard',
      ]),
      options: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          swatch: z.string().optional(),
        }),
      ),
    }),
  ),
  starter: z.object({
    careerTier: z.string(),
    teamName: z.string(),
    level: z.number().int(),
    coins: z.number().int(),
    gems: z.number().int(),
    loadout: z.array(
      z.object({ slot: z.string(), itemId: z.string(), name: z.string() }),
    ),
  }),
});
export type CreationOptions = z.infer<typeof creationOptionsSchema>;
export const creationOptionsEnvelopeSchema = z.object({
  options: creationOptionsSchema,
});

/** Best-effort funnel events from the wizard (pseudonymous; no personal data). */
export const creationEventSchema = z.discriminatedUnion('event', [
  z.strictObject({ event: z.literal('started') }),
  z.strictObject({
    event: z.literal('step_completed'),
    step: z.number().int().min(1).max(5),
  }),
  z.strictObject({
    event: z.literal('role_selected'),
    role: z.string().max(40),
  }),
]);
export type CreationEvent = z.infer<typeof creationEventSchema>;

// ---- Module 5: inventory, equipment, appearance, viewer telemetry ------------------------------

/** Ids only: names, stats and rarity come from shared static definitions, never from the API. */
export const inventoryItemSchema = z.object({
  inventoryItemId: z.uuid(),
  itemId: z.string(),
  upgradeLevel: z.number().int(),
  /** The slot this instance is equipped in, if any. */
  equippedSlot: z.string().nullable(),
});
export type InventoryItemDto = z.infer<typeof inventoryItemSchema>;
export const inventoryEnvelopeSchema = z.object({
  items: z.array(inventoryItemSchema),
});

export const equipmentEntrySchema = z.object({
  slot: z.string(),
  inventoryItemId: z.uuid(),
  itemId: z.string(),
});
export type EquipmentEntry = z.infer<typeof equipmentEntrySchema>;
export const equipmentEnvelopeSchema = z.object({
  equipment: z.array(equipmentEntrySchema),
});

/** The slot comes from the path and the item from the body; nothing else is accepted. */
export const equipItemRequestSchema = z.strictObject({
  inventoryItemId: z.uuid(),
});
export const equipResultSchema = equipmentEntrySchema;

export const updateAppearanceRequestSchema = z
  .strictObject({
    bodyPresetId: idString,
    facePresetId: idString,
    skinToneId: idString,
    hairStyleId: idString,
    hairColorId: idString,
    beardStyleId: idString,
    heightScale: z.number().finite(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');
export type UpdateAppearanceRequest = z.infer<
  typeof updateAppearanceRequestSchema
>;
export const appearanceEnvelopeSchema = z.object({
  appearance: appearanceChoiceSchema,
});

export const VIEWER_FAILURE_REASONS = [
  'webgl_unsupported',
  'base_asset_failed',
  'optional_asset_failed',
  'context_lost',
  'timeout',
  'unknown',
] as const;
/** Coarse viewer telemetry: a handful of events per visit, never per frame, no personal data. */
export const viewerEventSchema = z.discriminatedUnion('event', [
  z.strictObject({
    event: z.literal('viewer_opened'),
    quality: z.enum(['low', 'medium', 'high']).optional(),
  }),
  z.strictObject({
    event: z.literal('viewer_loaded'),
    durationMs: z.number().int().min(0).max(600000),
    bytes: z.number().int().min(0).max(100_000_000).optional(),
  }),
  z.strictObject({
    event: z.literal('viewer_load_failed'),
    reason: z.enum(VIEWER_FAILURE_REASONS),
  }),
  z.strictObject({
    event: z.literal('equipment_previewed'),
    slot: z.string().regex(/^[a-z_]{1,20}$/),
  }),
]);
export type ViewerEvent = z.infer<typeof viewerEventSchema>;
