import type { DeliveryLength, DeliveryLine } from '../../types/index';
import type { MatchPhase, PlanObjective } from '../types';

/**
 * Bowling plan templates (Module 12 sections 52-55). A plan is a short, deliberate idea (a channel, a yorker attack, a short-ball
 * test) described as data: where it aims, which deliveries it uses, and when it makes sense. The AI picks one for a few balls and
 * then reconsiders; candidate deliveries are only ever drawn from the active plan.
 *
 * Cell targets are normalised pitch coordinates (x: 0 wide off .. 1 wide leg, relative to the batter's hand, so a left-hander
 * needs no special case; y: 0 yorker .. 1 bouncer).
 */
export interface PlanCell {
  readonly line: DeliveryLine;
  readonly length: DeliveryLength;
  readonly x: number;
  readonly y: number;
  readonly weight: number;
}

export interface PlanTemplate {
  readonly id: string;
  readonly label: string;
  readonly objective: PlanObjective;
  readonly cells: readonly PlanCell[];
  /** Movement profiles the plan uses (empty/absent = any). */
  readonly profiles?: readonly string[];
  /** Specific deliveries (overrides profiles). */
  readonly ids?: readonly string[];
  /** Pace bowlers, spin bowlers, or both. */
  readonly kind: 'pace' | 'spin' | 'any';
  /** Phases of the innings where it makes sense (absent = all). */
  readonly phases?: readonly MatchPhase[];
}

const cell = (
  line: DeliveryLine,
  length: DeliveryLength,
  x: number,
  y: number,
  weight = 1,
): PlanCell => ({ line, length, x, y, weight });

export const PLAN_TEMPLATES: readonly PlanTemplate[] = [
  {
    id: 'plan.channel',
    label: 'Outside-off channel',
    objective: 'DOT_PRESSURE',
    kind: 'any',
    cells: [
      cell('outside_off', 'good', 0.29, 0.47, 0.55),
      cell('off_stump', 'good', 0.41, 0.47, 0.25),
      cell('outside_off', 'full', 0.3, 0.23, 0.2),
    ],
  },
  {
    id: 'plan.full_swing',
    label: 'Full and swinging',
    objective: 'WICKET_ATTACK',
    kind: 'pace',
    profiles: ['swing_out', 'swing_in', 'seam', 'none'],
    cells: [
      cell('off_stump', 'full', 0.42, 0.23, 0.4),
      cell('outside_off', 'full', 0.3, 0.22, 0.4),
      cell('middle', 'full', 0.52, 0.24, 0.2),
    ],
  },
  {
    id: 'plan.stump_attack',
    label: 'Attack the stumps',
    objective: 'WICKET_ATTACK',
    kind: 'any',
    cells: [
      cell('off_stump', 'good', 0.43, 0.46, 0.4),
      cell('middle', 'good', 0.54, 0.46, 0.35),
      cell('middle', 'full', 0.53, 0.24, 0.25),
    ],
  },
  {
    id: 'plan.yorker',
    label: 'Yorkers at the death',
    objective: 'YORKER_DEATH',
    kind: 'pace',
    ids: ['delivery.fast.yorker', 'delivery.fast.slower', 'delivery.fast.cutter'],
    phases: ['middle', 'death'],
    cells: [
      cell('off_stump', 'yorker', 0.43, 0.07, 0.4),
      cell('middle', 'yorker', 0.54, 0.07, 0.4),
      cell('leg', 'yorker', 0.65, 0.07, 0.2),
    ],
  },
  {
    id: 'plan.slower_mix',
    label: 'Change of pace',
    objective: 'YORKER_DEATH',
    kind: 'pace',
    profiles: ['slower', 'cutter'],
    cells: [
      cell('outside_off', 'good', 0.3, 0.46, 0.35),
      cell('off_stump', 'good', 0.43, 0.46, 0.35),
      cell('middle', 'good', 0.54, 0.46, 0.3),
    ],
  },
  {
    id: 'plan.short_ball',
    label: 'Short-ball test',
    objective: 'SHORT_BALL_ATTACK',
    kind: 'pace',
    ids: ['delivery.fast.bouncer', 'delivery.fast.stock', 'delivery.medium.seam'],
    cells: [
      cell('off_stump', 'short', 0.43, 0.72, 0.3),
      cell('middle', 'short', 0.55, 0.72, 0.35),
      cell('middle', 'bouncer', 0.55, 0.92, 0.35),
    ],
  },
  {
    id: 'plan.wide_line',
    label: 'Wide of off stump',
    objective: 'BOUNDARY_PREVENTION',
    kind: 'any',
    cells: [
      cell('outside_off', 'good', 0.2, 0.46, 0.5),
      cell('outside_off', 'full', 0.2, 0.23, 0.5),
    ],
  },
  {
    id: 'plan.leg_trap',
    label: 'Leg-side trap',
    objective: 'WICKET_ATTACK',
    kind: 'pace',
    cells: [
      cell('leg', 'good', 0.67, 0.46, 0.4),
      cell('leg', 'short', 0.67, 0.72, 0.3),
      cell('middle', 'short', 0.57, 0.72, 0.3),
    ],
  },
  {
    id: 'plan.spin_channel',
    label: 'Spin on the stumps',
    objective: 'SPIN_PRESSURE',
    kind: 'spin',
    cells: [
      cell('off_stump', 'good', 0.43, 0.46, 0.4),
      cell('outside_off', 'good', 0.3, 0.46, 0.3),
      cell('middle', 'good', 0.54, 0.46, 0.3),
    ],
  },
  {
    id: 'plan.spin_flight',
    label: 'Flighted spin',
    objective: 'SPIN_PRESSURE',
    kind: 'spin',
    cells: [
      cell('off_stump', 'full', 0.43, 0.24, 0.4),
      cell('middle', 'full', 0.53, 0.24, 0.3),
      cell('outside_off', 'full', 0.3, 0.24, 0.3),
    ],
  },
  {
    id: 'plan.containment',
    label: 'Contain the boundaries',
    objective: 'BOUNDARY_PREVENTION',
    kind: 'any',
    cells: [
      cell('off_stump', 'good', 0.43, 0.46, 0.5),
      cell('middle', 'good', 0.54, 0.46, 0.5),
    ],
  },
];
