import { z } from 'zod';
import { overBallSchema } from './match-play';

/**
 * Match flow contracts (Module 11): team sheets, toss, scorecards, over summaries and the persisted result.
 * Every number here is read from the authoritative server state; the browser may send only a toss call, a
 * bat/bowl choice, and the intents defined in match-play.ts. The request schemas are strict.
 */

export const tossCallSchema = z.enum(['heads', 'tails']);
/** `call` is required only when the player's side is the one calling; the server uses its own call otherwise. */
export const tossCallRequestSchema = z.strictObject({
  call: tossCallSchema.optional(),
});
export type TossCallRequest = z.infer<typeof tossCallRequestSchema>;
export const tossDecisionRequestSchema = z.strictObject({
  decision: z.enum(['bat', 'bowl']),
});
export type TossDecisionRequest = z.infer<typeof tossDecisionRequestSchema>;

/** DEVELOPMENT ONLY (never served in production): arrange how a match that has had no ball ends, then play it out. */
export const devForceResultRequestSchema = z.strictObject({
  matchId: z.uuid(),
  outcome: z.enum(['win', 'loss', 'tie']),
  /** Play the match to its end (default); false only arranges it. */
  play: z.boolean().default(true),
});
export type DevForceResultRequest = z.infer<typeof devForceResultRequestSchema>;
/** DEVELOPMENT ONLY: arrange the (seeded) coin of a match that has not been tossed. */
export const devArrangeTossRequestSchema = z.strictObject({
  matchId: z.uuid(),
  userWins: z.boolean(),
});
export type DevArrangeTossRequest = z.infer<typeof devArrangeTossRequestSchema>;

export const teamSheetPlayerSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  role: z.string(),
  roleName: z.string(),
  battingPosition: z.number().int().min(1),
  battingHand: z.enum(['left', 'right']),
  /** Only for players who bowl. */
  bowlingStyleName: z.string().nullable(),
  /** The player's own overall; hidden (null) for the opposition. */
  overall: z.number().int().nullable(),
  isYou: z.boolean(),
});
export const teamSheetSchema = z.object({
  teamId: z.string(),
  name: z.string(),
  isYours: z.boolean(),
  players: z.array(teamSheetPlayerSchema),
});
export type TeamSheetDto = z.infer<typeof teamSheetSchema>;

export const tossSchema = z.object({
  callerTeamId: z.string(),
  callerName: z.string(),
  /** Your side calls: you choose heads or tails. */
  youCall: z.boolean(),
  call: tossCallSchema.nullable(),
  /** The coin is revealed only once the call has been made. */
  coin: tossCallSchema.nullable(),
  winnerTeamId: z.string().nullable(),
  winnerName: z.string().nullable(),
  youWon: z.boolean().nullable(),
  decision: z.enum(['bat', 'bowl']).nullable(),
  decidedBy: z.enum(['you', 'ai']).nullable(),
  summary: z.string().nullable(),
});
export type TossDto = z.infer<typeof tossSchema>;

export const MATCH_STAGES = [
  'toss',
  'toss_decision',
  'in_progress',
  'innings_break',
  'completed',
  'abandoned',
] as const;
export const matchFlowSchema = z.object({
  matchId: z.string().uuid(),
  stage: z.enum(MATCH_STAGES),
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
    hint: z.string(),
  }),
  venueName: z.string().nullable(),
  competitionName: z.string().nullable(),
  you: z.object({
    playerId: z.string(),
    name: z.string(),
    role: z.string(),
    roleName: z.string(),
    fatigue: z.number().int(),
    form: z.number().int(),
  }),
  yourTeam: teamSheetSchema,
  opponentTeam: teamSheetSchema,
  toss: tossSchema,
  /** The first match of the career: show the short how-to-play guidance. */
  firstMatch: z.boolean(),
  /** The engine has started (the toss decision is made): the live match can be played. */
  started: z.boolean(),
});
export type MatchFlowDto = z.infer<typeof matchFlowSchema>;
export const matchFlowEnvelopeSchema = z.object({ flow: matchFlowSchema });

// ---- scorecard ------------------------------------------------------------------------------------

