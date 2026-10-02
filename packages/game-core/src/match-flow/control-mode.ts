/**
 * Who is in control of the next ball (Module 11 section 27). A pure function of the match phase the server reports,
 * so the browser, the controller and the tests agree on one definition.
 */
export type ControlMode =
  | 'HUMAN_BATTING'
  | 'HUMAN_BOWLING'
  | 'AI_SIMULATION'
  | 'INNINGS_BREAK'
  | 'MATCH_COMPLETE';

export interface ControlModeInput {
  readonly phase:
    | 'bowler_select'
    | 'ready_to_bowl'
    | 'ready_to_bat'
    | 'simulate_required'
    | 'innings_break'
    | 'completed'
    | 'abandoned';
}

export function getControlMode(state: ControlModeInput): ControlMode {
  switch (state.phase) {
    case 'ready_to_bat':
      return 'HUMAN_BATTING';
    case 'ready_to_bowl':
    case 'bowler_select':
      return 'HUMAN_BOWLING';
    case 'innings_break':
      return 'INNINGS_BREAK';
    case 'completed':
    case 'abandoned':
      return 'MATCH_COMPLETE';
    default:
      return 'AI_SIMULATION';
  }
}
