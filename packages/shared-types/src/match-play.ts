import { z } from 'zod';

/**
 * Match gameplay contracts (Module 9). The browser sends INTENT only - which delivery, where it is
 * aimed, how well the execution meter was timed - and the strict schemas reject any attempt to send
 * a result (runs, wicket, extras, speed, resolved line). Everything the scene needs to draw comes
 * back from the server after the authoritative engine has decided the ball.
 *
 * Pitch coordinates are cricket-relative and normalized (same as the engine):
 *   x: 0 = wide outside OFF .. 1 = wide down the LEG side (relative to the batter's hand)
 *   y: 0 = yorker (batter's feet) .. 1 = bouncer (furthest from the batter)
 */

export const MATCH_PLAY_ERROR_CODES = [
  'MATCH_NOT_FOUND',
  'MATCH_FINISHED',
  'NOT_YOUR_TURN_TO_BOWL',
  'BOWLER_REQUIRED',
  'BOWLER_NOT_ELIGIBLE',
  'STALE_SEQUENCE',
  'ACTION_ID_REUSED',
  'INVALID_DELIVERY',
  'NOTHING_TO_SIMULATE',
  'LAB_DISABLED',
  'NOT_YOUR_TURN_TO_BAT',
  'INVALID_SHOT',
  // Module 11
  'MATCH_NOT_STARTED',
  'INVALID_TOSS_STATE',
  'INVALID_TOSS_DECISION',
  'INVALID_MATCH_STAGE',
  'PLAYER_NOT_PARTICIPANT',
  'MATCH_COMPLETION_ALREADY_PROCESSED',
] as const;
export type MatchPlayErrorCode = (typeof MATCH_PLAY_ERROR_CODES)[number];

export const normalizedTargetSchema = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type NormalizedTargetDto = z.infer<typeof normalizedTargetSchema>;

/** actionId: the client's idempotency token for one delivery; retries reuse it. */
export const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export const deliveryRequestSchema = z.strictObject({
  actionId: z.string().regex(ACTION_ID_PATTERN),
  /** The sequence the client believes is next; a mismatch is rejected as stale. */
  expectedSequence: z.number().int().min(1).max(100000),
  /** Required when a new over starts and a bowler has to be chosen. */
  bowlerId: z.string().min(1).max(64).optional(),
  deliveryIntent: z.strictObject({
    variationId: z.string().min(1).max(64),
    target: normalizedTargetSchema,
    /** 0..1 execution timing from the meter; absent/0.5 is neutral. Assisted play sends nothing. */
    executionInput: z.number().min(0).max(1).optional(),
  }),
});
export type DeliveryRequest = z.infer<typeof deliveryRequestSchema>;

export const simulateRequestSchema = z.strictObject({
  mode: z.enum(['until_my_turn', 'over', 'innings']),
  bowlerId: z.string().min(1).max(64).optional(),
});
export type SimulateRequest = z.infer<typeof simulateRequestSchema>;

const nonNeg = z.number().int().min(0);
const lineSchema = z.enum([
  'wide_off',
  'outside_off',
  'off_stump',
  'middle',
  'leg',
  'wide_leg',
]);
const lengthSchema = z.enum(['yorker', 'full', 'good', 'short', 'bouncer']);

export const deliveryCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Player-facing movement description; never a formula. */
  movement: z.string(),
  difficulty: z.enum(['low', 'medium', 'high']),
  controlCost: z.enum(['low', 'medium', 'high']),
  defaultLength: lengthSchema,
  /** Which family of movement the preview icon should show. */
  family: z.enum(['straight', 'swing', 'seam', 'spin', 'slower']),
});

export const bowlerKindSchema = z.enum(['fast', 'medium', 'spin']);
export const bowlerOptionSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  style: z.string(),
  styleName: z.string(),
  arm: z.enum(['right', 'left']),
  kind: bowlerKindSchema,
  oversBowled: nonNeg,
  maxOvers: nonNeg.nullable(),
  eligible: z.boolean(),
  /** Why an ineligible bowler cannot bowl; null when eligible. */
  reason: z.string().nullable(),
  /** The bowler's own ratings, 0..100, shown on the selection screen and used for the meter window. */
  skills: z.object({
    accuracy: z.number().int(),
    control: z.number().int(),
    consistency: z.number().int(),
    pace: z.number().int(),
    spin: z.number().int(),
  }),
  fatigue: z.number().int().min(0).max(100),
  isYou: z.boolean(),
  deliveryIds: z.array(z.string()),
});
export type BowlerOptionDto = z.infer<typeof bowlerOptionSchema>;

const personSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  runs: nonNeg,
  balls: nonNeg,
  hand: z.enum(['right', 'left']),
});
export const overBallSchema = z.object({
  /** "•", "1", "4", "W", "Wd", "Nb" ... */
  label: z.string(),
  legal: z.boolean(),
  runs: nonNeg,
  wicket: z.boolean(),
});

export const matchPhaseSchema = z.enum([
  'bowler_select',
  'ready_to_bowl',
  /** Your Cricketer is on strike: choose a shot, a direction and time it. */
  'ready_to_bat',
  /** The other side is batting or bowling and no human input is needed: the server can simulate. */
  'simulate_required',
  'innings_break',
  'completed',
  'abandoned',
]);

const inningsCardSchema = z.object({
  number: z.number().int(),
  teamName: z.string(),
  isSuperOver: z.boolean(),
  score: z.string(),
  oversText: z.string(),
  extras: nonNeg,
  batting: z.array(
    z.object({
      name: z.string(),
      runs: nonNeg,
      balls: nonNeg,
      fours: nonNeg,
      sixes: nonNeg,
      dismissal: z.string().nullable(),
      isYou: z.boolean(),
    }),
  ),
  bowling: z.array(
    z.object({
      name: z.string(),
      oversText: z.string(),
      runs: nonNeg,
      wickets: nonNeg,
      maidens: nonNeg,
      economy: z.number().nullable(),
      isYou: z.boolean(),
    }),
  ),
});
export type InningsCardDto = z.infer<typeof inningsCardSchema>;

export const matchPlayStateSchema = z.object({
  matchId: z.string().uuid(),
  status: z.enum([
    'created',
    'ready',
    'in_progress',
    'innings_break',
    'completed',
    'abandoned',
  ]),
  phase: matchPhaseSchema,
  /** The sequence number the next delivery action must carry. */
  expectedSequence: z.number().int().min(1),
  format: z.object({
    id: z.string(),
    name: z.string(),
    oversPerInnings: z.number().int().nullable(),
    ballsPerOver: z.number().int(),
    maxWickets: z.number().int(),
  }),
  pitch: z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(['green', 'hard', 'dry']),
  }),
  you: z.object({
    playerId: z.string(),
    teamId: z.string(),
    teamName: z.string(),
    side: z.enum(['bowling', 'batting']),
    /** Where your Cricketer is right now; `bowling`/`not_batting` when your side is in the field. */
    status: z.enum([
      'on_strike',
      'non_striker',
      'waiting',
      'dismissed',
      'not_batting',
    ]),
  }),
  battingTeam: z.object({ id: z.string(), name: z.string() }),
  bowlingTeam: z.object({ id: z.string(), name: z.string() }),
  innings: z.object({
    number: z.number().int().min(1),
    isSuperOver: z.boolean(),
    runs: nonNeg,
    wickets: nonNeg,
    legalBalls: nonNeg,
    /** Cricket overs notation: 8 legal balls is "1.2". */
    oversText: z.string(),
    maxBalls: nonNeg,
    maxWickets: z.number().int(),
    target: nonNeg.nullable(),
    runsNeeded: nonNeg.nullable(),
    ballsRemaining: nonNeg,
    requiredRate: z.number().nullable(),
    currentRate: z.number().nullable(),
  }),
  previousInnings: z.array(
    z.object({
      number: z.number().int(),
      teamName: z.string(),
      score: z.string(),
    }),
  ),
  striker: personSchema.nullable(),
  nonStriker: personSchema.nullable(),
  currentBowler: z
    .object({
      playerId: z.string(),
      name: z.string(),
      style: z.string(),
      styleName: z.string(),
      arm: z.enum(['right', 'left']),
      kind: bowlerKindSchema,
      oversText: z.string(),
      runs: nonNeg,
      wickets: nonNeg,
      maidens: nonNeg,
      skills: bowlerOptionSchema.shape.skills,
      fatigue: z.number().int().min(0).max(100),
      isYou: z.boolean(),
      deliveryIds: z.array(z.string()),
    })
    .nullable(),
  thisOver: z.array(overBallSchema),
  overNumber: nonNeg,
  /** Only present when a bowler has to be chosen. */
  eligibleBowlers: z.array(bowlerOptionSchema),
  deliveryCatalog: z.record(z.string(), deliveryCardSchema),
  /** The player's own batting and bowling figures; only present once the match is complete. */
  yourPerformance: z
    .object({
      rating: z.number(),
      batting: z
        .object({
          runs: nonNeg,
          balls: nonNeg,
          fours: nonNeg,
          sixes: nonNeg,
          strikeRate: z.number().nullable(),
          dismissal: z.string().nullable(),
          notOut: z.boolean(),
        })
        .nullable(),
      bowling: z
        .object({
          oversText: z.string(),
          runs: nonNeg,
          wickets: nonNeg,
          maidens: nonNeg,
          economy: z.number().nullable(),
        })
        .nullable(),
    })
    .nullable(),
  /** Full innings scorecards; only filled once the match is complete. */
  scorecard: z.array(inningsCardSchema),
  result: z
    .object({
      type: z.enum(['win', 'tie']),
      text: z.string(),
      winnerTeamName: z.string().nullable(),
      youWon: z.boolean().nullable(),
      superOver: z.boolean(),
    })
    .nullable(),
});
export type MatchPlayStateDto = z.infer<typeof matchPlayStateSchema>;
export const matchPlayEnvelopeSchema = z.object({
  match: matchPlayStateSchema,
});

