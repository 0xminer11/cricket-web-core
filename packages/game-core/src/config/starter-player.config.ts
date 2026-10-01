import type {
  BattingAttributes,
  BattingHand,
  BowlingStyle,
  CareerTierId,
  EquipmentSlot,
  PersonalityAttributes,
  PhysicalAttributes,
  PlayerRole,
} from '../types/index';
import { ECONOMY_CONFIG } from './economy.config';
import { PLAYER_CONFIG } from './player.config';

/**
 * Everything "Create your cricketer" decides lives here (Module 4). The server turns a handful of
 * player choices into starting state using only these tables; clients never send stats.
 * INITIAL BALANCE: SUBJECT TO PLAYTESTING, like all Module 0 numbers.
 */

export const BATTING_HANDS: readonly BattingHand[] = ['right', 'left'];

export const BOWLING_STYLE_LABELS: Readonly<Record<BowlingStyle, string>> = {
  right_arm_fast: 'Right-arm fast',
  left_arm_fast: 'Left-arm fast',
  right_arm_medium: 'Right-arm medium',
  left_arm_medium: 'Left-arm medium',
  off_spin: 'Off spin',
  leg_spin: 'Leg spin',
  left_arm_orthodox: 'Left-arm orthodox',
  left_arm_wrist_spin: 'Left-arm wrist spin',
};
const ALL_STYLES = Object.keys(BOWLING_STYLE_LABELS) as BowlingStyle[];
const PACE_STYLES: readonly BowlingStyle[] = [
  'right_arm_fast',
  'left_arm_fast',
  'right_arm_medium',
  'left_arm_medium',
];
const FAST_STYLES: readonly BowlingStyle[] = [
  'right_arm_fast',
  'left_arm_fast',
];
const SPIN_STYLES: readonly BowlingStyle[] = [
  'off_spin',
  'leg_spin',
  'left_arm_orthodox',
  'left_arm_wrist_spin',
];

export type BowlingRequirement = 'none' | 'optional' | 'required';
export interface StarterRoleDefinition {
  readonly name: string;
  readonly description: string;
  /** Plain-language strengths shown on the role card (derived from ROLE_WEIGHTS emphasis). */
  readonly strengths: readonly string[];
  readonly typicalPosition: string;
  readonly bowlingExpectation: string;
  /** `required`: a style must be chosen; `optional`: part-time bowling may be chosen or skipped. */
  readonly bowling: BowlingRequirement;
  /** Styles this role may pick. Roles are weighted interpretations, never permanent locks. */
  readonly allowedBowlingStyles: readonly BowlingStyle[];
}

export const STARTER_ROLES: Readonly<
  Record<PlayerRole, StarterRoleDefinition>
