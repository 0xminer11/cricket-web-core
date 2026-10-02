import { MATCH_FORMATS, profileFor } from '@the-cricketer/game-core';
import type { AIDifficultyId, BallRecord, BattingAIObservation, BowlingAIObservation, BowlingStyle, PlayerRole } from '@the-cricketer/game-core';
import { createMatchEngine } from '../engine/match-engine';
import { createTestMatch } from '../simulation/factories';
import { aiStreams, batterView, bowlerView, conditionsOf, situationOf } from './observation';

/** Synthetic observations for tests/debugging; never modify an authoritative match. */
export interface AiLabInput {
  seed: string;
  difficulty: AIDifficultyId;
  formatId: string;
  pitchId: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  target: number | null;
  batterRating: number;
  bowlerRating: number;
  role: PlayerRole;
  style: BowlingStyle;
  line: number;
  length: number;
  history?: readonly BallRecord[];
}
export const AI_LAB_DEFAULTS: AiLabInput = {
  seed: 'ai-lab', difficulty: 'pro', formatId: 'format.2_over', pitchId: 'pitch.hard',
  runs: 12, wickets: 1, legalBalls: 6, target: 25, batterRating: 55, bowlerRating: 55,
  role: 'batting_all_rounder', style: 'right_arm_fast', line: 0.43, length: 0.46,
};
export function createAiLabObservations(overrides: Partial<AiLabInput> = {}): { batting: BattingAIObservation; bowling: BowlingAIObservation } {
  const q = { ...AI_LAB_DEFAULTS, ...overrides };
  const input = createTestMatch(q.seed);
  input.formatId = q.formatId as typeof input.formatId;
  input.pitchId = q.pitchId as typeof input.pitchId;
  const batter = input.teamA.players[0]!;
  const bowler = input.teamB.players[5]!;
  batter.role = q.role;
  bowler.bowlingStyle = q.style;
  for (const [player, rating] of [[batter, q.batterRating], [bowler, q.bowlerRating]] as const)
    for (const group of ['batting', 'bowling', 'physical'] as const)
      for (const key of Object.keys(player[group]))
        (player[group] as unknown as Record<string, number>)[key] = rating;
  const engine = createMatchEngine();
  engine.startMatch(input, { winnerTeamId: input.teamA.teamId, decision: 'bat' });
  const state = engine.peek();
  const innings = state.innings[0]!;
  const format = MATCH_FORMATS.find((f) => f.id === input.formatId)!;
  const base = {
    situation: { ...situationOf(innings, conditionsOf(state, format)), runs: q.runs, wickets: q.wickets, legalBalls: q.legalBalls, target: q.target },
    history: q.history ?? [], profile: profileFor(q.difficulty), teamAggression: null,
    streams: aiStreams(q.seed), trace: true, sequence: q.legalBalls + 1,
  };
  const b = batterView(batter, innings);
  const w = bowlerView(bowler, innings, format.maxOversPerBowler);
  return {
    batting: { ...base, batter: b, bowler: w, delivery: { x: q.line, y: q.length, speed: q.style.includes('spin') ? 23 : 35, swing: 0.2, seam: 0.2, spin: q.style.includes('spin') ? 0.5 : 0 } },
    bowling: { ...base, batter: b, bowler: w, batters: { [b.playerId]: b } },
  };
}
