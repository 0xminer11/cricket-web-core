import {
  DELIVERIES,
  SHOTS,
  PITCHES,
  ENGINE_BALANCE as B,
} from '@the-cricketer/game-core';
import type { DeliveryLine } from '@the-cricketer/game-core';
import type {
  CreateMatchInput,
  EngineConfig,
  MatchPlayerSnapshot,
  BallAction,
} from '../state/types';
import type { HeadlessMatchEngine } from '../engine/match-engine';
import { createMatchEngine } from '../engine/match-engine';
import { MatchRandom } from '../rng/seeded';
import { shotSuitability, resolveShot } from '../batting/resolve';
import { resolveDelivery } from '../bowling/resolve';
import { resolveOutcome } from '../outcomes/resolve';
import { calculateEffectiveMatchAttributes } from '../modifiers/effective';
import { assert } from '../validation/validate';
/** Strategy sees intended delivery, never the resolver's hidden execution or RNG stream. */
export function aiBallAction(
  input: CreateMatchInput,
  bowler: MatchPlayerSnapshot,
  batter: MatchPlayerSnapshot,
  sequence: number,
): BallAction {
  const rng = new MatchRandom(`${input.rngSeed}:ai:${sequence}`);
  const deliveries = DELIVERIES.filter((d) =>
    d.eligibleStyles.includes(bowler.bowlingStyle!),
  );
  const delivery = deliveries[Math.floor(rng.next() * deliveries.length)]!;
  const lines: DeliveryLine[] = ['outside_off', 'off_stump', 'middle', 'leg'];
  const line = lines[Math.floor(rng.next() * lines.length)]!;
  const risk = rng.next();
  const category =
    risk < B.simulation.defensiveProbability
      ? 'defensive'
      : risk <
          B.simulation.defensiveProbability +
            B.simulation.loftProbability *
              (0.5 + batter.personality.riskAppetite / 100)
        ? 'lofted'
        : 'attack';
  const candidates = SHOTS.filter((s) =>
    category === 'attack'
      ? ['drive', 'cross_bat'].includes(s.category)
      : s.category === category,
  );
  const scored = candidates.map((shot) => ({
    shot,
    score:
      shotSuitability(shot, line, delivery.defaultLength) +
      rng.next() * B.simulation.decisionNoise,
  }));
  scored.sort((a, b) => b.score - a.score);
  return {
    actionId: `ball-${sequence}`,
    expectedSequence: sequence,
    deliveryIntent: {
      variationId: delivery.id,
      line,
      length: delivery.defaultLength,
    },
    battingIntent: { shotId: scored[0]!.shot.id },
  };
}
export function stepSimulation(
  engine: HeadlessMatchEngine,
  input: CreateMatchInput,
) {
  let cursor = engine.cursor();
  if (cursor.status === 'innings_break') {
    engine.startNextInnings();
    cursor = engine.cursor();
  }
  assert(
    cursor.status === 'in_progress',
    'Simulation cannot step completed match',
  );
  if (!cursor.bowlerId) {
    engine.selectBowler(engine.eligibleBowlers()[0]!);
    cursor = engine.cursor();
  }
  const teams = [input.teamA, input.teamB];
  const bowler = teams
    .find((t) => t.teamId === cursor.bowlingTeamId)!
    .players.find((p) => p.playerId === cursor.bowlerId)!;
  const batter = teams
    .find((t) => t.teamId === cursor.battingTeamId)!
    .players.find((p) => p.playerId === cursor.strikerId)!;
  return engine.resolveBall(
    aiBallAction(input, bowler, batter, cursor.sequence + 1),
  );
}
export function simulateMatch(
  input: CreateMatchInput,
  config: EngineConfig = {},
) {
  const engine = createMatchEngine(config);
  engine.startMatch(input);
  for (let i = 0; i < B.simulation.maxDeliveries; i++) {
    if (engine.cursor().status === 'completed')
      return { state: engine.snapshot(), replay: engine.replay() };
    stepSimulation(engine, input);
  }
  throw new Error('Simulation safety limit exceeded');
}
export function simulateDeliveries(
  count: number,
  input: CreateMatchInput,
  options: {
    batter?: MatchPlayerSnapshot;
    bowler?: MatchPlayerSnapshot;
    shotId?: BallAction['battingIntent']['shotId'];
    timingInput?: number;
    deliveryIntent?: BallAction['deliveryIntent'];
  } = {},
) {
  assert(
    Number.isSafeInteger(count) && count > 0 && count <= 1000000,
    'Invalid delivery count',
  );
  const batter = options.batter ?? input.teamA.players[0]!;
  const bowler = options.bowler ?? input.teamB.players[5]!;
  const effectiveBatter = calculateEffectiveMatchAttributes(batter);
  const effectiveBowler = calculateEffectiveMatchAttributes(bowler);
  const pitch = PITCHES.find((p) => p.id === input.pitchId)!;
  const distribution: Record<string, number> = {
    dot: 0,
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '6': 0,
    wicket: 0,
    extras: 0,
  };
  const contacts: Record<string, number> = {};
  let runs = 0;
  let seam = 0;
  let spin = 0;
  let speed = 0;
  for (let i = 1; i <= count; i++) {
    const action = aiBallAction(input, bowler, batter, i);
    if (options.deliveryIntent) action.deliveryIntent = options.deliveryIntent;
    if (options.shotId) action.battingIntent.shotId = options.shotId;
    if (options.timingInput !== undefined)
      action.battingIntent.timingInput = options.timingInput;
    const delivery = resolveDelivery(
      action.deliveryIntent,
      effectiveBowler,
      pitch,
      new MatchRandom(`${input.rngSeed}:ball:${i}:delivery`),
    );
    const shot = resolveShot(
      action.battingIntent,
      effectiveBatter,
      delivery,
      pitch,
      new MatchRandom(`${input.rngSeed}:ball:${i}:contact`),
    );
    const outcome = resolveOutcome(
      delivery,
      shot,
      effectiveBatter,
      new MatchRandom(`${input.rngSeed}:ball:${i}:outcome`),
    );
    const key = outcome.wicketType
      ? 'wicket'
      : outcome.extras
        ? 'extras'
        : outcome.runsOffBat === 0
          ? 'dot'
          : String(outcome.runsOffBat);
    distribution[key] = (distribution[key] ?? 0) + 1;
    contacts[shot.contactQuality] = (contacts[shot.contactQuality] ?? 0) + 1;
    runs += outcome.runsOffBat + outcome.extras;
    seam += delivery.seam;
    spin += delivery.spin;
    speed += delivery.speed;
  }
  return {
    count,
    distribution,
    percentages: Object.fromEntries(
      Object.entries(distribution).map(([k, n]) => [k, (n * 100) / count]),
    ),
    contacts,
    runsPerBall: runs / count,
    meanSeam: seam / count,
    meanSpin: spin / count,
    meanSpeed: speed / count,
  };
}