> = {
  opening_batter: {
    name: 'Opening Batter',
    description:
      'Faces the new ball with patience, a solid defence and sound technique.',
    strengths: ['Defence', 'Technique', 'Timing'],
    typicalPosition: '1-2',
    bowlingExpectation: 'Occasional part-time bowling at most.',
    bowling: 'optional',
    allowedBowlingStyles: ALL_STYLES,
  },
  top_order_batter: {
    name: 'Top-order Batter',
    description:
      'Strong technique and timing; builds an innings with well-placed strokes.',
    strengths: ['Timing', 'Technique', 'Placement'],
    typicalPosition: '1-3',
    bowlingExpectation: 'Occasional part-time bowling at most.',
    bowling: 'optional',
    allowedBowlingStyles: ALL_STYLES,
  },
  middle_order_batter: {
    name: 'Middle-order Batter',
    description:
      'Adaptable scorer who rotates strike and accelerates when needed.',
    strengths: ['Timing', 'Placement', 'Shot selection'],
    typicalPosition: '4-5',
    bowlingExpectation: 'Occasional part-time bowling at most.',
    bowling: 'optional',
    allowedBowlingStyles: ALL_STYLES,
  },
  finisher: {
    name: 'Finisher',
    description: 'Power and nerve at the death: higher risk, bigger hits.',
    strengths: ['Power', 'Timing', 'Reflexes'],
    typicalPosition: '5-7',
    bowlingExpectation: 'Rarely bowls.',
    bowling: 'optional',
    allowedBowlingStyles: ALL_STYLES,
  },
  wicketkeeper_batter: {
    name: 'Wicketkeeper-Batter',
    description:
      'Quick hands and sharp reflexes behind the stumps, plus useful batting.',
    strengths: ['Reflexes', 'Agility', 'Timing'],
    typicalPosition: '3-6',
    bowlingExpectation: 'Does not usually bowl.',
    bowling: 'optional',
    allowedBowlingStyles: ALL_STYLES,
  },
  batting_all_rounder: {
    name: 'Batting All-Rounder',
    description: 'A batter first who bowls a useful supporting spell.',
    strengths: ['Batting', 'Stamina', 'Control'],
    typicalPosition: '4-6',
    bowlingExpectation: 'Bowls a few overs; choose a style.',
    bowling: 'required',
    allowedBowlingStyles: ALL_STYLES,
  },
  bowling_all_rounder: {
    name: 'Bowling All-Rounder',
    description: 'A bowler first who contributes handy runs lower down.',
    strengths: ['Bowling', 'Stamina', 'Shot selection'],
    typicalPosition: '6-8',
    bowlingExpectation: 'Bowls a full quota; choose a style.',
    bowling: 'required',
    allowedBowlingStyles: ALL_STYLES,
  },
  fast_bowler: {
    name: 'Fast Bowler',
    description: 'Pace and bounce, supported by accuracy and seam.',
    strengths: ['Pace', 'Accuracy', 'Strength'],
    typicalPosition: '9-11',
    bowlingExpectation: 'Opens and returns in short bursts.',
    bowling: 'required',
    allowedBowlingStyles: FAST_STYLES,
  },
  swing_bowler: {
    name: 'Swing Bowler',
    description: 'Moves the ball in the air with accuracy and control.',
    strengths: ['Swing', 'Accuracy', 'Control'],
    typicalPosition: '8-11',
    bowlingExpectation: 'Takes the new ball.',
    bowling: 'required',
    allowedBowlingStyles: PACE_STYLES,
  },
  spin_bowler: {
    name: 'Spin Bowler',
    description:
      'Turns the ball and wins wickets through control and variation.',
    strengths: ['Spin', 'Control', 'Variation'],
    typicalPosition: '8-11',
    bowlingExpectation: 'Bowls through the middle overs.',
    bowling: 'required',
    allowedBowlingStyles: SPIN_STYLES,
  },
};

/** Stats a role starts with. Bowling is derived per style (see BOWLING_DERIVATION). */
export interface StarterRoleProfile {
  readonly batting: BattingAttributes;
  readonly physical: PhysicalAttributes;
  /**
   * Main bowling skill level per style (null: not a bowling role). A style missing here falls back
   * to `partTimeBowlingLevel`. Tuned so every valid role+style starts at the same Player Overall.
   */
  readonly bowlingLevelByStyle: Readonly<
    Partial<Record<BowlingStyle, number>>
  > | null;
}

export const STARTER_ROLE_PROFILES: Readonly<
  Record<PlayerRole, StarterRoleProfile>
