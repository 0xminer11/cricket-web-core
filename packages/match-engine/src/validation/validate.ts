import {
  DELIVERIES,
  SHOTS,
  GAME_BALANCE_VERSION,
  MATCH_ENGINE_VERSION,
  PLAYER_ARCHETYPES,
  ROLE_WEIGHTS,
  BOWLING_STYLE_WEIGHTS,
} from '@the-cricketer/game-core';
import type { MatchFormat } from '@the-cricketer/game-core';
import type {
  CreateMatchInput,
  EngineMatchState,
  BallAction,
  MatchPlayerSnapshot,
} from '../state/types';
import { LINES, LENGTHS } from '../bowling/resolve';
export class MatchEngineError extends Error {
  readonly code = 'MATCH_ENGINE_INVALID_OPERATION';
  constructor(message: string) {
    super(message);
    this.name = 'MatchEngineError';
  }
}
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new MatchEngineError(message);
}
export function finiteRange(n: number, min: number, max: number): boolean {
  return Number.isFinite(n) && n >= min && n <= max;
}
export function validateInput(
  input: CreateMatchInput,
  format: MatchFormat,
): void {
  assert(
    input.matchEngineVersion === MATCH_ENGINE_VERSION &&
      input.balanceVersion === GAME_BALANCE_VERSION,
    'Unsupported engine/balance version',
  );
  assert(
    typeof input.rngSeed === 'string' &&
      input.rngSeed.length > 0 &&
      input.rngSeed.length <= 256 &&
      input.matchId.length > 0,
    'Match ID and seed required',
  );
  assert(
    format.inningsPerTeam === 1 && format.oversPerInnings !== null,
    'Only limited-over formats supported',
  );
  for (const n of [
    format.oversPerInnings,
    format.ballsPerOver,
    format.maxWickets,
  ])
    assert(Number.isSafeInteger(n) && n > 0, 'Invalid format limits');
  assert(
    format.maxOversPerBowler === null ||
      (Number.isSafeInteger(format.maxOversPerBowler) &&
        format.maxOversPerBowler > 0),
    'Invalid bowler cap',
  );
  assert(input.teamA.teamId !== input.teamB.teamId, 'Teams must differ');
  const allIds = new Set<string>();
  for (const team of [input.teamA, input.teamB]) {
    assert(
      team.players.length > format.maxWickets && team.players.length <= 11,
      'Insufficient/excess team players',
    );
    const ids = team.players.map((p) => p.playerId);
    assert(
      team.battingOrder.length === ids.length &&
        new Set(team.battingOrder).size === ids.length &&
        team.battingOrder.every((id) => ids.includes(id)),
      'Invalid batting order',
    );
    assert(
      team.bowlingOrder.length >= Math.min(2, format.oversPerInnings) &&
        new Set(team.bowlingOrder).size === team.bowlingOrder.length,
      'Invalid bowling order',
    );
    assert(
      team.bowlingOrder.every((id) =>
        team.players.some((p) => p.playerId === id && p.bowlingStyle),
      ),
      'Ineligible bowler',
    );
    assert(
      format.maxOversPerBowler === null ||
        team.bowlingOrder.length * format.maxOversPerBowler >=
          format.oversPerInnings,
      'Insufficient bowling capacity',
    );
    for (const player of team.players) {
      assert(Object.hasOwn(ROLE_WEIGHTS, player.role), 'Invalid player role');
      assert(
        player.playerId && !allIds.has(player.playerId),
        'Duplicate/empty player ID',
      );
      allIds.add(player.playerId);
      assert(
        ['left', 'right'].includes(player.battingHand) &&
          (player.bowlingStyle === null ||
            player.bowlingStyle in BOWLING_STYLE_WEIGHTS),
        'Invalid handedness/style',
      );
      assert(
        finiteRange(player.form, 0, 100) && finiteRange(player.fatigue, 0, 100),
        'Invalid form/fatigue',
      );
      for (const group of [
        'batting',
        'bowling',
        'physical',
        'personality',
      ] as const) {
        for (const key of Object.keys(
          PLAYER_ARCHETYPES[0]!.attributes[group],
        )) {
          const value = (player[group] as unknown as Record<string, number>)[
            key
          ];
          assert(
            value !== undefined &&
              Number.isInteger(value) &&
              finiteRange(value, 1, 100),
            'Invalid player attributes',
          );
        }
      }
      for (const [key, value] of Object.entries(player.equipmentModifiers)) {
        const [group, stat] = key.split('.');
        assert(
          ['batting', 'bowling', 'physical'].includes(group!) &&
            stat &&
            Object.hasOwn(player[group as 'batting'], stat) &&
            finiteRange(value, 0, 100),
          'Invalid equipment modifier',
        );
      }
    }
  }
}
export function validateAction(
  action: BallAction,
  player: MatchPlayerSnapshot,
): void {
  assert(
    typeof action.actionId === 'string' &&
      action.actionId.length > 0 &&
      action.actionId.length <= 128,
    'Invalid action ID',
  );
  assert(Number.isSafeInteger(action.expectedSequence), 'Invalid sequence');
  const d = action.deliveryIntent;
  const definition = DELIVERIES.find((v) => v.id === d.variationId);
  assert(
    definition &&
      player.bowlingStyle &&
      definition.eligibleStyles.includes(player.bowlingStyle),
    'Ineligible delivery',
  );
  assert(
    LINES.includes(d.line) && LENGTHS.includes(d.length),
    'Invalid line/length',
  );
  if (d.target)
    assert(
      finiteRange(d.target.x, 0, 1) && finiteRange(d.target.y, 0, 1),
      'Invalid target',
    );
  assert(
    d.executionInput === undefined || finiteRange(d.executionInput, 0, 1),
    'Invalid execution input',
  );
  const s = action.battingIntent;
  assert(
    SHOTS.some((v) => v.id === s.shotId),
    'Unknown shot',
  );
  for (const value of [s.timingInput, s.directionInput])
    assert(
      value === undefined || finiteRange(value, -1, 1),
      'Invalid shot input',
    );
  assert(
    s.aggression === undefined || finiteRange(s.aggression, 0, 1),
    'Invalid aggression',
  );
  assert(
    Object.keys(action).every((k) =>
      [
        'actionId',
        'expectedSequence',
        'deliveryIntent',
        'battingIntent',
      ].includes(k),
    ),
    'Unexpected action field',
  );
  assert(
    Object.keys(d).every((k) =>
      ['variationId', 'line', 'length', 'target', 'executionInput'].includes(k),
    ) &&
      Object.keys(s).every((k) =>
        ['shotId', 'timingInput', 'directionInput', 'aggression'].includes(k),
      ),
    'Unexpected intent field',
  );
}
export function validateMatchState(
  state: EngineMatchState,
  input: CreateMatchInput,
): void {
  assert(
    (state.result !== null) === (state.status === 'completed'),
    'Result/status mismatch',
  );
  let sequence = 0;
  for (const inning of state.innings) {
    const team = [input.teamA, input.teamB].find(
      (t) => t.teamId === inning.battingTeamId,
    )!;
    const bowling = [input.teamA, input.teamB].find(
      (t) => t.teamId === inning.bowlingTeamId,
    )!;
    for (const n of [
      inning.runs,
      inning.wickets,
      inning.legalBalls,
      inning.extras,
    ])
      assert(Number.isSafeInteger(n) && n >= 0, 'Invalid innings total');
    assert(
      inning.wickets <= inning.maxWickets &&
        inning.legalBalls <= inning.maxBalls,
      'Innings limit exceeded',
    );
    assert(
      inning.target === null ||
        (inning.inningsNumber % 2 === 0 &&
          inning.target === state.innings[inning.inningsNumber - 2]!.runs + 1),
      'Invalid target',
    );
    if (!inning.completed) {
      assert(inning.strikerId !== inning.nonStrikerId, 'Batters must differ');
      for (const id of [inning.strikerId, inning.nonStrikerId])
        assert(
          team.battingOrder.includes(id!) &&
            !inning.batting.find((b) => b.playerId === id)?.dismissal,
          'Invalid active batter',
        );
    }
    if (inning.currentBowlerId)
      assert(
        bowling.bowlingOrder.includes(inning.currentBowlerId),
        'Invalid current bowler',
      );
    const balls = inning.overs.flatMap((o) => o.balls);
    for (const ball of balls)
      assert(ball.sequenceNumber === ++sequence, 'Delivery sequence gap');
    assert(
      balls.reduce((s, b) => s + b.runsOffBat + b.extras, 0) === inning.runs &&
        balls.filter((b) => b.wicketType).length === inning.wickets &&
        balls.filter((b) => b.legalDelivery).length === inning.legalBalls,
      'Ball aggregate mismatch',
    );
    assert(
      inning.batting.reduce((s, b) => s + b.runs, 0) + inning.extras ===
        inning.runs,
      'Batting aggregate mismatch',
    );
  }
  assert(sequence === state.sequence, 'Sequence mismatch');
}
