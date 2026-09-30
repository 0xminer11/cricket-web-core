import type {
  IsoDateTime,
  PlayerId,
  MatchId,
  ItemId,
  TrainingId,
  CareerTierId,
  VersionStamp,
} from '../types/index';
interface EventPayloads {
  'player.created': { playerId: PlayerId };
  'match.started': { matchId: MatchId; versions: VersionStamp };
  'match.completed': { matchId: MatchId; versions: VersionStamp };
  'training.completed': { playerId: PlayerId; trainingId: TrainingId };
  'career.promoted': { playerId: PlayerId; tier: CareerTierId };
  'item.acquired': { playerId: PlayerId; itemId: ItemId };
}
export type DomainEvent = {
  [K in keyof EventPayloads]: {
    readonly eventId: string;
    readonly type: K;
    readonly occurredAt: IsoDateTime;
    readonly payload: EventPayloads[K];
  };
}[keyof EventPayloads];
