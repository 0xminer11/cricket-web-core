import { AI_TUNING } from '../config/tuning';
import type { BallRecord } from '../types';
import type { DeliveryLength, DeliveryLine } from '../../types/index';

/**
 * Short-term tactical memory (Module 12 sections 8-10). It is REBUILT from the match's own record of completed balls every time
 * the AI decides, so it is a pure function of what has already happened: there is no hidden state that a restart could lose, and
 * the same history always gives the same memory. It is bounded by the difficulty's memory window (Module 0 `tacticalMemory`) and
 * older balls count less (decay), so nothing grows during a long match and nothing from another match leaks in.
 */

export type LineGroup = 'off' | 'stumps' | 'leg';
export type LengthGroup = 'full' | 'good' | 'short';
export const LINE_GROUPS: readonly LineGroup[] = ['off', 'stumps', 'leg'];
export const LENGTH_GROUPS: readonly LengthGroup[] = ['full', 'good', 'short'];

export const lineGroupOf = (line: DeliveryLine): LineGroup =>
  line === 'wide_off' || line === 'outside_off'
    ? 'off'
    : line === 'off_stump' || line === 'middle'
      ? 'stumps'
      : 'leg';
export const lengthGroupOf = (length: DeliveryLength): LengthGroup =>
  length === 'yorker' || length === 'full'
    ? 'full'
    : length === 'good'
      ? 'good'
      : 'short';

export const cellKey = (line: LineGroup, length: LengthGroup): string =>
  `${line}:${length}`;

/** Weighted tallies for one slice of the remembered balls (a weight of 1 = the most recent ball). */
export interface Tally {
  n: number;
  runs: number;
  boundaries: number;
  wickets: number;
  dots: number;
  /** balls the batter played badly: a poor contact, an edge or a miss */
  mishits: number;
}

const tally = (): Tally => ({
  n: 0,
  runs: 0,
  boundaries: 0,
  wickets: 0,
  dots: 0,
  mishits: 0,
});

const OFF_SIDE = new Set(['cover', 'point', 'third_man']);
const LEG_SIDE = new Set(['mid_wicket', 'square_leg', 'fine_leg']);

export interface AIMatchMemory {
  readonly window: number;
  /** Weighted number of the subject's balls remembered (the evidence behind any pattern). */
  readonly evidence: number;
  /** Most recent first. */
  readonly recent: readonly BallRecord[];
  /** What the subject batter scored and lost, by region of the pitch the ball was bowled to. */
  readonly byCell: Readonly<Record<string, Tally>>;
  readonly byLine: Readonly<Record<LineGroup, Tally>>;
  readonly byLength: Readonly<Record<LengthGroup, Tally>>;
  readonly yorkers: Tally;
  /** Shots the subject has played, by category. */
  readonly shotShare: Readonly<Record<string, number>>;
  readonly sectorWeight: { readonly off: number; readonly leg: number; readonly straight: number };
  readonly meanTiming: number;
  readonly timingEvidence: number;
  /** How the shots of each category have worked out for the subject: -1 (badly) .. +1 (well). */
  readonly shotSuccess: Readonly<Record<string, number>>;
  /** Our own recent bowling: how often each variation was used and what it cost. */
  readonly ownVariations: Readonly<Record<string, Tally>>;
  readonly ownCells: Readonly<Record<string, number>>;
  readonly lastVariation: string | null;
  readonly lastCell: string | null;
  readonly repeatRun: number;
}

export interface MemoryOptions {
  /** The batter the memory is about (their balls only), or null for everyone in the innings. */
  readonly strikerId: string | null;
  /** Only this bowler's balls count for "our own bowling" (null = all). */
  readonly bowlerId: string | null;
  readonly window: number;
  /** 0..1: how reliably the AI recalls; lower forgets faster. */
  readonly accuracy: number;
}

const add = (t: Tally, b: BallRecord, w: number): void => {
  const runs = b.runsOffBat + b.extras;
  t.n += w;
  t.runs += runs * w;
  if (b.runsOffBat >= 4) t.boundaries += w;
  if (b.wicket) t.wickets += w;
  if (runs === 0 && !b.wicket) t.dots += w;
  if (['poor', 'edge', 'miss'].includes(b.shot.contact)) t.mishits += w;
};

