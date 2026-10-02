import { CONTACT_QUALITY_BANDS, CONTACT_WEIGHTS as W } from '../../config/batting.config';
import { ENGINE_BALANCE as B } from '../../config/engine.config';
import { shotSuitability } from '../../match-rules';
import type {
  BattingAttributes,
  ContactQuality,
  DeliveryLength,
  DeliveryLine,
  PitchDefinition,
  ShotDefinition,
} from '../../types/index';
import { clamp01, normalCdf } from '../core/math';
import { stateValue } from '../match-context/context';
import type { MatchSituation } from '../types';

/**
 * The AI's EXPECTATION of how a shot against a ball will turn out. It reads the same published balance tables the engine
 * resolves with (contact weights and bands, outcome weights, wicket rates), so the AI's picture of "which shot pays" agrees
 * with the game, but it computes probabilities, never a result: no random number is drawn here, nothing is sampled and nothing
 * is decided. The engine still decides every ball (Module 8). `tests/ai/estimator` checks this model against the engine's own
 * results so the two cannot drift apart unnoticed.
 */

export interface BatterSkills {
  readonly batting: BattingAttributes;
  readonly reflex: number;
  readonly strength: number;
  readonly form: number;
  readonly fatigue: number;
  readonly confidence: number;
}

export interface BallConditions {
  readonly line: DeliveryLine;
  readonly length: DeliveryLength;
  /** 0..1: how hard the ball is to play (execution quality, movement and pace together). */
  readonly challenge: number;
  /** swing + seam + spin */
  readonly movement: number;
  readonly pitch: PitchDefinition;
}

export interface OutcomeEstimate {
  /** Probability of 0, 1, 2, 3, 4 and 6 runs off the bat (in `B.outcome.runs` order), given the batter is not out. */
  readonly pRuns: readonly number[];
  readonly pWicket: number;
  /** Expected runs off the bat (a wicket counts as none). */
  readonly expectedRuns: number;
  readonly pDot: number;
  readonly pBoundary: number;
  readonly contactScore: number;
  readonly suitability: number;
}

const BAND_ORDER: readonly ContactQuality[] = [
  'perfect',
  'good',
  'okay',
  'poor',
  'edge',
  'miss',
];

const ON_STUMPS_LINES: readonly DeliveryLine[] = ['middle', 'off_stump', 'leg'];
const ON_STUMPS_LENGTHS: readonly DeliveryLength[] = ['full', 'good', 'yorker'];

/** Half-width of the timing error the engine draws for this batter and shot (the AI uses the same width for its own timing). */
export function timingHalfWidth(
  timing: number,
  shot: Pick<ShotDefinition, 'timingDifficulty'>,
): number {
  return (
    B.contact.timingFloor +
    (1 - timing / 100) * B.contact.timingSpread +
    shot.timingDifficulty * B.contact.difficultyTiming
  );
}

// ---- a faster path: everything about a (batter, shot) pair that does not depend on the ball is worked out once -------------------

/** Standard normal CDF by table (z from -6 to 6, step 0.01) with linear interpolation: the contact bands need five per estimate. */
const PHI_STEP = 0.01;
const PHI_MIN = -6;
const PHI: Float64Array = (() => {
  const n = Math.round((6 - PHI_MIN) / PHI_STEP) + 1;
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = normalCdf(PHI_MIN + i * PHI_STEP);
  return t;
})();
function phi(z: number): number {
  if (z <= PHI_MIN) return 0;
  if (z >= 6) return 1;
  const x = (z - PHI_MIN) / PHI_STEP;
  const i = Math.floor(x);
  return PHI[i]! + (PHI[i + 1]! - PHI[i]!) * (x - i);
}

const BAND_EDGES = BAND_ORDER.map((band) => CONTACT_QUALITY_BANDS[band]);
const BAND_WEIGHTS = BAND_ORDER.map((band) => B.outcome[band]);
const BAND_WICKET = BAND_ORDER.map((band) => B.outcome.wicket[band]);