> = {
  opening_batter: {
    batting: {
      timing: 41,
      power: 30,
      placement: 37,
      defence: 40,
      footwork: 37,
      shotSelection: 39,
      technique: 40,
      consistency: 35,
    },
    physical: {
      strength: 40,
      stamina: 40,
      fitness: 40,
      reflex: 52,
      agility: 40,
      recovery: 40,
    },
    bowlingLevelByStyle: null,
  },
  top_order_batter: {
    batting: {
      timing: 43,
      power: 36,
      placement: 40,
      defence: 37,
      footwork: 39,
      shotSelection: 40,
      technique: 42,
      consistency: 36,
    },
    physical: {
      strength: 40,
      stamina: 40,
      fitness: 40,
      reflex: 40,
      agility: 40,
      recovery: 40,
    },
    bowlingLevelByStyle: null,
  },
  middle_order_batter: {
    batting: {
      timing: 40,
      power: 38,
      placement: 39,
      defence: 30,
      footwork: 36,
      shotSelection: 39,
      technique: 38,
      consistency: 36,
    },
    physical: {
      strength: 40,
      stamina: 40,
      fitness: 40,
      reflex: 52,
      agility: 40,
      recovery: 40,
    },
    bowlingLevelByStyle: null,
  },
  finisher: {
    batting: {
      timing: 38,
      power: 39,
      placement: 36,
      defence: 30,
      footwork: 34,
      shotSelection: 36,
      technique: 30,
      consistency: 34,
    },
    physical: {
      strength: 50,
      stamina: 40,
      fitness: 40,
      reflex: 52,
      agility: 40,
      recovery: 40,
    },
    bowlingLevelByStyle: null,
  },
  wicketkeeper_batter: {
    batting: {
      timing: 34,
      power: 30,
      placement: 33,
      defence: 30,
      footwork: 30,
      shotSelection: 33,
      technique: 33,
      consistency: 32,
    },
    physical: {
      strength: 40,
      stamina: 40,
      fitness: 44,
      reflex: 52,
      agility: 48,
      recovery: 40,
    },
    bowlingLevelByStyle: null,
  },
  batting_all_rounder: {
    batting: {
      timing: 43,
      power: 41,
      placement: 41,
      defence: 30,
      footwork: 30,
      shotSelection: 41,
      technique: 41,
      consistency: 30,
    },
    physical: {
      strength: 40,
      stamina: 54,
      fitness: 54,
      reflex: 40,
      agility: 40,
      recovery: 40,
    },
    bowlingLevelByStyle: {
      right_arm_fast: 37,
      left_arm_fast: 36,
      right_arm_medium: 34,
      left_arm_medium: 34,
      off_spin: 35,
      leg_spin: 36,
      left_arm_orthodox: 36,
      left_arm_wrist_spin: 36,
    },
  },
  bowling_all_rounder: {
    batting: {
      timing: 45,
      power: 42,
      placement: 30,
      defence: 30,
      footwork: 30,
      shotSelection: 42,
      technique: 45,
      consistency: 30,
    },
    physical: {
      strength: 40,
      stamina: 54,
      fitness: 52,
      reflex: 40,
      agility: 40,
      recovery: 40,
    },
    bowlingLevelByStyle: {
      right_arm_fast: 42,
      left_arm_fast: 40,
      right_arm_medium: 34,
      left_arm_medium: 33,
      off_spin: 37,
      leg_spin: 38,
      left_arm_orthodox: 36,
      left_arm_wrist_spin: 38,
    },
  },
  fast_bowler: {
    batting: {
      timing: 30,
      power: 30,
      placement: 30,
      defence: 30,
      footwork: 30,
      shotSelection: 30,
      technique: 30,
      consistency: 30,
    },
    physical: {
      strength: 51,
      stamina: 54,
      fitness: 40,
      reflex: 40,
      agility: 40,
      recovery: 40,
    },
    bowlingLevelByStyle: { right_arm_fast: 48, left_arm_fast: 47 },
  },
  swing_bowler: {
    batting: {
      timing: 30,
      power: 30,
      placement: 30,
      defence: 30,
      footwork: 30,
      shotSelection: 30,
      technique: 30,
      consistency: 30,
    },
    physical: {
      strength: 40,
      stamina: 54,
      fitness: 52,
      reflex: 40,
      agility: 40,
      recovery: 40,
    },
    bowlingLevelByStyle: {
      right_arm_fast: 61,
      left_arm_fast: 56,
      right_arm_medium: 43,
      left_arm_medium: 43,
    },
  },
  spin_bowler: {
    batting: {
      timing: 30,
      power: 30,
      placement: 30,
      defence: 30,
      footwork: 30,
      shotSelection: 30,
      technique: 30,
      consistency: 30,
    },
    physical: {
      strength: 40,
      stamina: 54,
      fitness: 51,
      reflex: 51,
      agility: 40,
      recovery: 40,
    },
    bowlingLevelByStyle: {
      off_spin: 45,
      leg_spin: 45,
      left_arm_orthodox: 45,
      left_arm_wrist_spin: 45,
    },
  },
};

/**
 * How a bowling style turns one skill level into the eight bowling stats: each stat sits between
 * `floor` and the level in proportion to its Module 0 `BOWLING_STYLE_WEIGHTS` share, so a spinner
 * gets Spin and a quick gets Pace. No style means no bowling: every bowling stat is `floor`.
 */
export const BOWLING_DERIVATION = {
  floor: 20,
  /** Level used for part-time bowling by batting roles (and for any style without an entry). */
  partTimeBowlingLevel: 28,
} as const;

/** Every role is tuned to this Player Overall (rounded) so no role is a free upgrade. */
export const STARTER_TARGET_OVERALL = 40;
/** Allowed spread across all valid role + style combinations. */
export const STARTER_OVERALL_TOLERANCE = 2;

/** Initial traits before an archetype is applied. */
export const STARTER_PERSONALITY_BASELINE: PersonalityAttributes = {
  confidence: 50,
  discipline: 50,
  leadership: 50,
  professionalism: 50,
  riskAppetite: 50,
  teamMindset: 50,
};

