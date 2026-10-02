/**
 * The bowling delivery lifecycle as one explicit state machine, instead of a pile of booleans.
 * Only the transitions listed here are legal; anything else throws, so a double tap, a late
 * network reply or a skipped animation can never leave the scene in an impossible state.
 */
export const BOWLING_STATES = [
  'PREPARING',
  'TARGETING',
  'READY',
  'RUN_UP',
  'RELEASED',
  'BALL_IN_FLIGHT',
  'PITCHED',
  'BATTER_ACTION',
  'RESULT',
  'RESETTING',
] as const;
export type BowlingState = (typeof BOWLING_STATES)[number];

const TRANSITIONS: Readonly<Record<BowlingState, readonly BowlingState[]>> = {
  PREPARING: ['TARGETING'],
  TARGETING: ['READY', 'PREPARING'],
  READY: ['TARGETING', 'RUN_UP', 'PREPARING'],
  // a failed request before release aborts the run-up and returns control
  RUN_UP: ['RELEASED', 'TARGETING'],
  RELEASED: ['BALL_IN_FLIGHT', 'TARGETING'],
  BALL_IN_FLIGHT: ['PITCHED'],
  PITCHED: ['BATTER_ACTION'],
  BATTER_ACTION: ['RESULT'],
  RESULT: ['RESETTING'],
  RESETTING: ['PREPARING', 'TARGETING'],
};

/** States in which the player may still change the delivery, aim or bowler. */
export const INPUT_STATES: readonly BowlingState[] = ['TARGETING', 'READY'];

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: BowlingState,
    readonly to: BowlingState,
  ) {
    super(`Illegal bowling transition ${from} -> ${to}`);
  }
}

export type StateListener = (
  state: BowlingState,
  previous: BowlingState,
) => void;

export class BowlingStateMachine {
  private current: BowlingState;
  private readonly listeners = new Set<StateListener>();
  constructor(initial: BowlingState = 'PREPARING') {
    this.current = initial;
  }
  get state(): BowlingState {
    return this.current;
  }
  can(to: BowlingState): boolean {
    return TRANSITIONS[this.current].includes(to);
  }
  /** Throws on an illegal move. Re-entering the same state is a no-op. */
  transition(to: BowlingState): void {
    if (to === this.current) return;
    if (!this.can(to)) throw new InvalidTransitionError(this.current, to);
    const previous = this.current;
    this.current = to;
    for (const listener of [...this.listeners]) listener(to, previous);
  }
  /** Like `transition` but returns false instead of throwing (for UI events that may race). */
  tryTransition(to: BowlingState): boolean {
    if (to !== this.current && !this.can(to)) return false;
    this.transition(to);
    return true;
  }
  get inputOpen(): boolean {
    return INPUT_STATES.includes(this.current);
  }
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Used by resync: jump to a known state without walking the graph. */
  reset(state: BowlingState = 'PREPARING'): void {
    const previous = this.current;
    this.current = state;
    if (previous !== state)
      for (const listener of [...this.listeners]) listener(state, previous);
  }
}
