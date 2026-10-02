import { AI_TUNING } from '../config/tuning';
import { clamp01 } from '../core/math';
import type { AIMatchMemory } from './memory';
import type { AIDeliveryIntent, AIProfile } from '../types';
import { DELIVERIES } from '../../seed/deliveries.seed';

const P = AI_TUNING.patterns;

export type PatternId =
  | 'LOFTS_OFTEN'
  | 'ATTACKS_FULL'
  | 'LEG_SIDE_BIAS'
  | 'OFF_SIDE_BIAS'
  | 'STRUGGLES_SHORT'
  | 'STRUGGLES_YORKER'
  | 'STRUGGLES_OUTSIDE_OFF'
  | 'MISTIMES_OFTEN';

export interface PatternSignal {
  readonly id: PatternId;
  /** 0..1: how pronounced the habit or weakness is. */
  readonly strength: number;
  /** 0..1: how much evidence backs it. One event is weak evidence; a repeated one is strong. */
  readonly confidence: number;
  readonly evidence: number;
}

const confidenceOf = (evidence: number): number =>
  clamp01(1 - Math.exp(-evidence / P.evidenceScale));

function signal(
  id: PatternId,
  strength: number,
  evidence: number,
): PatternSignal | null {
  if (evidence < P.minEvidence || strength <= 0.05) return null;
  return { id, strength: clamp01(strength), confidence: confidenceOf(evidence), evidence };
}

/**
 * What the batter's recent balls say about them. A pattern is only reported with enough weighted evidence behind it
 * (anti-frustration: one successful shot never produces a hard counter), and it is built from COMPLETED balls only: it
 * can never contain the shot the batter is about to play.
 */
export function detectBatterPatterns(memory: AIMatchMemory): PatternSignal[] {
  const out: PatternSignal[] = [];
  const push = (s: PatternSignal | null) => s && out.push(s);

  // lofting: a high share of lofted shots
  const loft = memory.shotShare['lofted'] ?? 0;
  push(signal('LOFTS_OFTEN', (loft - P.loftShare * 0.75) / 0.45, memory.evidence));

  // attacking the full ball
  const full = memory.byLength.full;
  if (full.n >= P.minEvidence) {
    const attackingRate = full.runs / Math.max(1e-6, full.n);
    push(signal('ATTACKS_FULL', (attackingRate - 1.4) / 1.4, full.n));
  }

  // side of the ground
  const sides = memory.sectorWeight.off + memory.sectorWeight.leg;
  if (sides > 0) {
    const leg = memory.sectorWeight.leg / sides;
    push(signal('LEG_SIDE_BIAS', (leg - P.sideShare) / (1 - P.sideShare), sides));
    push(signal('OFF_SIDE_BIAS', (1 - leg - P.sideShare) / (1 - P.sideShare), sides));
  }

  // weaknesses: a high rate of bad contact against one kind of ball
  const rate = (t: { n: number; mishits: number }) =>
    t.n > 0 ? t.mishits / t.n : 0;
  const short = memory.byLength.short;
  push(signal('STRUGGLES_SHORT', (rate(short) - P.struggleRate * 0.7) / 0.5, short.n));
  push(signal('STRUGGLES_YORKER', (rate(memory.yorkers) - P.struggleRate * 0.7) / 0.5, memory.yorkers.n));
  const off = memory.byLine.off;
  push(signal('STRUGGLES_OUTSIDE_OFF', (rate(off) - P.struggleRate * 0.7) / 0.5, off.n));

  // mistiming
  push(signal('MISTIMES_OFTEN', (0.66 - memory.meanTiming) / 0.25, memory.timingEvidence));
  return out;
}

/** How much a delivery suits one pattern's habit or weakness, -1..1 (0 when the rule says nothing about it). */
export function ruleMatch(
  id: string,
  delivery: Pick<AIDeliveryIntent, 'variationId' | 'line' | 'length'>,
): number {
  const rule = AI_TUNING.patternRules[id];
  if (!rule) return 0;
  let value = 0;
  let count = 0;
  if (rule.lengths) {
    value += rule.lengths[delivery.length] ?? 0;
    count++;
  }
  if (rule.lines) {
    value += rule.lines[delivery.line] ?? 0;
    count++;
  }
  const def = DELIVERIES.find((d) => d.id === delivery.variationId);
  if (rule.profiles && def) {
    value += rule.profiles[def.movementProfile] ?? 0;
    count++;
  }
  if (rule.ids) {
    value += rule.ids[delivery.variationId] ?? 0;
    count++;
  }
  return count ? Math.max(-1, Math.min(1, value / count)) : 0;
}

/** Overall pull of the detected patterns on a delivery, scaled by how much this AI adapts and how well it remembers. */
export function patternValue(
  patterns: readonly PatternSignal[],
  delivery: Pick<AIDeliveryIntent, 'variationId' | 'line' | 'length'>,
  profile: AIProfile,
): number {
  if (patterns.length === 0) return 0;
  const adaptation =
    profile.difficulty.adaptationStrength *
    profile.difficulty.memoryAccuracy *
    (0.5 + 0.5 * profile.adaptationRate);
  let total = 0;
  for (const p of patterns)
    total += p.strength * p.confidence * ruleMatch(p.id, delivery);
  return total * adaptation * P.weight;
}
