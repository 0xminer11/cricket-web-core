import type {
  MatchState,
  MatchFormat,
  PitchDefinition,
  RandomSource,
  Clock,
  DomainEvent,
} from '@the-cricketer/game-core';
export interface EngineContext {
  readonly format: MatchFormat;
  readonly pitch: PitchDefinition;
  readonly random: RandomSource;
  readonly clock: Clock;
}
/** Rendering-free boundary. Command semantics and simulation begin in Module 8. */
export interface MatchEngine<Command> {
  readonly context: EngineContext;
  snapshot(): Readonly<MatchState>;
  dispatch(command: Command): readonly DomainEvent[];
}