const resolvedSideSchema = z.object({
  target: normalizedTargetSchema,
  line: lineSchema,
  length: lengthSchema,
  lineLabel: z.string(),
  lengthLabel: z.string(),
});

export const resolvedDeliverySchema = z.object({
  variationId: z.string(),
  name: z.string(),
  intended: resolvedSideSchema,
  actual: resolvedSideSchema,
  speedKmh: z.number(),
  speedMs: z.number(),
  /** Signed, batter-relative: negative toward the off side, positive toward the leg side. */
  movement: z.object({ swing: z.number(), seam: z.number(), spin: z.number() }),
  /** 0..1 normalized bounce from the engine. */
  bounce: z.number(),
  executionRating: z.enum(['poor', 'average', 'good', 'excellent']),
  noBall: z.boolean(),
  bowlingArm: z.enum(['right', 'left']),
  battingHand: z.enum(['right', 'left']),
});

export const resolvedShotSchema = z.object({
  shotId: z.string(),
  name: z.string(),
  category: z.string(),
  contactQuality: z.enum(['perfect', 'good', 'okay', 'poor', 'edge', 'miss']),
  sector: z.string(),
  /** Degrees; 0 is straight back down the ground. Positive is the batter's right-hand side. */
  worldDirection: z.number(),
  exitSpeed: z.number(),
  launchAngle: z.number(),
});

export const deliveryOutcomeSchema = z.object({
  runsOffBat: nonNeg,
  extras: nonNeg,
  extraType: z.string().nullable(),
  wicketType: z.string().nullable(),
  legal: z.boolean(),
  totalRuns: nonNeg,
  distanceClass: z.enum(['infield', 'outfield', 'boundary', 'six']),
  /** "FOUR", "WICKET", "WIDE" ... always text, never only an animation. */
  headline: z.string(),
  detail: z.string(),
});

export const matchEventSchema = z.object({
  type: z.string(),
  inningsNumber: z.number().int(),
  playerId: z.string().optional(),
  runs: z.number().int().optional(),
});

export const timingLabelSchema = z.enum([
  'very_early',
  'early',
  'perfect',
  'late',
  'very_late',
]);
export const BATTING_ASSIST_LEVELS = ['off', 'normal', 'high', 'auto'] as const;
export const battingAssistSchema = z.enum(BATTING_ASSIST_LEVELS);

/** What a human batter chose. A SHOT, a direction and a timing error: never a result. */
export const shotRequestSchema = z.strictObject({
  actionId: z.string().regex(ACTION_ID_PATTERN),
  expectedSequence: z.number().int().min(1).max(100000),
  battingIntent: z.strictObject({
    shotId: z.string().min(1).max(64),
    /** -1 strong leg side .. +1 strong off side, relative to the batter's hand. */
    direction: z.number().min(-1).max(1),
    /** Contact-time error: -1 very early .. +1 very late. The server rejects anything outside. */
    timingInput: z.number().min(-1).max(1),
    assist: battingAssistSchema.default('off'),
  }),
});
export type ShotRequest = z.infer<typeof shotRequestSchema>;

