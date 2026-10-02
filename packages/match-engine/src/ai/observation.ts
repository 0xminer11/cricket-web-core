import { ENGINE_BALANCE as B, MATCH_FORMATS, SHOTS } from '@the-cricketer/game-core';
import type {
  AIBatterView,
  AIBowlerView,
  BallRecord,
  MatchSituation,
  RngStreams,
} from '@the-cricketer/game-core';
import { MatchRandom } from '../rng/seeded';
import { calculateEffectiveMatchAttributes, clamp } from '../modifiers/effective';
import type {
  CreateMatchInput,
  EngineBallResult,
  EngineInnings,
  EngineMatchState,
  MatchPlayerSnapshot,
  MatchTeamSnapshot,
} from '../state/types';

/**
 * Builders that turn the engine's state into what the AI may observe (Module 12 sections 6, 7 and 215-217). They read ONLY
 * completed balls and the public state of the match: never an unresolved ball, never a random stream that has not been drawn.
 */

/** The most completed balls handed to the AI (its own memory window is shorter; the extra covers replaying the current over). */
export const AI_HISTORY_CAP = 30;

const SHOT_CATEGORY = new Map<string, (typeof SHOTS)[number]['category']>(
  SHOTS.map((s) => [s.id, s.category]),
);

export const aiStreams = (seed: string): RngStreams => ({
  stream: (name: string) => new MatchRandom(`${seed}:${name}`),
});

export interface Conditions {
  readonly formatId: string;
  readonly pitchId: string;
  readonly ballsPerOver: number;
  readonly maxOversPerBowler: number | null;
  readonly aggression: number;
}

export function conditionsOf(
  state: Readonly<EngineMatchState>,
  format: { ballsPerOver: number; maxOversPerBowler: number | null; aiAggressionModifier: number },
): Conditions {
  return {
    formatId: state.formatId,
    pitchId: state.pitchId,
    ballsPerOver: format.ballsPerOver,
    maxOversPerBowler: format.maxOversPerBowler,
    aggression: format.aiAggressionModifier,
  };
}

export const defaultFormatAggression = (formatId: string): number =>
  MATCH_FORMATS.find((f) => f.id === formatId)?.aiAggressionModifier ?? 1;

export function situationOf(
  innings: Readonly<EngineInnings>,
  c: Conditions,
): MatchSituation {
  return {
    formatId: c.formatId,
    pitchId: c.pitchId,
    inningsNumber: innings.inningsNumber,
    isSuperOver: innings.isSuperOver,
    ballsPerOver: c.ballsPerOver,
    maxBalls: innings.maxBalls,
    maxWickets: innings.maxWickets,
    legalBalls: innings.legalBalls,
    runs: innings.runs,
    wickets: innings.wickets,
    target: innings.target,
    formatAggression: c.aggression,
  };
}

const toRecord = (
  b: EngineBallResult,
  before: { runs: number; wickets: number; legalBalls: number },
): BallRecord => ({
  sequence: b.sequenceNumber,
  inningsNumber: b.inningsNumber,
  overNumber: b.overNumber,
  ballInOver: b.ballInOver,
  strikerId: b.strikerId,
  bowlerId: b.bowlerId,
  before,
  delivery: {
    variationId: b.delivery.deliveryDefinitionId,
    intendedLine: b.delivery.intendedLine,
    intendedLength: b.delivery.intendedLength,
    actualLine: b.delivery.actualLine,
    actualLength: b.delivery.actualLength,
    speed: b.delivery.speed,
    movement: b.delivery.swing + b.delivery.seam + b.delivery.spin,
  },
  shot: {
    shotId: b.shot.shotId,
    category: SHOT_CATEGORY.get(b.shot.shotId) ?? 'drive',
    contact: b.shot.contactQuality,
    sector: b.shot.sector,
    timing: b.shot.timing,
  },
  runsOffBat: b.runsOffBat,
  extras: b.extras,
  legal: b.legalDelivery,
  wicket: b.wicketType !== null,
});