export function buildMemory(
  history: readonly BallRecord[],
  options: MemoryOptions,
): AIMatchMemory {
  const decay = Math.pow(
    AI_TUNING.patterns.decay,
    1 + (1 - Math.min(1, Math.max(0, options.accuracy))) * 2,
  );
  const window = Number.isFinite(options.window) ? Math.min(12, Math.max(0, Math.floor(options.window))) : 0;
  const windowed = window === 0 ? [] : history.slice(-window);
  const byCell: Record<string, Tally> = {};
  const byLine = Object.fromEntries(LINE_GROUPS.map((g) => [g, tally()])) as Record<LineGroup, Tally>;
  const byLength = Object.fromEntries(LENGTH_GROUPS.map((g) => [g, tally()])) as Record<LengthGroup, Tally>;
  const yorkers = tally();
  const shotShare: Record<string, number> = {};
  const shotSuccess: Record<string, number> = {};
  const shotWeight: Record<string, number> = {};
  const ownVariations: Record<string, Tally> = {};
  const ownCells: Record<string, number> = {};
  const sector = { off: 0, leg: 0, straight: 0 };
  let evidence = 0;
  let timing = 0;
  let timingEvidence = 0;
  const recent: BallRecord[] = [];
  const ownSeq: { variation: string; cell: string }[] = [];
  // walk newest -> oldest so the weight of the newest ball is 1
  for (let i = windowed.length - 1, age = 0; i >= 0; i--, age++) {
    const b = windowed[i]!;
    const w = Math.pow(decay, age);
    const line = lineGroupOf(b.delivery.actualLine);
    const length = lengthGroupOf(b.delivery.actualLength);
    const own = options.bowlerId === null || b.bowlerId === options.bowlerId;
    if (own) {
      const t = (ownVariations[b.delivery.variationId] ??= tally());
      add(t, b, w);
      const key = cellKey(
        lineGroupOf(b.delivery.intendedLine),
        lengthGroupOf(b.delivery.intendedLength),
      );
      ownCells[key] = (ownCells[key] ?? 0) + w;
      ownSeq.push({ variation: b.delivery.variationId, cell: key });
    }
    if (options.strikerId !== null && b.strikerId !== options.strikerId) continue;
    recent.push(b);
    evidence += w;
    add((byCell[cellKey(line, length)] ??= tally()), b, w);
    add(byLine[line], b, w);
    add(byLength[length], b, w);
    if (b.delivery.actualLength === 'yorker') add(yorkers, b, w);
    const cat = b.shot.category;
    shotShare[cat] = (shotShare[cat] ?? 0) + w;
    // success of a shot: good contact with runs is +1, a wicket or a bad contact is -1
    const good = ['perfect', 'good'].includes(b.shot.contact) && b.runsOffBat > 0;
    const bad = b.wicket || ['edge', 'miss'].includes(b.shot.contact);
    shotSuccess[cat] = (shotSuccess[cat] ?? 0) + (good ? w : bad ? -w : 0);
    shotWeight[cat] = (shotWeight[cat] ?? 0) + w;
    if (cat !== 'defensive') {
      if (OFF_SIDE.has(b.shot.sector)) sector.off += w;
      else if (LEG_SIDE.has(b.shot.sector)) sector.leg += w;
      else sector.straight += w;
    }
    timing += b.shot.timing * w;
    timingEvidence += w;
  }
  const lastVariation = ownSeq[0]?.variation ?? null;
  const lastCell = ownSeq[0]?.cell ?? null;
  let repeatRun = 0;
  for (const o of ownSeq) {
    if (o.variation !== lastVariation || o.cell !== lastCell) break;
    repeatRun++;
  }
  const total = Object.values(shotShare).reduce((a, b) => a + b, 0) || 1;
  const share = Object.fromEntries(
    Object.entries(shotShare).map(([k, v]) => [k, v / total]),
  );
  const success = Object.fromEntries(
    Object.entries(shotSuccess).map(([k, v]) => [k, v / (shotWeight[k] || 1)]),
  );
  return {
    window,
    evidence,
    recent,
    byCell,
    byLine,
    byLength,
    yorkers,
    shotShare: share,
    sectorWeight: sector,
    meanTiming: timingEvidence > 0 ? timing / timingEvidence : 0.7,
    timingEvidence,
    shotSuccess: success,
    ownVariations,
    ownCells,
    lastVariation,
    lastCell,
    repeatRun,
  };
}