/** The delivery the AI bowler is about to bowl: everything a batter can read, and nothing about the outcome. */
export const deliveryPreviewSchema = z.object({
  sequence: z.number().int().min(1),
  inningsNumber: z.number().int(),
  overNumber: z.number().int(),
  ballInOver: z.number().int(),
  bowler: z.object({
    playerId: z.string(),
    name: z.string(),
    style: z.string(),
    styleName: z.string(),
    arm: z.enum(['right', 'left']),
    kind: bowlerKindSchema,
  }),
  delivery: z.object({
    variationId: z.string(),
    name: z.string(),
    /** Where the ball will pitch (the engine's resolved point), used to draw its flight. */
    target: normalizedTargetSchema,
    line: lineSchema,
    length: lengthSchema,
    lineLabel: z.string(),
    lengthLabel: z.string(),
    speedMs: z.number(),
    speedKmh: z.number(),
    movement: z.object({
      swing: z.number(),
      seam: z.number(),
      spin: z.number(),
    }),
    bounce: z.number(),
    bowlingArm: z.enum(['right', 'left']),
    battingHand: z.enum(['right', 'left']),
  }),
  match: matchPlayStateSchema,
});
export type DeliveryPreviewDto = z.infer<typeof deliveryPreviewSchema>;
export const deliveryPreviewEnvelopeSchema = z.object({
  preview: deliveryPreviewSchema,
});

/** Feedback the player sees after a shot. The contact label is the engine's, never the client's. */
export const battingFeedbackSchema = z.object({
  timing: timingLabelSchema,
  /** The normalized timing error the client reported (echoed back for the debug overlay). */
  timingInput: z.number(),
  assist: battingAssistSchema,
  contact: z.enum(['PERFECT', 'GOOD', 'OKAY', 'POOR', 'EDGE', 'MISS']),
});
export type BattingFeedbackDto = z.infer<typeof battingFeedbackSchema>;

/** Attached to the ball that completes an over: the short end-of-over card (Module 11). */
export const overSummarySchema = z.object({
  overNumber: z.number().int(),
  inningsNumber: z.number().int(),
  /** Score after the over: "12/1". */
  score: z.string(),
  runsInOver: z.number().int(),
  wicketsInOver: z.number().int(),
  balls: z.array(overBallSchema),
  bowlerName: z.string(),
  /** "1-0-8-1": overs-maidens-runs-wickets so far in the innings. */
  bowlerFigures: z.string(),
  striker: z.string().nullable(),
  nonStriker: z.string().nullable(),
  /** Chasing: "Need 14 from 8 balls". */
  chase: z.string().nullable(),
});
export type OverSummaryDto = z.infer<typeof overSummarySchema>;

export const deliveryResultSchema = z.object({
  sequence: z.number().int().min(1),
  inningsNumber: z.number().int(),
  overNumber: z.number().int(),
  ballInOver: z.number().int(),
  /** True when this response is the stored result of an action that was already processed. */
  replayed: z.boolean(),
  delivery: resolvedDeliverySchema,
  shot: resolvedShotSchema,
  outcome: deliveryOutcomeSchema,
  /** Present only for a ball the human batted. */
  batting: battingFeedbackSchema.nullable().default(null),
  /** Present only on the ball that completes an over. */
  overSummary: overSummarySchema.nullable().default(null),
  events: z.array(matchEventSchema),
  match: matchPlayStateSchema,
});
export type DeliveryResultDto = z.infer<typeof deliveryResultSchema>;
export const deliveryEnvelopeSchema = z.object({
  delivery: deliveryResultSchema,
});

export const simulatedBallSchema = z.object({
  sequence: z.number().int(),
  inningsNumber: z.number().int(),
  label: z.string(),
  headline: z.string(),
  /** Module 11: the over.ball it was ("1.3") and the running score after it ("12/1"), for the live feed. */
  over: z.string().default(''),
  score: z.string().default(''),
});
export const simulateEnvelopeSchema = z.object({
  simulated: z.array(simulatedBallSchema),
  match: matchPlayStateSchema,
});

/** Developer bowling lab: stateless, one ball, no persistence, disabled in production. */
export const bowlingLabRequestSchema = z.strictObject({
  bowlingStyle: z.enum([
    'right_arm_fast',
    'left_arm_fast',
    'right_arm_medium',
    'left_arm_medium',
    'off_spin',
    'leg_spin',
    'left_arm_orthodox',
    'left_arm_wrist_spin',
  ]),
  battingHand: z.enum(['right', 'left']),
  pitchId: z.enum(['pitch.green', 'pitch.hard', 'pitch.dry']),
  rating: z.number().int().min(1).max(100),
  /** Rating of the AI batter, 1..100 (a weak batter produces misses and edges). */
  batterRating: z.number().int().min(1).max(100).default(55),
  fatigue: z.number().int().min(0).max(100).default(0),
  seed: z.string().min(1).max(64),
  variationId: z.string().min(1).max(64),
  target: normalizedTargetSchema,
  executionInput: z.number().min(0).max(1).optional(),
});
export type BowlingLabRequest = z.infer<typeof bowlingLabRequestSchema>;
export const bowlingLabEnvelopeSchema = z.object({
  delivery: resolvedDeliverySchema,
  shot: resolvedShotSchema,
  outcome: deliveryOutcomeSchema,
  deliveries: z.array(deliveryCardSchema),
});