/** The last `cap` completed balls up to now (the current innings only; memory resets at an innings break), oldest first. */
export function historyOf(
  state: Readonly<EngineMatchState>,
  cap = AI_HISTORY_CAP,
): BallRecord[] {
  const out: BallRecord[] = [];
  for (let i = state.currentInningsIndex; i === state.currentInningsIndex && out.length < Math.min(AI_HISTORY_CAP, cap); i--) {
    const innings = state.innings[i]!;
    let legal = innings.legalBalls;
    for (let o = innings.overs.length - 1; o >= 0 && out.length < cap; o--) {
      const balls = innings.overs[o]!.balls;
      for (let k = balls.length - 1; k >= 0 && out.length < cap; k--) {
        const b = balls[k]!;
        if (b.legalDelivery) legal--;
        out.push(
          toRecord(b, {
            runs: b.scoreAfter - b.runsOffBat - b.extras,
            wickets: b.wicketsAfter - (b.wicketType ? 1 : 0),
            legalBalls: legal,
          }),
        );
      }
    }
  }
  return out.reverse();
}

interface EffectiveCache {
  readonly player: MatchPlayerSnapshot;
  readonly extraFatigue: number;
  readonly effective: MatchPlayerSnapshot;
}
const cache = new WeakMap<MatchPlayerSnapshot, EffectiveCache>();

/** The player as the engine will resolve them (form, fatigue, kit applied), cached per snapshot and workload. */
function effective(player: MatchPlayerSnapshot, extraFatigue = 0): MatchPlayerSnapshot {
  const hit = cache.get(player);
  if (hit && hit.extraFatigue === extraFatigue) return hit.effective;
  const eff = calculateEffectiveMatchAttributes({
    ...player,
    fatigue: clamp(player.fatigue + extraFatigue, 0, 100),
  });
  cache.set(player, { player, extraFatigue, effective: eff });
  return eff;
}

export function batterView(
  player: MatchPlayerSnapshot,
  innings: Readonly<EngineInnings>,
): AIBatterView {
  const eff = effective(player);
  const figure = innings.batting.find((f) => f.playerId === player.playerId);
  return {
    playerId: player.playerId,
    role: player.role,
    hand: player.battingHand,
    batting: eff.batting,
    physical: {
      reflex: eff.physical.reflex,
      strength: eff.physical.strength,
      fitness: eff.physical.fitness,
      stamina: eff.physical.stamina,
    },
    personality: player.personality,
    form: player.form,
    fatigue: player.fatigue,
    runs: figure?.runs ?? 0,
    balls: figure?.balls ?? 0,
  };
}

export function bowlerView(
  player: MatchPlayerSnapshot,
  innings: Readonly<EngineInnings>,
  maxOvers: number | null,
): AIBowlerView {
  const figure = innings.bowling.find((f) => f.playerId === player.playerId);
  const balls = figure?.legalBalls ?? 0;
  // the same workload fatigue the engine applies to a bowler as a spell goes on (an average delivery cost)
  const extra =
    balls * B.fatiguePerDelivery * 4 * (1 - player.physical.stamina / 200);
  const eff = effective(player, Math.round(extra * 100) / 100);
  return {
    playerId: player.playerId,
    role: player.role,
    style: player.bowlingStyle!,
    hand: player.bowlingStyle!.startsWith('left') ? 'left' : 'right',
    bowling: eff.bowling,
    physical: { stamina: eff.physical.stamina, fitness: eff.physical.fitness },
    personality: player.personality,
    fatigue: clamp(player.fatigue + extra, 0, 100),
    legalBalls: balls,
    runsConceded: figure?.runs ?? 0,
    wickets: figure?.wickets ?? 0,
    maxOvers,
    oversBowled: innings.overs.filter((o) => o.bowlerId === player.playerId).length,
  };
}

export const teamOf = (
  input: CreateMatchInput,
  teamId: string,
): MatchTeamSnapshot => (input.teamA.teamId === teamId ? input.teamA : input.teamB);

export const playerOf = (
  input: CreateMatchInput,
  playerId: string,
): MatchPlayerSnapshot | undefined =>
  input.teamA.players.find((p) => p.playerId === playerId) ??
  input.teamB.players.find((p) => p.playerId === playerId);
