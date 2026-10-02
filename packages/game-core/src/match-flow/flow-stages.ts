/**
 * The explicit match flow states (Module 11 section 3) and which moves between them are legal. The client controller
 * and the server stage derivation use this one table, so a stage can never be reached by a route boolean.
 */
export const MATCH_FLOW_STATES = [
  'PREPARATION',
  'TEAM_SHEET',
  'TOSS',
  'TOSS_DECISION',
  'INNINGS_1_SETUP',
  'INNINGS_1',
  'INNINGS_BREAK',
  'INNINGS_2_SETUP',
  'INNINGS_2',
  'MATCH_COMPLETE',
  'RESULTS',
  'EXITING',
  'RESUMING',
] as const;
export type MatchFlowState = (typeof MATCH_FLOW_STATES)[number];

/** The persisted server stage of a match. */
export const MATCH_FLOW_STAGES = [
  'toss',
  'toss_decision',
  'in_progress',
  'innings_break',
  'completed',
  'abandoned',
] as const;
export type MatchFlowStage = (typeof MATCH_FLOW_STAGES)[number];

const T: Readonly<Record<MatchFlowState, readonly MatchFlowState[]>> = {
  RESUMING: [
    'TEAM_SHEET',
    'TOSS',
    'TOSS_DECISION',
    'INNINGS_1',
    'INNINGS_BREAK',
    'INNINGS_2',
    'MATCH_COMPLETE',
    'RESULTS',
    'EXITING',
  ],
  PREPARATION: ['TEAM_SHEET', 'EXITING'],
  TEAM_SHEET: ['TOSS', 'EXITING'],
  // after the toss: an AI winner decides at once, so the call can lead straight to the first innings
  TOSS: ['TOSS_DECISION', 'INNINGS_1_SETUP', 'INNINGS_1', 'EXITING'],
  TOSS_DECISION: ['INNINGS_1_SETUP', 'INNINGS_1', 'EXITING'],
  INNINGS_1_SETUP: ['INNINGS_1', 'EXITING'],
  INNINGS_1: ['INNINGS_BREAK', 'MATCH_COMPLETE', 'EXITING'],
  INNINGS_BREAK: ['INNINGS_2_SETUP', 'INNINGS_2', 'EXITING'],
  INNINGS_2_SETUP: ['INNINGS_2', 'EXITING'],
  // a tie can start a super over: another break, then another innings
  INNINGS_2: ['INNINGS_BREAK', 'MATCH_COMPLETE', 'EXITING'],
  MATCH_COMPLETE: ['RESULTS', 'EXITING'],
  RESULTS: ['EXITING'],
  EXITING: [],
};
export const canFlowTransition = (
  from: MatchFlowState,
  to: MatchFlowState,
): boolean => from === to || T[from].includes(to);

/** Maps what the server reports (stage + innings number) to the client flow state. */
export function flowStateFor(input: {
  readonly stage: MatchFlowStage;
  readonly inningsNumber: number | null;
  readonly teamSheetSeen: boolean;
}): MatchFlowState {
  switch (input.stage) {
    case 'toss':
      return input.teamSheetSeen ? 'TOSS' : 'TEAM_SHEET';
    case 'toss_decision':
      return 'TOSS_DECISION';
    case 'in_progress':
      return (input.inningsNumber ?? 1) <= 1 ? 'INNINGS_1' : 'INNINGS_2';
    case 'innings_break':
      return 'INNINGS_BREAK';
    case 'completed':
    case 'abandoned':
      return 'MATCH_COMPLETE';
  }
}
