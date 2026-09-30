import { gameDefinitions } from '@the-cricketer/game-core';
import type {
  Achievement,
  CareerEvent,
  Contract,
  DeliveryDefinition,
  EquipmentItem,
  MatchFormat,
  PitchDefinition,
  ShotDefinition,
  SponsorshipOffer,
  Team,
  TrainingDefinition,
} from '@the-cricketer/game-core';
import { UnknownDefinitionError } from './errors';

/**
 * PostgreSQL cannot foreign-key into TypeScript config, so every repository write that accepts a
 * static definition id validates it here first. Definitions are never copied into the database.
 */
export interface DefinitionCatalog {
  item(id: string): EquipmentItem;
  team(id: string): Team;
  training(id: string): TrainingDefinition;
  achievement(id: string): Achievement;
  careerEvent(id: string): CareerEvent;
  contract(id: string): Contract;
  sponsor(id: string): SponsorshipOffer;
  matchFormat(id: string): MatchFormat;
  pitch(id: string): PitchDefinition;
  shot(id: string): ShotDefinition;
  delivery(id: string): DeliveryDefinition;
}

type Definitions = Pick<
  typeof gameDefinitions,
  | 'items'
  | 'teams'
  | 'training'
  | 'achievements'
  | 'careerEvents'
  | 'contracts'
  | 'sponsors'
  | 'matchFormats'
  | 'pitches'
  | 'shots'
  | 'deliveries'
>;

function index<T>(kind: string, rows: readonly T[], key: (row: T) => string) {
  const map = new Map(rows.map((row) => [key(row), row]));
  return (id: string): T => {
    const found = map.get(id);
    if (!found) throw new UnknownDefinitionError(kind, id);
    return found;
  };
}

export function createDefinitionCatalog(
  defs: Definitions = gameDefinitions,
): DefinitionCatalog {
  return {
    item: index('item', defs.items, (r) => r.id),
    team: index('team', defs.teams, (r) => r.teamId),
    training: index('training', defs.training, (r) => r.id),
    achievement: index('achievement', defs.achievements, (r) => r.id),
    careerEvent: index('career event', defs.careerEvents, (r) => r.eventId),
    contract: index('contract', defs.contracts, (r) => r.contractId),
    sponsor: index('sponsor', defs.sponsors, (r) => r.sponsorId),
    matchFormat: index('match format', defs.matchFormats, (r) => r.id),
    pitch: index('pitch', defs.pitches, (r) => r.id),
    shot: index('shot', defs.shots, (r) => r.id),
    delivery: index('delivery', defs.deliveries, (r) => r.id),
  };
}

export const defaultCatalog: DefinitionCatalog = createDefinitionCatalog();
