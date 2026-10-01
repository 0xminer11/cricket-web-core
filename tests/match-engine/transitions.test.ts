import { afterEach, expect, it, vi } from 'vitest';
import { MATCH_FORMATS } from '../../packages/game-core/src/index';
import {
  createMatchEngine,
  createTestMatch,
  stepSimulation,
  simulateMatch,
} from '../../packages/match-engine/src/index';
import * as outcomes from '../../packages/match-engine/src/outcomes/resolve';
import type { Outcome } from '../../packages/match-engine/src/index';
const dot: Outcome = {
  runsOffBat: 0,
  extras: 0,
  extraType: null,
  wicketType: null,
  legalDelivery: true,
  completedRuns: 0,
  distanceClass: 'infield',
};
afterEach(() => vi.restoreAllMocks());
it('ties invoke exactly one configured Super Over, with a second tie retained', () => {
  vi.spyOn(outcomes, 'resolveOutcome').mockReturnValue(dot);
  const { state } = simulateMatch(createTestMatch());
  expect(state.innings).toHaveLength(4);
  expect(state.result).toMatchObject({ type: 'tie', superOver: true });
  expect(state.innings.map((i) => i.legalBalls)).toEqual([12, 12, 6, 6]);
  const formats = MATCH_FORMATS.map((f) => ({
    ...f,
    tieRule: 'tie' as const,
    superOverEnabled: false,
  }));
  expect(
    simulateMatch(createTestMatch(), { formats }).state.innings,
  ).toHaveLength(2);
});
it('wins by runs and stops the chase immediately with the configured wickets remaining', () => {
  const input = createTestMatch();
  const engine = createMatchEngine();
  engine.startMatch(input);
  vi.spyOn(outcomes, 'resolveOutcome').mockImplementation(() =>
    engine.cursor().sequence < 12
      ? dot
      : { ...dot, runsOffBat: 4, distanceClass: 'boundary' },
  );
  while (engine.cursor().status !== 'completed') stepSimulation(engine, input);
  expect(engine.snapshot().innings[1]!.legalBalls).toBe(1);
  expect(engine.snapshot().result).toMatchObject({
    margin: 5,
    marginType: 'wickets',
  });
  vi.restoreAllMocks();
  const other = createMatchEngine();
  other.startMatch(input);
  vi.spyOn(outcomes, 'resolveOutcome').mockImplementation(() =>
    other.cursor().sequence < 12
      ? { ...dot, runsOffBat: 4, distanceClass: 'boundary' }
      : dot,
  );
  while (other.cursor().status !== 'completed') stepSimulation(other, input);
  expect(other.snapshot().result).toMatchObject({
    margin: 48,
    marginType: 'runs',
  });
});
it('ends at wicket cap and never reintroduces dismissed batters', () => {
  vi.spyOn(outcomes, 'resolveOutcome').mockReturnValue({
    ...dot,
    wicketType: 'bowled',
  });
  const { state } = simulateMatch(createTestMatch());
  expect(state.innings.map((i) => i.wickets)).toEqual([5, 5, 2, 2]);
  expect(state.innings.map((i) => i.legalBalls)).toEqual([5, 5, 2, 2]);
});
it('rejects consecutive overs and cap violations; emits deterministic milestones', () => {
  vi.spyOn(outcomes, 'resolveOutcome').mockReturnValue({
    ...dot,
    runsOffBat: 6,
    distanceClass: 'six',
  });
  const input = createTestMatch();
  const engine = createMatchEngine();
  engine.startMatch(input);
  const first = engine.eligibleBowlers()[0]!;
  engine.selectBowler(first);
  for (let n = 0; n < 6; n++) stepSimulation(engine, input);
  expect(() => engine.selectBowler(first)).toThrow();
  expect(engine.eligibleBowlers()).not.toContain(first);
  for (let n = 0; n < 6; n++) stepSimulation(engine, input);
  expect(engine.snapshot().events.some((e) => e.type === 'FIFTY')).toBe(false); // each opener faced one over
  expect(engine.snapshot().status).toBe('innings_break');
});
