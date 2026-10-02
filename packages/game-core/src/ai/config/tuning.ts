/**
 * Module 12 tuning. Strategic weights live here, are validated by
 * `validateAIConfig`, and is versioned by AI_CONFIG_VERSION. None of it touches a player attribute: it only says how much
 * the AI cares about runs, wickets, risk, patterns and so on when it CHOOSES.
 */
export const AI_TUNING = {
  context: {
    /** Fractions of the innings: before `earlyUntil` is early, from `deathFrom` is death. Percentages, never over numbers. */
    phase: { earlyUntil: 0.3, deathFrom: 0.66 },
    /** Expected runs per legal ball for a side of equal strength, by format; the AI's idea of a "par" innings. */
    parRunsPerBall: {
      default: 1.55,
      byFormat: { 'format.2_over': 1.6, 'format.5_over': 1.55 },
    } as Readonly<{
      default: number;
      byFormat: Readonly<Record<string, number>>;
    }>,
    /** Scoring rate by phase relative to the par rate. */
    phaseScoring: { early: 0.94, middle: 1.0, death: 1.1 },
    /** The AI's rough idea of how often a ball takes a wicket, used to value wickets in hand. */
    wicketsPerBall: 0.07,
    /** Spread of runs per ball. */
    ballSd: 1.9,
    pressure: {
      /** weight of each pressure source (they sum to 1). */
      weights: { rate: 0.5, wickets: 0.3, dots: 0.2 },
      dotStreakCap: 5,
    },
    /** `chaseDifficulty` saturates when the required rate is this many times par. */
    hardChaseRatio: 1.9,
  },
  value: {
    /**
     * What a lost wicket costs on top of the scoring it removes, in runs: the batters to come are weaker than the one who is
     * out, and a side that throws wickets away is exposed. Without it the AI would treat wickets as free in a short innings and
     * slog every ball; with it, survival matters at a price the format's own targets (4-9% wickets a ball) agree with.
     */
    wicketFloor: 4,
    /** Chase: a change of win probability is multiplied by this to sit on the same scale as the other utility terms. */
    chaseScale: 3.2,
    /** First innings: a change of projected total is divided by this. */
    totalRunsScale: 6,
  },
  batting: {
    /** Weights of the shot utility terms. */
    weights: {
      value: 1.0,
      risk: 0.0,
      mode: 0.16,
      strength: 0.14,
      personality: 0.12,
      memory: 0.06,
      mismatch: 0.1,
      dot: 0.05,
    },
    /** Risk appetite of a batter (0..1) from context. */
    risk: {
      base: 0.5,
      phase: { early: -0.05, middle: 0, death: 0.14 },
      chase: 0.3,
      resources: 0.16,
      lastWicket: -0.24,
      personality: 0.15,
      confidence: 0.04,
      format: 0.5,
      team: 0.06,
      role: 0.1,
    },
    /** Risk appetite thresholds for the batting modes. */
    modes: { survive: 0.26, rotate: 0.44, attack: 0.64, desperate: 0.84 },
    /** Utility bonus of a shot category in each mode. */
    modeAffinity: {
      SURVIVE: { defensive: 1.0, drive: 0.15, cross_bat: -0.5, lofted: -1.0 },
      ROTATE: { defensive: -0.2, drive: 0.8, cross_bat: 0.1, lofted: -0.6 },
      BALANCED: { defensive: -0.1, drive: 0.4, cross_bat: 0.2, lofted: 0.0 },
      ATTACK: { defensive: -0.9, drive: 0.2, cross_bat: 0.5, lofted: 0.8 },
      DESPERATE: { defensive: -1.4, drive: -0.1, cross_bat: 0.5, lofted: 1.2 },
    },
    /** Which batting attributes matter for each shot category (weights sum to 1). */
    strengthAffinity: {
      defensive: { defence: 0.45, technique: 0.35, footwork: 0.2 },
      drive: { timing: 0.4, placement: 0.35, technique: 0.25 },
      cross_bat: { timing: 0.3, power: 0.3, footwork: 0.2, placement: 0.2 },
      lofted: { power: 0.55, timing: 0.3, placement: 0.15 },
    } as Readonly<
      Record<string, Readonly<Record<string, number>>>
    >,
    /** Roles that bat at the end of the order: a simpler shot set and more lapses. */
    tailenderRoles: ['fast_bowler', 'swing_bowler', 'spin_bowler'] as readonly string[],
    tailender: { mistakeBoost: 1.6, temperatureBoost: 1.3 },
    /** Shots a tailender does not attempt. */
    tailenderExcludes: ['shot.hook', 'shot.cut', 'shot.flick'] as readonly string[],
    temperature: 0.2,
    /** A seeded, small tilt of direction for variety (decision-noise scaled). */
    directionJitter: 0.25,
    /** Chance that a batter misreads a movement kind at perception accuracy 0. */
    movementMisread: 0.45,
    /** Perception noise (in pitch-coordinate units) at perception skill 0. */
    perceptionNoise: 0.11,
    /** What a batter assumes of a ball's execution quality before seeing it (their prior). */
    challengePrior: 0.55,
    /** The wicket cost used when ranking responses inside the bowler's model of the batter (runs of value per wicket). */
    responseTemperature: 0.16,
  },
  bowling: {
    weights: {
      value: 1.0,
      execution: 0.55,
      pattern: 0.55,
      repetition: 0.12,
      pitch: 0.2,
      personality: 0.1,
      planFit: 0.2,
      skill: 0.25,
    },
    temperature: 0.16,
    /** Risk of a wide or a no-ball is priced in units of the utility scale. */
    wideCost: 0.5,
    noBallCost: 0.6,
    /** Bowler modes by context. */
    modes: {
      attackWicketRisk: 0.2,
      deathPhase: true,
    },
    /** How strongly a plan objective is wanted in each bowling mode. */
    objectiveFit: {
      ATTACK_WICKET: {
        WICKET_ATTACK: 1.0,
        SHORT_BALL_ATTACK: 0.7,
        SPIN_PRESSURE: 0.6,
        DOT_PRESSURE: 0.3,
        BOUNDARY_PREVENTION: -0.4,
        YORKER_DEATH: -0.3,
      },
      CONTROL: {
        DOT_PRESSURE: 1.0,
        SPIN_PRESSURE: 0.7,
        BOUNDARY_PREVENTION: 0.4,
        WICKET_ATTACK: 0.1,
        SHORT_BALL_ATTACK: -0.4,
        YORKER_DEATH: -0.2,
      },
      BUILD_PRESSURE: {
        DOT_PRESSURE: 0.9,
        WICKET_ATTACK: 0.5,
        SPIN_PRESSURE: 0.6,
        SHORT_BALL_ATTACK: 0.1,
        BOUNDARY_PREVENTION: 0.1,
        YORKER_DEATH: -0.3,
      },
      DEFEND_BOUNDARY: {
        BOUNDARY_PREVENTION: 1.0,
        DOT_PRESSURE: 0.5,
        YORKER_DEATH: 0.7,
        WICKET_ATTACK: -0.2,
        SHORT_BALL_ATTACK: -0.6,
        SPIN_PRESSURE: 0.2,
      },
      DEATH: {
        YORKER_DEATH: 1.0,
        BOUNDARY_PREVENTION: 0.8,
        WICKET_ATTACK: 0.3,
        DOT_PRESSURE: 0.2,
        SHORT_BALL_ATTACK: -0.3,
        SPIN_PRESSURE: -0.1,
      },
    } as Readonly<Record<string, Readonly<Record<string, number>>>>,
    plan: {
      /** Plans last this many balls (min..max), then are reconsidered. */
      duration: [3, 4] as readonly [number, number],
      /** Chance of dropping a plan after one failing ball, rising with consecutive failures and adaptation. */
      switchBase: 0.1,
      switchPerFailure: 0.38,
      /** A plan is never abandoned before this many balls unless two failures in a row. */
      minBalls: 2,
      /** Weight of each term when ranking plan templates. */
      weights: { objective: 0.5, batter: 0.9, skill: 0.4, pitch: 0.25, pattern: 0.6, novelty: 0.15, noise: 1 },
      temperature: 0.14,
    },
    /** A bowler's idea of their own accuracy: the share of the engine's target error they can expect. */
    selfAssessment: { errorShare: 1.0, qualityVariance: 0 },
    /** Stencil used to price execution error around a target (fractions of the error radius). */
    stencil: [
      { dx: 0, dy: 0, w: 0.4 },
      { dx: 0.75, dy: 0, w: 0.15 },
      { dx: -0.75, dy: 0, w: 0.15 },
      { dx: 0, dy: 0.75, w: 0.15 },
      { dx: 0, dy: -0.75, w: 0.15 },
    ] as readonly { dx: number; dy: number; w: number }[],
    /** Challenge buckets for caching a cell's best response. */
    challengeBucket: 0.08,
    /** A bowler's expectation of a batter's reply: weight of the best reply vs the average reply. */
    replySharpness: 0.75,
  },
  selection: {
    weights: {
      skill: 1.0,
      pitch: 0.45,
      matchup: 0.3,
      phase: 0.35,
      fatigue: 0.4,
      form: 0.2,
      workload: 0.25,
    },
    temperature: 0.22,
  },
  patterns: {
    /** Each older ball counts this much less than the one after it. */
    decay: 0.86,
    /** A pattern needs about this much weighted evidence before it moves a decision (anti-frustration). */
    minEvidence: 2.5,
    /** Evidence at which confidence reaches ~63%. */
    evidenceScale: 4,
    /** Share of a deliberate pattern that counts as "often". */
    loftShare: 0.4,
    sideShare: 0.62,
    struggleRate: 0.45,
    scoreRate: 0.5,
    /** Plan/cell utility moved per unit of (strength x confidence x adaptation). */
    weight: 1.0,
  },
  toss: {
    weights: { pitch: 0.6, composition: 0.5, strength: 0.4, format: 0.1, noise: 0.35 },
    temperature: 0.45,
  },

  /** How each role shifts a batter's appetite for risk (added to the base risk; the phase term is added in the death overs). */
  roleBatting: {
    opening_batter: { base: -0.03, death: 0.0 },
    top_order_batter: { base: 0.0, death: 0.02 },
    middle_order_batter: { base: 0.01, death: 0.04 },
    wicketkeeper_batter: { base: 0.0, death: 0.04 },
    finisher: { base: 0.04, death: 0.12 },
    batting_all_rounder: { base: 0.03, death: 0.08 },
    bowling_all_rounder: { base: 0.02, death: 0.07 },
    fast_bowler: { base: -0.03, death: 0.1 },
    swing_bowler: { base: -0.03, death: 0.1 },
    spin_bowler: { base: -0.03, death: 0.1 },
  } as Readonly<Record<string, { base: number; death: number }>>,
  /** How a bowler's personality tilts their choices. */
  personalityBowling: {
    wicketSeeking: 0.12,
    steadiness: 0.18,
    variationNerve: 0.15,
  },
  /**
   * What each observed pattern means for a delivery: a positive number makes that length / line / variation more attractive.
   * `lengths` and `lines` are keyed by the bands of the pitch; `profiles` by movement profile; `ids` by delivery id.
   */
  patternRules: {
    LOFTS_OFTEN: {
      lengths: { yorker: 1.0, short: 0.7, bouncer: 0.5, full: -0.5, good: -0.6 },
      ids: { 'delivery.fast.slower': 0.5 },
    },
    ATTACKS_FULL: {
      lengths: { short: 0.8, good: 0.3, full: -0.6, yorker: 0.6 },
    },
    LEG_SIDE_BIAS: {
      lines: { outside_off: 0.8, wide_off: 0.1, off_stump: 0.3, leg: -0.6, middle: -0.4 },
    },
    OFF_SIDE_BIAS: {
      lines: { middle: 0.5, leg: 0.6, off_stump: 0.1, outside_off: -0.5, wide_off: -0.6 },
    },
    STRUGGLES_SHORT: {
      lengths: { short: 1.0, bouncer: 0.8 },
    },
    STRUGGLES_YORKER: {
      lengths: { yorker: 1.0, full: 0.3 },
    },
    STRUGGLES_OUTSIDE_OFF: {
      lines: { outside_off: 1.0, wide_off: 0.2, off_stump: 0.3 },
    },
    MISTIMES_OFTEN: {
      profiles: { slower: 0.8, cutter: 0.6 },
      ids: { 'delivery.fast.slower': 0.6 },
    },
    SCORES_OFF_LENGTH: {
      /** filled in by the detector: the length group the batter is scoring off is made unattractive */
    },
  } as Readonly<
    Record<
      string,
      {
        lengths?: Readonly<Record<string, number>>;
        lines?: Readonly<Record<string, number>>;
        profiles?: Readonly<Record<string, number>>;
        ids?: Readonly<Record<string, number>>;
      }
    >
  >,
  /** Which difficulty the opposition plays at, by career tier; and the level of the human's own AI-controlled teammates. */
  tierDifficulty: {
    academy: 'rookie',
    club: 'amateur',
    district: 'amateur',
    domestic: 'pro',
    franchise: 'pro',
    international: 'elite',
  } as Readonly<Record<string, string>>,
  teammateDifficulty: 'pro',
  defaultDifficulty: 'amateur',
} as const;

export type AITuning = typeof AI_TUNING;