/** The parts of a shot's expectation that belong to the batter and the shot, not to the ball. */
export interface ShotKit {
  readonly shot: ShotDefinition;
  readonly half: number;
  readonly sigma: number;
  readonly constant: number;
  readonly timingBase: number;
  readonly selection: number;
  readonly recovery: number;
  readonly wicketBase: number;
  readonly boundary: number;
  readonly runMultipliers: readonly number[];
}

export function shotKit(
  shot: ShotDefinition,
  who: BatterSkills,
  pitch: PitchDefinition,
): ShotKit {
  const a = who.batting;
  const half = timingHalfWidth(a.timing, shot);
  const skill =
    (a.timing * B.contact.skillTiming +
      a.technique * B.contact.technique +
      a.consistency * B.contact.consistency) /
    100;
  const defensive = shot.category === 'defensive';
  const power =
    B.outcome.powerFloor +
    ((a.power * (1 - B.outcome.strengthShare) +
      who.strength * B.outcome.strengthShare) /
      100) *
      B.outcome.powerScale;
  return {
    shot,
    half,
    sigma: W.userTiming * 0.2887 * half,
    constant:
      W.battingSkill * skill +
      W.pitch / pitch.battingDifficultyMultiplier +
      (W.form * who.form) / 100 +
      W.fatigue * (1 - who.fatigue / 100) +
      (W.pressure * who.confidence) / 100,
    timingBase: 1 - half / 2 + (who.reflex / 100) * B.contact.reflexAssist,
    selection: W.shotSelection * (0.5 + a.shotSelection / 200),
    recovery: (a.footwork / 100) * B.contact.mismatchRecovery,
    wicketBase:
      (B.outcome.riskBase + shot.risk * B.outcome.riskScale) *
      (defensive
        ? B.outcome.defensiveWicket *
          (1 - (a.defence / 100) * B.outcome.defenceShare)
        : 1),
    boundary:
      power *
      shot.powerMultiplier *
      (1 + (a.placement / 100 - 0.5) * B.outcome.placementShare) *
      (defensive
        ? B.outcome.defensiveBoundary
        : shot.category === 'lofted'
          ? B.outcome.loftBoundary
          : 1),
    runMultipliers: defensive ? [2, 1, 0.5, 1, 1, 0] : [1, 1, 1, 1, 1, 1],
  };
}

/** The estimate for one ball, from a prepared kit. */
export function estimateWithKit(
  kit: ShotKit,
  line: DeliveryLine,
  length: DeliveryLength,
  challenge: number,
  movement: number,
): OutcomeEstimate {
  const suitability = shotSuitability(kit.shot, line, length);
  const fit = clamp01(suitability + (1 - suitability) * kit.recovery);
  const score = clamp01(
    kit.constant +
      W.userTiming * clamp01(kit.timingBase - challenge * B.contact.difficultyTiming) +
      kit.selection * suitability +
      W.lineLengthFit * fit +
      W.bowlerChallenge * (1 - challenge),
  );
  const onStumps =
    ON_STUMPS_LINES.includes(line) && ON_STUMPS_LENGTHS.includes(length);
  const sigma = Math.max(0.01, kit.sigma);
  const moveWicket = 1 + movement * B.outcome.movementWicket;
  const boundary = kit.boundary / (1 + movement * B.outcome.movementBoundary);
  const runs = [0, 0, 0, 0, 0, 0];
  let pWicket = 0;
  const lastBand = BAND_EDGES.length - 1;
  for (let i = 0; i <= lastBand; i++) {
    // P(band) = CDF(upper edge) - CDF(lower edge); the bands are listed best first, so walk them from the top down
    const [lo, hi] = BAND_EDGES[i]!;
    const upper = i === 0 ? 1 : phi((hi - score) / sigma);
    const lower = i === lastBand ? 0 : phi((lo - score) / sigma);
    const pBand = Math.max(0, upper - lower);
    if (pBand <= 1e-9) continue;
    let wicket = Math.min(0.95, BAND_WICKET[i]! * kit.wicketBase * moveWicket);
    if (i === lastBand && !onStumps) wicket = 0;
    pWicket += pBand * wicket;
    const w = BAND_WEIGHTS[i]!;
    const m = kit.runMultipliers;
    const w0 = w[0]! * m[0]!;
    const w1 = w[1]! * m[1]!;
    const w2 = w[2]! * m[2]!;
    const w3 = w[3]! * m[3]!;
    const w4 = w[4]! * boundary * m[4]!;
    const w5 = w[5]! * boundary * m[5]!;
    const total = w0 + w1 + w2 + w3 + w4 + w5 || 1;
    const k = (pBand * (1 - wicket)) / total;
    runs[0]! += k * w0;
    runs[1]! += k * w1;
    runs[2]! += k * w2;
    runs[3]! += k * w3;
    runs[4]! += k * w4;
    runs[5]! += k * w5;
  }
  const expectedRuns =
    runs[1]! + 2 * runs[2]! + 3 * runs[3]! + 4 * runs[4]! + 6 * runs[5]!;
  return {
    pRuns: runs,
    pWicket,
    expectedRuns,
    pDot: runs[0]!,
    pBoundary: runs[4]! + runs[5]!,
    contactScore: score,
    suitability,
  };
}