/** Events the browser may report; the server records the result-driven ones itself after commit. */
export const MATCH_CLIENT_ANALYTICS_EVENTS = [
  'match_scene_loaded',
  'bowling_target_selected',
  'bowling_delivery_selected',
  'bowling_execution_completed',
  'match_visual_error',
  'batting_turn_started',
  'shot_selected',
  'shot_committed',
  'batting_timing_recorded',
  // Module 11
  'match_preparation_viewed',
  'team_sheet_viewed',
  'simulate_until_turn_used',
  'career_player_batting_started',
  'career_player_bowling_started',
  'match_result_viewed',
  'scorecard_viewed',
  'match_exited',
] as const;
export const MATCH_SERVER_ANALYTICS_EVENTS = [
  'delivery_resolved',
  'bowling_wicket',
  'bowling_boundary_conceded',
  'over_completed',
  'batting_contact_result',
  'batting_boundary',
  'batting_wicket',
  'batting_miss',
  // Module 11
  'toss_completed',
  'toss_decision_selected',
  'innings_started',
  'innings_completed',
  'match_completed',
] as const;
export type MatchAnalyticsEvent =
  | (typeof MATCH_CLIENT_ANALYTICS_EVENTS)[number]
  | (typeof MATCH_SERVER_ANALYTICS_EVENTS)[number];
export const matchTelemetrySchema = z.strictObject({
  event: z.enum(MATCH_CLIENT_ANALYTICS_EVENTS),
  /** Low-cardinality context only (e.g. a delivery id, a quality tier); never pointer positions. */
  detail: z.string().max(80).optional(),
});
export type MatchTelemetry = z.infer<typeof matchTelemetrySchema>;

export type DeliveryCardDto = z.infer<typeof deliveryCardSchema>;
export type ResolvedDeliveryDto = z.infer<typeof resolvedDeliverySchema>;
export type ResolvedShotDto = z.infer<typeof resolvedShotSchema>;
export type DeliveryOutcomeDto = z.infer<typeof deliveryOutcomeSchema>;
export type MatchEventDto = z.infer<typeof matchEventSchema>;
export type SimulateResultDto = z.infer<typeof simulateEnvelopeSchema>;
export type BowlingLabResultDto = z.infer<typeof bowlingLabEnvelopeSchema>;

/** Developer batting lab: stateless, one ball, no persistence, disabled in production. */
export const battingLabRequestSchema = z.strictObject({
  battingHand: z.enum(['right', 'left']),
  batterRating: z.number().int().min(1).max(100),
  /** Optional per-attribute overrides for the batter (1..100). */
  batterOverrides: z
    .strictObject({
      timing: z.number().int().min(1).max(100),
      power: z.number().int().min(1).max(100),
      placement: z.number().int().min(1).max(100),
      footwork: z.number().int().min(1).max(100),
      defence: z.number().int().min(1).max(100),
      reflex: z.number().int().min(1).max(100),
    })
    .partial()
    .default({}),
  bowlingStyle: bowlingLabRequestSchema.shape.bowlingStyle,
  bowlerRating: z.number().int().min(1).max(100),
  pitchId: z.enum(['pitch.green', 'pitch.hard', 'pitch.dry']),
  seed: z.string().min(1).max(64),
  variationId: z.string().min(1).max(64),
  target: normalizedTargetSchema,
  shotId: z.string().min(1).max(64),
  direction: z.number().min(-1).max(1),
  timingInput: z.number().min(-1).max(1),
  assist: battingAssistSchema.default('off'),
});
export type BattingLabRequest = z.infer<typeof battingLabRequestSchema>;
export const battingLabEnvelopeSchema = z.object({
  delivery: resolvedDeliverySchema,
  shot: resolvedShotSchema,
  outcome: deliveryOutcomeSchema,
  batting: battingFeedbackSchema,
  /** The timing the engine actually received after skill and assist were applied. */
  engineTimingInput: z.number().nullable(),
  engineDirectionInput: z.number(),
});
export type BattingLabResultDto = z.infer<typeof battingLabEnvelopeSchema>;
