/**
 * The batting delivery lifecycle as one explicit state machine. Only listed transitions are legal, so a
 * double tap, a late reply or a skipped animation can never leave the scene in an impossible state.
 */
export const BATTING_STATES = [
  'WAITING',
  'BOWLER_APPROACH',
  'BALL_RELEASED',
  'READING_DELIVERY',
  'SHOT_ARMED',
  'SWING_STARTED',
  'CONTACT_WINDOW',
  'RESULT_RESOLVED',
  'BALL_OUTCOME',
  'RESETTING',
] as const;
export type BattingState = (typeof BATTING_STATES)[number];

const TRANSITIONS: Readonly<Record<BattingState, readonly BattingState[]>> = {
  WAITING: ['BOWLER_APPROACH'],
  BOWLER_APPROACH: ['BALL_RELEASED', 'WAITING'],
  BALL_RELEASED: ['READING_DELIVERY', 'WAITING'],
  READING_DELIVERY: ['SHOT_ARMED', 'SWING_STARTED', 'WAITING'],
  SHOT_ARMED: ['READING_DELIVERY', 'SWING_STARTED', 'WAITING'],
  // a failed request before contact abandons the swing
  SWING_STARTED: ['CONTACT_WINDOW', 'RESULT_RESOLVED', 'WAITING'],
  CONTACT_WINDOW: ['RESULT_RESOLVED', 'WAITING'],
  RESULT_RESOLVED: ['BALL_OUTCOME'],
  BALL_OUTCOME: ['RESETTING'],
  RESETTING: ['WAITING'],
};

/** States in which the player may still change or commit a shot. */
export const SHOT_INPUT_STATES: readonly BattingState[] = [
  'READING_DELIVERY',
  'SHOT_ARMED',
];

export class InvalidBattingTransition extends Error {
  constructor(
    readonly from: BattingState,
    readonly to: BattingState,
  ) {
    super(`Illegal batting transition ${from} -> ${to}`);
  }
}

type Listener = (state: BattingState, previous: BattingState) => void;

export class BattingStateMachine {
  private current: BattingState;
  private readonly listeners = new Set<Listener>();
  constructor(initial: BattingState = 'WAITING') {
    this.current = initial;
  }
  get state(): BattingState {
    return this.current;
  }
  can(to: BattingState): boolean {
    return TRANSITIONS[this.current].includes(to);
  }
  transition(to: BattingState): void {
    if (to === this.current) return;
    if (!this.can(to)) throw new InvalidBattingTransition(this.current, to);
    const previous = this.current;
    this.current = to;
    for (const listener of [...this.listeners]) listener(to, previous);
  }
  tryTransition(to: BattingState): boolean {
    if (to !== this.current && !this.can(to)) return false;
    this.transition(to);
    return true;
  }
  /** Shot and direction may still be changed, and a swing may still be committed. */
  get shotInputOpen(): boolean {
    return SHOT_INPUT_STATES.includes(this.current);
  }
  /** A swing is under way or finished: no new swing may start for this ball. */
  get committed(): boolean {
    return [
      'SWING_STARTED',
      'CONTACT_WINDOW',
      'RESULT_RESOLVED',
      'BALL_OUTCOME',
      'RESETTING',
    ].includes(this.current);
  }
  reset(state: BattingState = 'WAITING'): void {
    const previous = this.current;
    this.current = state;
    if (previous !== state)
      for (const listener of [...this.listeners]) listener(state, previous);
  }
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
