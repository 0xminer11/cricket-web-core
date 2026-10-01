import type { MatchReplay, EngineConfig } from '../state/types';
import { createMatchEngine } from '../engine/match-engine';
import { RNG_ALGORITHM_VERSION } from '../rng/seeded';
import { assert } from '../validation/validate';
export function replayMatch(replay: MatchReplay, config: EngineConfig = {}) {
  assert(
    replay.schemaVersion === 1 &&
      replay.rngAlgorithmVersion === RNG_ALGORITHM_VERSION,
    'Unsupported replay version',
  );
  const engine = createMatchEngine(config);
  engine.createMatch(replay.input);
  for (const command of replay.commands) {
    switch (command.type) {
      case 'ready':
        engine.markReady();
        break;
      case 'start':
        engine.startMatch(undefined, command.toss);
        break;
      case 'innings':
        engine.startNextInnings();
        break;
      case 'bowler':
        engine.selectBowler(command.playerId);
        break;
      case 'ball':
        engine.resolveBall(command.action);
        break;
      case 'abandon':
        engine.abandon();
        break;
      default:
        throw new Error('Unknown replay command');
    }
  }
  return engine;
}