export type PersonalityArchetypeId = `personality.${string}`;
export interface PersonalityArchetype {
  readonly id: PersonalityArchetypeId;
  readonly name: string;
  readonly description: string;
  /** Deltas on the baseline. Each archetype nets to zero: a trade-off, never a free bonus. */
  readonly deltas: Readonly<
    Partial<Record<keyof PersonalityAttributes, number>>
  >;
  /** Display copy for the trade-off (no archetype is labelled best). */
  readonly leansToward: readonly string[];
  readonly givesUp: readonly string[];
}
export const PERSONALITY_ARCHETYPES: readonly PersonalityArchetype[] = [
  {
    id: 'personality.balanced',
    name: 'Balanced',
    description:
      'No strong lean either way; adapts to what the career throws at you.',
    deltas: {},
    leansToward: ['Even-handed'],
    givesUp: [],
  },
  {
    id: 'personality.calm',
    name: 'Calm',
    description: 'Steady under pressure and slow to rattle.',
    deltas: {
      confidence: 6,
      discipline: 4,
      professionalism: 2,
      riskAppetite: -8,
      teamMindset: -4,
    },
    leansToward: ['Confidence', 'Discipline'],
    givesUp: ['Risk appetite', 'Team mindset'],
  },
  {
    id: 'personality.aggressive',
    name: 'Aggressive',
    description: 'Backs attacking cricket and big moments.',
    deltas: {
      riskAppetite: 9,
      confidence: 4,
      discipline: -6,
      professionalism: -3,
      teamMindset: -4,
    },
    leansToward: ['Risk appetite', 'Confidence'],
    givesUp: ['Discipline', 'Professionalism'],
  },
  {
    id: 'personality.disciplined',
    name: 'Disciplined',
    description: 'Prepares carefully and does the basics well.',
    deltas: {
      discipline: 8,
      professionalism: 5,
      confidence: -5,
      riskAppetite: -4,
      leadership: -4,
    },
    leansToward: ['Discipline', 'Professionalism'],
    givesUp: ['Confidence', 'Leadership'],
  },
  {
    id: 'personality.entertainer',
    name: 'Entertainer',
    description: 'Plays to the crowd and lifts the mood.',
    deltas: {
      confidence: 6,
      riskAppetite: 5,
      leadership: 3,
      discipline: -7,
      professionalism: -7,
    },
    leansToward: ['Confidence', 'Risk appetite'],
    givesUp: ['Discipline', 'Professionalism'],
  },
  {
    id: 'personality.team_leader',
    name: 'Team Leader',
    description: 'Puts the group first and leads from the front.',
    deltas: {
      leadership: 8,
      teamMindset: 6,
      riskAppetite: -6,
      confidence: -4,
      professionalism: -4,
    },
    leansToward: ['Leadership', 'Team mindset'],
    givesUp: ['Risk appetite', 'Confidence'],
  },
];
export const PERSONALITY_TRAIT_BOUNDS = {
  min: PLAYER_CONFIG.statMin,
  max: PLAYER_CONFIG.statMax,
} as const;

/** Jersey numbers are cosmetic. Matches the persisted CHECK (0-99); not unique across the game. */
export const JERSEY_NUMBER_RANGE = { min: 0, max: 99 } as const;
/** Appearance height scale presets: persisted CHECK allows 0.85-1.15; the creator offers a tighter band. */
export const HEIGHT_SCALE_RULES = {
  min: 0.92,
  max: 1.08,
  step: 0.01,
  default: 1,
} as const;

/** Slots every new cricketer owns and wears from the first minute. */
export const STARTER_LOADOUT: Readonly<
  Partial<Record<EquipmentSlot, `item.${string}`>>
> = {
  bat: 'item.bat.street_willow_01',
  helmet: 'item.helmet.core_guard_01',
  gloves: 'item.gloves.starter_01',
  pads: 'item.pads.starter_01',
  shoes: 'item.shoes.starter_01',
  jersey: 'item.jersey.starter_01',
  pants: 'item.pants.starter_01',
};
export const REQUIRED_STARTER_SLOTS: readonly EquipmentSlot[] = [
  'bat',
  'helmet',
  'gloves',
  'pads',
  'shoes',
  'jersey',
  'pants',
];

export const STARTER_CAREER: {
  readonly tier: CareerTierId;
  /** The fictional Academy team a new cricketer joins (Module 0 `TEAMS`). */
  readonly teamId: `team.${string}`;
  readonly level: number;
  readonly xp: number;
} = {
  tier: 'academy',
  teamId: 'team.academy.riverhawks',
  level: 1,
  xp: 0,
};

/** Opening balances (Module 0 economy). Credited through the wallet ledger as `starter_grant`. */
export const STARTER_WALLET = ECONOMY_CONFIG.starter;
