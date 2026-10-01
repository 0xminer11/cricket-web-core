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
  'player.created': {
    playerId: PlayerId;
    userId: string;
    careerId: string;
    primaryRole: string;
    careerTier: CareerTierId;
    accountType: 'guest' | 'registered';
    balanceVersion: string;
  };
  'match.started': { matchId: MatchId; versions: VersionStamp };
  'match.completed': { matchId: MatchId; versions: VersionStamp };
  'training.completed': {
    playerId: PlayerId;
    trainingId: TrainingId;
    sessionId?: string;
    kind?: 'drill' | 'recovery';
  };
  'player.level_up': {
    playerId: PlayerId;
    oldLevel: number;
    newLevel: number;
    source: 'training' | 'match' | 'achievement' | 'event';
  };
  'player.skill_improved': {
    playerId: PlayerId;
    skillId: string;
    oldValue: number;
    newValue: number;
    source: 'training' | 'match';
  };
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
