import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MATCH_ENGINE_VERSION,
  MATCH_FORMATS,
  GAME_BALANCE_VERSION,
} from '../../packages/game-core/src/index';
import {
  createMatchEngine,
  createTestMatch,
  simulateMatch,
  stepSimulation,
  replayMatch,
  validateMatchState,
  createTestDeliveryIntent,
  createTestShotIntent,
  playerPerformances,
  MatchRandom,
} from '../../packages/match-engine/src/index';
function started() {
  const input = createTestMatch();
  const engine = createMatchEngine();
  engine.startMatch(input);
  engine.selectBowler(engine.eligibleBowlers()[0]!);
  return { input, engine };
}
describe('headless lifecycle and replay', () => {
  it('locks algorithm version and golden ball-by-ball output', () => {
    expect(MATCH_ENGINE_VERSION).toBe('2');
    expect(GAME_BALANCE_VERSION).toBe('1');
    const original = simulateMatch(createTestMatch());
    expect(original.state).toEqual(
      JSON.parse(
        readFileSync(new URL('./golden-v2.json', import.meta.url), 'utf8'),
      ),
    );
    expect(
      replayMatch(JSON.parse(JSON.stringify(original.replay))).snapshot(),
    ).toEqual(original.state);
    expect(simulateMatch(createTestMatch()).state).toEqual(original.state);
  });
  it('generates different results from different seeds', () =>
    expect(
      simulateMatch(createTestMatch({ rngSeed: 'different' })).state,
    ).not.toEqual(simulateMatch(createTestMatch()).state));
  it('does not expose internal snapshots and rejects stale/invalid actions without RNG drift', () => {
    const { engine, input } = started();
    const before = engine.snapshot();
    before.innings[0]!.runs = 999;
    expect(engine.snapshot().innings[0]!.runs).toBe(0);
    const action = {
      actionId: 'invalid',
      expectedSequence: 2,
      deliveryIntent: createTestDeliveryIntent(),
      battingIntent: createTestShotIntent(),
    };
    expect(() => engine.resolveBall(action)).toThrow('Stale');
    expect(() =>
      engine.resolveBall({
        ...action,
        expectedSequence: 1,
        battingIntent: createTestShotIntent({ timingInput: NaN }),
      }),
    ).toThrow();
    const first = stepSimulation(engine, input);
    expect(
      engine.resolveBall(
        engine.replay().commands.filter((c) => c.type === 'ball')[0]!.action,
      ),
    ).toEqual(first);
    expect(engine.snapshot().sequence).toBe(1);
    expect(replayMatch(engine.replay()).snapshot()).toEqual(engine.snapshot());
  });
  it('rejects wrong versions, teams, orders, attributes and toss', () => {
    expect(() =>
      createMatchEngine().startMatch(
        createTestMatch({ matchEngineVersion: '0' }),
      ),
    ).toThrow();
    const input = createTestMatch();
    input.teamA.battingOrder[1] = input.teamA.battingOrder[0]!;
    expect(() => createMatchEngine().startMatch(input)).toThrow();
    expect(() =>
      createMatchEngine().startMatch(
        createTestMatch({ toss: { winnerTeamId: 'unknown', decision: 'bat' } }),
      ),
    ).toThrow();
    const invalid = createTestMatch();
    Object.assign(invalid.teamA.players[0]!.batting, { timing: Infinity });
    expect(() => createMatchEngine().startMatch(invalid)).toThrow();
  });
  it('supports configured 10-over formats without special branches', () => {
    const format = {
      ...MATCH_FORMATS[1]!,
      id: 'format.10_over' as const,
      oversPerInnings: 10,
      maxOversPerBowler: 3,
    };
    const input = createTestMatch({ formatId: format.id });
    const { state } = simulateMatch(input, { formats: [format] });
    expect(state.innings[0]!.maxBalls).toBe(60);
    expect(state.status).toBe('completed');
  });
  it('supports ready and abandonment lifecycle', () => {
    const e = createMatchEngine();
    e.createMatch(createTestMatch());
    e.markReady();
    expect(e.snapshot().status).toBe('ready');
    expect(replayMatch(e.replay()).snapshot()).toEqual(e.snapshot());
    e.startMatch();
    e.abandon();
    expect(replayMatch(e.replay()).snapshot()).toEqual(e.snapshot());
    expect(() => stepSimulation(e, createTestMatch())).toThrow();
  });
  it('fuzzes valid intents across formats, skills and seeds and validates every ball', () => {
    const rng = new MatchRandom('fuzz');
    let deliveries = 0;
    let tieBreaks = 0;
    for (let n = 0; n < 150; n++) {
      const input = createTestMatch({
        rngSeed: `fuzz-${n}`,
        formatId: n % 2 ? 'format.2_over' : 'format.5_over',
      });
      const e = createMatchEngine();
      e.startMatch(input);
      while (e.snapshot().status !== 'completed') {
        const ball = stepSimulation(e, input);
        deliveries++;
        expect(Number.isFinite(ball.shot.contactScore)).toBe(true);
        expect(ball.shot.contactScore).toBeGreaterThanOrEqual(0);
        if (rng.next() < 0.1)
          expect(replayMatch(e.replay()).snapshot()).toEqual(e.snapshot());
      }
      const state = e.snapshot();
      validateMatchState(state, input);
      tieBreaks += Number(state.result!.superOver);
      for (const innings of state.innings) {
        expect(innings.bowling.reduce((s, b) => s + b.legalBalls, 0)).toBe(
          innings.legalBalls,
        );
        expect(innings.batting.filter((b) => b.dismissal).length).toBe(
          innings.wickets,
        );
      }
      for (const p of playerPerformances(state, input))
        expect(p.rating).toBeGreaterThanOrEqual(0);
      expect(() => stepSimulation(e, input)).toThrow();
    }
    expect(deliveries).toBeGreaterThan(5000);
    expect(tieBreaks).toBeGreaterThan(0);
  }, 30000);
});
