import { describe, expect, it } from 'vitest';
import {
  MATCH_FLOW_STAGES,
  MATCH_FLOW_STATES,
  aiTossDecision,
  canFlowTransition,
  coinFromRoll,
  flowStateFor,
  getControlMode,
  otherCall,
  resolveToss,
  tossSummary,
} from '../../packages/game-core/src/index';
import type { MatchFlowState } from '../../packages/game-core/src/index';
import { MatchRandom } from '../../packages/match-engine/src/index';

describe('toss rules (pure)', () => {
  it('the coin is a pure function of the roll', () => {
    expect(coinFromRoll(0)).toBe('heads');
    expect(coinFromRoll(0.4999)).toBe('heads');
    expect(coinFromRoll(0.5)).toBe('tails');
    expect(coinFromRoll(0.9999)).toBe('tails');
  });

  it('the caller wins exactly when the call equals the coin', () => {
    for (const call of ['heads', 'tails'] as const)
      for (const coin of ['heads', 'tails'] as const) {
        const r = resolveToss({
          callerTeamId: 'away',
          otherTeamId: 'home',
          call,
          coin,
        });
        expect(r.winnerTeamId).toBe(call === coin ? 'away' : 'home');
        expect(r.loserTeamId).toBe(call === coin ? 'home' : 'away');
        expect(r.coin).toBe(coin);
      }
    expect(otherCall('heads')).toBe('tails');
    expect(otherCall('tails')).toBe('heads');
  });

  it('the seeded coin is stable, and both faces occur across seeds', () => {
    const coin = (seed: string) =>
      coinFromRoll(new MatchRandom(`${seed}:toss:coin`).next());
    expect(coin('seed-a')).toBe(coin('seed-a'));
    const faces = new Set(
      Array.from({ length: 200 }, (_, i) => coin(`seed-${i}`)),
    );
    expect(faces).toEqual(new Set(['heads', 'tails']));
  });

  it('the AI decision is deterministic and leans on the pitch and its strengths', () => {
    const base = {
      pitchId: 'pitch.hard',
      formatId: 'format.5_over',
      battingStrength: 60,
      bowlingStrength: 60,
    };
    expect(aiTossDecision(base)).toBe(aiTossDecision(base));
    expect(aiTossDecision({ ...base, pitchId: 'pitch.green' })).toBe('bowl');
    expect(aiTossDecision({ ...base, battingStrength: 80 })).toBe('bat');
    expect(
      aiTossDecision({ ...base, bowlingStrength: 90, pitchId: 'pitch.dry' }),
    ).toBe('bowl');
    for (const pitchId of ['pitch.green', 'pitch.hard', 'pitch.dry'])
      expect(['bat', 'bowl']).toContain(aiTossDecision({ ...base, pitchId }));
  });

  it('describes the toss in one sentence', () => {
    expect(
      tossSummary({ winnerName: 'Metro Stallions', decision: 'bat' }),
    ).toBe('Metro Stallions won the toss and chose to bat first.');
    expect(tossSummary({ winnerName: 'Rivals', decision: 'bowl' })).toBe(
      'Rivals won the toss and chose to bowl first.',
    );
  });
});

describe('control mode', () => {
  it('maps every match phase to exactly one mode', () => {
    const table = {
      ready_to_bat: 'HUMAN_BATTING',
      ready_to_bowl: 'HUMAN_BOWLING',
      bowler_select: 'HUMAN_BOWLING',
      simulate_required: 'AI_SIMULATION',
      innings_break: 'INNINGS_BREAK',
      completed: 'MATCH_COMPLETE',
      abandoned: 'MATCH_COMPLETE',
    } as const;
    for (const [phase, mode] of Object.entries(table))
      expect(getControlMode({ phase: phase as keyof typeof table })).toBe(mode);
  });
});

describe('flow stage table', () => {
  const path: MatchFlowState[] = [
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
  ];

  it('the whole happy path is legal, step by step', () => {
    for (let i = 0; i < path.length - 1; i++)
      expect(canFlowTransition(path[i]!, path[i + 1]!), `${path[i]}`).toBe(
        true,
      );
  });

  it('cannot skip the toss, go backwards, or leave a finished match', () => {
    expect(canFlowTransition('TEAM_SHEET', 'INNINGS_1')).toBe(false);
    expect(canFlowTransition('PREPARATION', 'INNINGS_1')).toBe(false);
    expect(canFlowTransition('INNINGS_2', 'INNINGS_1')).toBe(false);
    expect(canFlowTransition('MATCH_COMPLETE', 'INNINGS_2')).toBe(false);
    expect(canFlowTransition('RESULTS', 'TOSS')).toBe(false);
    expect(canFlowTransition('EXITING', 'TOSS')).toBe(false);
  });

  it('an AI toss winner can lead straight to the first innings, and a tie can start another innings', () => {
    expect(canFlowTransition('TOSS', 'INNINGS_1_SETUP')).toBe(true);
    expect(canFlowTransition('INNINGS_2', 'INNINGS_BREAK')).toBe(true);
  });

  it('every state can exit except the finished exit itself, and a refresh may land anywhere live', () => {
    for (const s of MATCH_FLOW_STATES)
      if (s !== 'EXITING' && s !== 'PREPARATION' && s !== 'RESUMING')
        expect(canFlowTransition(s, 'EXITING'), s).toBe(true);
    for (const target of [
      'TEAM_SHEET',
      'TOSS',
      'TOSS_DECISION',
      'INNINGS_1',
      'INNINGS_BREAK',
      'INNINGS_2',
      'MATCH_COMPLETE',
    ] as const)
      expect(canFlowTransition('RESUMING', target), target).toBe(true);
  });

  it('maps every server stage to a client state', () => {
    for (const stage of MATCH_FLOW_STAGES)
      expect(MATCH_FLOW_STATES, stage).toContain(
        flowStateFor({ stage, inningsNumber: 1, teamSheetSeen: false }),
      );
    expect(
      flowStateFor({
        stage: 'toss',
        inningsNumber: null,
        teamSheetSeen: false,
      }),
    ).toBe('TEAM_SHEET');
    expect(
      flowStateFor({ stage: 'toss', inningsNumber: null, teamSheetSeen: true }),
    ).toBe('TOSS');
    expect(
      flowStateFor({
        stage: 'toss_decision',
        inningsNumber: null,
        teamSheetSeen: false,
      }),
    ).toBe('TOSS_DECISION');
    expect(
      flowStateFor({
        stage: 'in_progress',
        inningsNumber: 2,
        teamSheetSeen: true,
      }),
    ).toBe('INNINGS_2');
    expect(
      flowStateFor({
        stage: 'completed',
        inningsNumber: 2,
        teamSheetSeen: true,
      }),
    ).toBe('MATCH_COMPLETE');
  });
});
