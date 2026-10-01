import type {
  BowlingStyle,
  PlayerAttributes,
  PlayerRole,
} from '../types/player.types';
import type { TrainingPlayerSnapshot } from './training-availability';

/** Assemble the engine's input from already-loaded persistence facts (pure, no I/O). */
export function buildTrainingSnapshot(parts: {
  readonly level: number;
  readonly xp: number;
  readonly role: PlayerRole;
  readonly bowlingStyle: BowlingStyle | null;
  readonly attributes: PlayerAttributes;
  readonly skillProgress: ReadonlyArray<{
    readonly statKey: string;
    readonly skillXp: number;
  }>;
  readonly fatigue: number;
  readonly coins: number;
  readonly drillsToday: number;
  readonly restsToday: number;
}): TrainingPlayerSnapshot {
  return {
    level: parts.level,
    xp: parts.xp,
    role: parts.role,
    bowlingStyle: parts.bowlingStyle,
    attributes: parts.attributes,
    skillXp: Object.fromEntries(
      parts.skillProgress.map((p) => [p.statKey, p.skillXp]),
    ),
    fatigue: parts.fatigue,
    coins: parts.coins,
    sessionsToday: parts.drillsToday,
    restsToday: parts.restsToday,
  };
}
export const startOfUtcDay = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