export const scorecardBatterSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  isYou: z.boolean(),
  /** "b Khan", "caught b Khan", "lbw b Singh", "not out"; null when they have not batted yet. */
  dismissal: z.string().nullable(),
  notOut: z.boolean(),
  /** Currently at the crease. */
  batting: z.boolean(),
  runs: z.number().int(),
  balls: z.number().int(),
  fours: z.number().int(),
  sixes: z.number().int(),
  strikeRate: z.number().nullable(),
});
export const scorecardBowlerSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  isYou: z.boolean(),
  oversText: z.string(),
  maidens: z.number().int(),
  runs: z.number().int(),
  wickets: z.number().int(),
  economy: z.number().nullable(),
});
export const scorecardInningsSchema = z.object({
  number: z.number().int(),
  teamName: z.string(),
  isSuperOver: z.boolean(),
  inProgress: z.boolean(),
  score: z.string(),
  runs: z.number().int(),
  wickets: z.number().int(),
  oversText: z.string(),
  /** "32/2 (5.0 Overs)" */
  total: z.string(),
  runRate: z.number().nullable(),
  target: z.number().int().nullable(),
  extras: z.object({
    total: z.number().int(),
    wides: z.number().int(),
    noBalls: z.number().int(),
    byes: z.number().int(),
    legByes: z.number().int(),
  }),
  batting: z.array(scorecardBatterSchema),
  didNotBat: z.array(z.string()),
  bowling: z.array(scorecardBowlerSchema),
  fallOfWickets: z.array(
    z.object({
      wicket: z.number().int(),
      score: z.number().int(),
      batter: z.string(),
      over: z.string(),
    }),
  ),
});
export const timelineOverSchema = z.object({
  inningsNumber: z.number().int(),
  over: z.number().int(),
  bowler: z.string(),
  runs: z.number().int(),
  wickets: z.number().int(),
  balls: z.array(overBallSchema),
});
export const scorecardSchema = z.object({
  matchId: z.string().uuid(),
  status: z.enum(['in_progress', 'innings_break', 'completed', 'abandoned']),
  format: z.string(),
  pitch: z.string(),
  tossText: z.string().nullable(),
  resultText: z.string().nullable(),
  innings: z.array(scorecardInningsSchema),
  /** Over by over, ball by ball (only when asked for). */
  timeline: z.array(timelineOverSchema).nullable(),
});
export type ScorecardDto = z.infer<typeof scorecardSchema>;
export type ScorecardInningsDto = z.infer<typeof scorecardInningsSchema>;
export const scorecardEnvelopeSchema = z.object({ scorecard: scorecardSchema });

// ---- persisted result ------------------------------------------------------------------------------

export const matchResultSchema = z.object({
  matchId: z.string().uuid(),
  status: z.literal('completed'),
  /** win / loss / tie for the player's side. */
  outcome: z.enum(['win', 'loss', 'tie']),
  resultText: z.string(),
  winnerTeamName: z.string().nullable(),
  superOver: z.boolean(),
  yourTeamName: z.string(),
  opponentName: z.string(),
  format: z.string(),
  innings: z.array(
    z.object({
      number: z.number().int(),
      teamName: z.string(),
      score: z.string(),
      oversText: z.string(),
      isSuperOver: z.boolean(),
    }),
  ),
  you: z.object({
    playerId: z.string(),
    name: z.string(),
    roleName: z.string(),
  }),
  /** Your figures for the match; `tookPart` is false when you neither batted nor bowled. */
  performance: z.object({
    tookPart: z.boolean(),
    rating: z.number().nullable(),
    batting: z
      .object({
        runs: z.number().int(),
        balls: z.number().int(),
        fours: z.number().int(),
        sixes: z.number().int(),
        strikeRate: z.number().nullable(),
        dismissal: z.string().nullable(),
        notOut: z.boolean(),
      })
      .nullable(),
    bowling: z
      .object({
        oversText: z.string(),
        runs: z.number().int(),
        wickets: z.number().int(),
        maidens: z.number().int(),
        economy: z.number().nullable(),
      })
      .nullable(),
  }),
  /** The Player of the Match, if one is awarded (never automatically the player). */
  playerOfTheMatch: z
    .object({ name: z.string(), teamName: z.string(), isYou: z.boolean() })
    .nullable(),
  /** False while the career effects of the match are still being applied (the result itself is already known). */
  processed: z.boolean(),
  rewards: z
    .object({
      coins: z.number().int(),
      playerXp: z.number().int(),
      fans: z.number().int(),
      reputation: z.number().int(),
      selectorInterest: z.number().int(),
      breakdown: z.object({
        participationCoins: z.number().int(),
        resultCoins: z.number().int(),
        performanceCoins: z.number().int(),
        participationXp: z.number().int(),
        resultXp: z.number().int(),
        performanceXp: z.number().int(),
        resultMultiplier: z.number(),
        tierMultiplier: z.number(),
        antiFarmMultiplier: z.number(),
      }),
    })
    .nullable(),
  progression: z
    .object({
      levelBefore: z.number().int(),
      levelAfter: z.number().int(),
      xpAfter: z.number().int(),
      xpToNext: z.number().int().nullable(),
      formBefore: z.number().int(),
      formAfter: z.number().int(),
      formLabel: z.string(),
      fatigueAdded: z.number().int(),
      fatigueAfter: z.number().int(),
    })
    .nullable(),
  stats: z
    .object({
      matches: z.number().int(),
      runs: z.number().int(),
      wickets: z.number().int(),
      highestScore: z.number().int(),
      battingAverage: z.number().nullable(),
      strikeRate: z.number().nullable(),
      economy: z.number().nullable(),
    })
    .nullable(),
  achievements: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      coins: z.number().int(),
      playerXp: z.number().int(),
    }),
  ),
  /** Short plain-language highlights ("Highest score", "3-wicket haul"); only what the stats confirm. */
  milestones: z.array(z.string()),
});
export type MatchResultDto = z.infer<typeof matchResultSchema>;
export const matchResultEnvelopeSchema = z.object({
  result: matchResultSchema,
});
