import type { TrainingDefinition } from '../types/training.types';

const basic = (amount: number) => ({ currency: 'coins', amount }) as const;

/**
 * Module 0 drills (timing, power, accuracy, variation, conditioning) plus the "future activities"
 * Module 0 explicitly allows without schema changes (Defence, Placement, Footwork, Reaction,
 * Swing, Seam, Pace, Spin...). Costs follow the economy bands (basic 60-90, advanced 140+).
 * Primary Skill XP is typically 20-40 and secondary 5-15 (docs/game-design/08-training-system.md);
 * the three elite drills are the "advanced training" tier and carry larger grants.
 * INITIAL BALANCE - SUBJECT TO PLAYTESTING.
 */
export const TRAINING_DEFINITIONS: readonly TrainingDefinition[] = [
  // ---- batting ---------------------------------------------------------------------------
  {
    id: 'training.batting.timing',
    displayName: 'Timing Drill',
    description:
      'Time the ball sweetly in the nets with a focus on footwork into the shot.',
    category: 'batting',
    difficulty: 'easy',
    grants: [
      { statKey: 'batting.timing', skillXp: 32 },
      { statKey: 'batting.footwork', skillXp: 8 },
    ],
    playerXp: 25,
    fatigueGain: 8,
    cost: basic(60),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.batting.power',
    displayName: 'Power Hitting',
    description:
      'Clear the rope with controlled power, backed by strength work.',
    category: 'batting',
    difficulty: 'medium',
    grants: [
      { statKey: 'batting.power', skillXp: 28 },
      { statKey: 'physical.strength', skillXp: 12 },
    ],
    playerXp: 25,
    fatigueGain: 12,
    cost: basic(70),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.batting.defence',
    displayName: 'Defensive Technique',
    description:
      'Soak up pressure with a solid defence and a compact technique.',
    category: 'batting',
    difficulty: 'easy',
    grants: [
      { statKey: 'batting.defence', skillXp: 30 },
      { statKey: 'batting.technique', skillXp: 10 },
    ],
    playerXp: 22,
    fatigueGain: 8,
    cost: basic(60),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.batting.placement',
    displayName: 'Placement Practice',
    description:
      'Find the gaps: target cones around the ring and pick your shots.',
    category: 'batting',
    difficulty: 'medium',
    grants: [
      { statKey: 'batting.placement', skillXp: 30 },
      { statKey: 'batting.shotSelection', skillXp: 10 },
    ],
    playerXp: 24,
    fatigueGain: 9,
    cost: basic(60),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.batting.footwork',
    displayName: 'Footwork Training',
    description: 'Get to the pitch of the ball with quick, balanced movement.',
    category: 'batting',
    difficulty: 'medium',
    grants: [
      { statKey: 'batting.footwork', skillXp: 30 },
      { statKey: 'batting.timing', skillXp: 8 },
    ],
    playerXp: 24,
    fatigueGain: 10,
    cost: basic(70),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.batting.shot_selection',
    displayName: 'Shot Selection',
    description: 'Read the delivery early and pick the right shot for it.',
    category: 'batting',
    difficulty: 'medium',
    grants: [
      { statKey: 'batting.shotSelection', skillXp: 28 },
      { statKey: 'batting.placement', skillXp: 10 },
    ],
    playerXp: 24,
    fatigueGain: 7,
    cost: basic(70),
    cooldownMatches: 0,
    prerequisites: ['playerLevel>=3'],
    version: 1,
  },
  {
    id: 'training.batting.technique',
    displayName: 'Technique Session',
    description:
      'Groove a repeatable, conventional technique under a batting coach.',
    category: 'batting',
    difficulty: 'medium',
    grants: [
      { statKey: 'batting.technique', skillXp: 30 },
      { statKey: 'batting.consistency', skillXp: 10 },
    ],
    playerXp: 24,
    fatigueGain: 9,
    cost: basic(70),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.batting.consistency',
    displayName: 'Batting Consistency',
    description: 'Long, repetitive net sessions that make good shots routine.',
    category: 'batting',
    difficulty: 'hard',
    grants: [
      { statKey: 'batting.consistency', skillXp: 26 },
      { statKey: 'batting.defence', skillXp: 8 },
    ],
    playerXp: 26,
    fatigueGain: 11,
    cost: basic(90),
    cooldownMatches: 0,
    prerequisites: ['playerLevel>=5'],
    version: 1,
  },
  {
    id: 'training.batting.elite_technique',
    displayName: 'Elite Batting Masterclass',
    description:
      'A demanding one-on-one masterclass covering technique, timing and shot choice.',
    category: 'batting',
    difficulty: 'elite',
    grants: [
      { statKey: 'batting.technique', skillXp: 45 },
      { statKey: 'batting.timing', skillXp: 15 },
      { statKey: 'batting.shotSelection', skillXp: 15 },
    ],
    playerXp: 40,
    fatigueGain: 16,
    cost: basic(140),
    cooldownMatches: 0,
    prerequisites: ['playerLevel>=15'],
    version: 1,
  },
  // ---- bowling ---------------------------------------------------------------------------
  {
    id: 'training.bowling.accuracy',
    displayName: 'Bowling Accuracy',
    description:
      'Hit a target spot over and over, with control of line and length.',
    category: 'bowling',
    difficulty: 'easy',
    grants: [
      { statKey: 'bowling.accuracy', skillXp: 30 },
      { statKey: 'bowling.control', skillXp: 10 },
    ],
    playerXp: 25,
    fatigueGain: 10,
    cost: basic(70),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.bowling.control',
    displayName: 'Bowling Control',
    description:
      'Execute plans under pressure: line, length and the odd change-up.',
    category: 'bowling',
    difficulty: 'medium',
    grants: [
      { statKey: 'bowling.control', skillXp: 28 },
      { statKey: 'bowling.accuracy', skillXp: 10 },
    ],
    playerXp: 24,
    fatigueGain: 9,
    cost: basic(70),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.bowling.pace',
    displayName: 'Pace Training',
    description: 'Run-up and release work to add pace, supported by strength.',
    category: 'bowling',
    difficulty: 'hard',
    grants: [
      { statKey: 'bowling.pace', skillXp: 30 },
      { statKey: 'physical.strength', skillXp: 8 },
    ],
    playerXp: 26,
    fatigueGain: 13,
    cost: basic(90),
    cooldownMatches: 0,
    prerequisites: ['playerLevel>=3'],
    version: 1,
  },
  {
    id: 'training.bowling.swing',
    displayName: 'Swing Control',
    description:
      'Shape the new ball in the air with wrist position and seam angle.',
    category: 'bowling',
    difficulty: 'medium',
    grants: [
      { statKey: 'bowling.swing', skillXp: 28 },
      { statKey: 'bowling.accuracy', skillXp: 8 },
    ],
    playerXp: 24,
    fatigueGain: 10,
    cost: basic(80),
    cooldownMatches: 0,
    prerequisites: ['playerLevel>=2'],
    version: 1,
  },
  {
    id: 'training.bowling.seam',
    displayName: 'Seam Control',
    description: 'Land the seam upright and find movement off the pitch.',
    category: 'bowling',
    difficulty: 'medium',
    grants: [
      { statKey: 'bowling.seam', skillXp: 28 },
      { statKey: 'bowling.control', skillXp: 8 },
    ],
    playerXp: 24,
    fatigueGain: 10,
    cost: basic(80),
    cooldownMatches: 0,
    prerequisites: ['playerLevel>=2'],
    version: 1,
  },
  {
    id: 'training.bowling.spin',
    displayName: 'Spin Training',
    description:
      'Rip the ball with revolutions and learn how it grips and turns.',
    category: 'bowling',
    difficulty: 'medium',
    grants: [
      { statKey: 'bowling.spin', skillXp: 30 },
      { statKey: 'bowling.control', skillXp: 10 },
    ],
    playerXp: 25,
    fatigueGain: 10,
    cost: basic(80),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.bowling.variation',
    displayName: 'Variation Lab',
    description:
      'Practise slower balls, cutters and other disguised deliveries.',
    category: 'bowling',
    difficulty: 'hard',
    grants: [
      { statKey: 'bowling.variation', skillXp: 26 },
      { statKey: 'bowling.control', skillXp: 10 },
    ],
    playerXp: 28,
    fatigueGain: 10,
    cost: basic(90),
    cooldownMatches: 0,
    prerequisites: ['playerLevel>=5'],
    version: 1,
  },
  {
    id: 'training.bowling.consistency',
    displayName: 'Bowling Consistency',
    description:
      'Bowl full spells where every ball lands where you meant it to.',
    category: 'bowling',
    difficulty: 'hard',
    grants: [
      { statKey: 'bowling.consistency', skillXp: 26 },
      { statKey: 'bowling.accuracy', skillXp: 8 },
    ],
    playerXp: 26,
    fatigueGain: 11,
    cost: basic(90),
    cooldownMatches: 0,
    prerequisites: ['playerLevel>=5'],
    version: 1,
  },
  {
    id: 'training.bowling.elite_control',
    displayName: 'Elite Bowling Masterclass',
    description:
      'Death-over simulations that sharpen control, accuracy and variation.',
    category: 'bowling',
    difficulty: 'elite',
    grants: [
      { statKey: 'bowling.control', skillXp: 45 },
      { statKey: 'bowling.accuracy', skillXp: 15 },
      { statKey: 'bowling.variation', skillXp: 15 },
    ],
    playerXp: 40,
    fatigueGain: 16,
    cost: basic(140),
    cooldownMatches: 0,
    prerequisites: ['playerLevel>=15'],
    version: 1,
  },
  // ---- physical --------------------------------------------------------------------------
  {
    id: 'training.physical.stamina',
    displayName: 'Conditioning',
    description: 'Endurance, recovery and general fitness in one session.',
    category: 'physical',
    difficulty: 'easy',
    grants: [
      { statKey: 'physical.stamina', skillXp: 24 },
      { statKey: 'physical.recovery', skillXp: 12 },
      { statKey: 'physical.fitness', skillXp: 8 },
    ],
    playerXp: 22,
    fatigueGain: 14,
    cost: basic(60),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.physical.strength',
    displayName: 'Strength Training',
    description: 'Gym work for power through the legs, core and shoulders.',
    category: 'physical',
    difficulty: 'medium',
    grants: [
      { statKey: 'physical.strength', skillXp: 30 },
      { statKey: 'physical.fitness', skillXp: 8 },
    ],
    playerXp: 22,
    fatigueGain: 13,
    cost: basic(70),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.physical.agility',
    displayName: 'Agility Training',
    description: 'Ladders, cones and change-of-direction work.',
    category: 'physical',
    difficulty: 'easy',
    grants: [
      { statKey: 'physical.agility', skillXp: 28 },
      { statKey: 'physical.reflex', skillXp: 10 },
    ],
    playerXp: 22,
    fatigueGain: 10,
    cost: basic(60),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.physical.reflex',
    displayName: 'Reaction Training',
    description:
      'Catching and reaction drills that shorten your decision time.',
    category: 'physical',
    difficulty: 'easy',
    grants: [
      { statKey: 'physical.reflex', skillXp: 30 },
      { statKey: 'physical.agility', skillXp: 8 },
    ],
    playerXp: 22,
    fatigueGain: 9,
    cost: basic(60),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.physical.fitness',
    displayName: 'Fitness Conditioning',
    description:
      'Interval running and circuits to hold your level under workload.',
    category: 'physical',
    difficulty: 'medium',
    grants: [
      { statKey: 'physical.fitness', skillXp: 28 },
      { statKey: 'physical.stamina', skillXp: 10 },
    ],
    playerXp: 22,
    fatigueGain: 12,
    cost: basic(70),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.physical.recovery_work',
    displayName: 'Recovery Work',
    description:
      'Mobility, stretching and physio routines that improve how fast you bounce back.',
    category: 'physical',
    difficulty: 'easy',
    grants: [
      { statKey: 'physical.recovery', skillXp: 26 },
      { statKey: 'physical.fitness', skillXp: 8 },
    ],
    playerXp: 20,
    fatigueGain: 6,
    cost: basic(60),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
  {
    id: 'training.physical.elite_conditioning',
    displayName: 'Elite Conditioning Camp',
    description: 'A high-intensity camp for stamina, strength and fitness.',
    category: 'physical',
    difficulty: 'elite',
    grants: [
      { statKey: 'physical.stamina', skillXp: 40 },
      { statKey: 'physical.strength', skillXp: 15 },
      { statKey: 'physical.fitness', skillXp: 15 },
    ],
    playerXp: 36,
    fatigueGain: 20,
    cost: basic(140),
    cooldownMatches: 0,
    prerequisites: ['playerLevel>=15'],
    version: 1,
  },
  // ---- recovery (a rest action, not a drill) --------------------------------------------------
  {
    id: 'training.physical.rest',
    displayName: 'Rest and Recovery',
    description:
      'Take it easy and let your body recover. Free, and always available when you are tired.',
    category: 'physical',
    kind: 'recovery',
    difficulty: 'easy',
    grants: [],
    playerXp: 0,
    fatigueGain: 0,
    cost: basic(0),
    cooldownMatches: 0,
    prerequisites: [],
    version: 1,
  },
];

/**
 * How training resolves. Every number is an INITIAL BALANCE - SUBJECT TO PLAYTESTING.
 *
 * Module 0 (08-training-system.md) fixes the fatigue guardrail: normal efficiency below 60,
 * reduced at 60-74, strongly reduced at 75+, blocked only near exhaustion (95+); no real-time
 * energy gate. It gives no numbers for "reduced", and no answer for repeated free recovery, so:
 *
 * - `fatigueEfficiency` steps are the concrete values for "reduced" and "strongly reduced";
 * - `dailyLoad` and `recovery.steps` are the IMPLEMENTATION BALANCE SAFEGUARD against infinite
 *   farming (soft capacity, never a lock, never a timer): after a full day's worth of sessions each
 *   further session is worth less, and each further rest recovers less (but never nothing).
 */
export const TRAINING_RULES = {
  /** Skill XP and Player XP multiplier by fatigue (matched on `below`, first hit wins). */
  fatigueEfficiency: [
    { below: 60, multiplier: 1 },
    { below: 75, multiplier: 0.85 },
    { below: 95, multiplier: 0.6 },
  ],
  /** Drills are blocked from here (recovery is never blocked). */
  blockedFatigue: 95,
  /** Stamina 1..100 scales fatigue gained from 1.00 down to this (Module 0: Stamina reduces training fatigue gain). */
  staminaFatigueFloor: 0.8,
  /** Discipline 1..100 scales Skill XP between these (Module 0: Discipline = training efficiency). Modest on purpose. */
  discipline: { min: 0.95, max: 1.05 },
  /**
   * Training load: drills completed so far today (UTC) pick the multiplier for the next one.
   * 1st-5th full value; 6th-8th 0.6; 9th-12th 0.3; later 0.1 (a floor, so effort is never wasted entirely).
   */
  dailyLoad: {
    fullEffectSessions: 5,
    steps: [
      { upToSession: 8, multiplier: 0.6 },
      { upToSession: 12, multiplier: 0.3 },
    ],
    floor: 0.1,
  },
  recovery: {
    /** Fatigue removed by a first rest before the Recovery stat modifier. */
    baseFatigueReduction: 25,
    /** Recovery stat 1..100 scales the reduction between these (Module 0: Recovery improves fatigue reduction). */
    statFactor: { min: 0.9, max: 1.2 },
    fullEffectRests: 2,
    steps: [
      { upToRest: 3, multiplier: 0.7 },
      { upToRest: 4, multiplier: 0.4 },
    ],
    floorMultiplier: 0.2,
    /** A rest always removes at least this much while there is fatigue to remove: no deadlock. */
    minimumReduction: 3,
  },
  /** Final multipliers are clamped so stacking can never explode or vanish. */
  effectivenessClamp: { min: 0.05, max: 1.1 },
  recommendation: {
    /** Role weight used for skills the role does not list, so non-role drills can still be suggested. */
    nonRoleWeight: 0.01,
    /** A drill whose primary skill is within this share of its next point gets the boost. */
    nearPointShare: 0.7,
    nearPointBoost: 1.15,
    /** Recommend rest instead of a drill from this fatigue (Module 0 "strongly reduced"). */
    restFromFatigue: 75,
  },
} as const;