export function estimateShotOutcome(
  shot: ShotDefinition,
  who: BatterSkills,
  ball: BallConditions,
): OutcomeEstimate {
  return estimateWithKit(
    shotKit(shot, who, ball.pitch),
    ball.line,
    ball.length,
    ball.challenge,
    ball.movement,
  );
}

/** Expected contact score of a shot (the engine's formula with the timing term at its expectation) and its spread. */
export function expectedContact(
  shot: ShotDefinition,
  who: BatterSkills,
  ball: BallConditions,
): { score: number; sigma: number; suitability: number } {
  const e = estimateShotOutcome(shot, who, ball);
  return {
    score: e.contactScore,
    sigma: shotKit(shot, who, ball.pitch).sigma,
    suitability: e.suitability,
  };
}

/**
 * What each possible result of one ball is worth to the batting side in the match as it stands: the change of `stateValue` (win
 * probability in a chase, projected total in a first innings) after 0, 1, 2, 3, 4 or 6 runs and after a wicket. It depends only
 * on the match situation, so it is computed once per decision and shared by every shot or delivery that is scored.
 */
export interface ValueTable {
  /** Change of value after each of 0, 1, 2, 3, 4 and 6 runs off the bat (a legal ball). */
  readonly runs: readonly number[];
  readonly wicket: number;
  /** Change of value of one extra run with no ball bowled (a wide). */
  readonly wide: number;
}

export function valueTable(situation: MatchSituation): ValueTable {
  const base = stateValue(
    situation,
    situation.runs,
    situation.wickets,
    situation.legalBalls,
  );
  const runs = B.outcome.runs.map(
    (r) =>
      stateValue(
        situation,
        situation.runs + r,
        situation.wickets,
        situation.legalBalls + 1,
      ) - base,
  );
  return {
    runs,
    wicket:
      stateValue(
        situation,
        situation.runs,
        situation.wickets + 1,
        situation.legalBalls + 1,
      ) - base,
    wide:
      stateValue(
        situation,
        situation.runs + 1,
        situation.wickets,
        situation.legalBalls,
      ) - base,
  };
}

/** The expected change of value over the possible results of one ball, for the batting side. */
export function outcomeValue(
  table: ValueTable,
  estimate: Pick<OutcomeEstimate, 'pRuns' | 'pWicket'>,
): number {
  let delta = estimate.pWicket * table.wicket;
  for (let k = 0; k < 6; k++) delta += estimate.pRuns[k]! * table.runs[k]!;
  return delta;
}

/** Probability of each contact band for a score distributed N(mean, sigma) (best band first). */
export function bandProbabilities(mean: number, sigma: number): number[] {
  const s = Math.max(0.01, sigma);
  const out: number[] = [];
  for (let i = 0; i < BAND_EDGES.length; i++) {
    const [lo, hi] = BAND_EDGES[i]!;
    const upper = i === 0 ? 1 : phi((hi - mean) / s);
    const lower = i === BAND_EDGES.length - 1 ? 0 : phi((lo - mean) / s);
    out.push(Math.max(0, upper - lower));
  }
  const total = out.reduce((a, b) => a + b, 0) || 1;
  return out.map((p) => p / total);
}
