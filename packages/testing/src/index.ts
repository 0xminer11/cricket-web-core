import {
  PLAYER_ARCHETYPES,
  MATCH_FORMATS,
  TEAMS,
  ITEMS,
} from '@the-cricketer/game-core';
import type {
  PlayerProfile,
  MatchFormat,
  Team,
  InventoryItem,
  Clock,
  RandomSource,
} from '@the-cricketer/game-core';
function first<T>(values: readonly T[]): T {
  const value = values[0];
  if (!value) throw new Error('Missing Module 0 fixture definition');
  return structuredClone(value);
}
export function createTestPlayer(
  overrides: Partial<PlayerProfile> = {},
): PlayerProfile {
  const archetype = first(PLAYER_ARCHETYPES);
  return {
    playerId: '00000000-0000-4300-8000-000000000001',
    displayName: 'Test Cricketer',
    createdAt: '2026-01-01T00:00:00.000Z',
    battingHand: 'right',
    primaryRole: archetype.role,
    secondaryRoles: [],
    attributes: archetype.attributes,
    skillProgress: [],
    form: {
      value: 50,
      recentPerformanceRatings: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    fatigue: 0,
    career: {
      tier: 'academy',
      playerLevel: 1,
      playerXp: 0,
      reputation: 0,
      selectorInterest: 0,
      fans: 0,
      careerMatches: 0,
      careerWins: 0,
    },
    ...overrides,
  };
}
export const createTestMatchFormat = (
  overrides: Partial<MatchFormat> = {},
): MatchFormat => ({ ...first(MATCH_FORMATS), ...overrides });
export const createTestTeam = (overrides: Partial<Team> = {}): Team => ({
  ...first(TEAMS),
  ...overrides,
});
export const createTestInventoryItem = (
  overrides: Partial<InventoryItem> = {},
): InventoryItem => ({
  instanceId: '00000000-0000-4300-8000-000000000002',
  itemId: first(ITEMS).id,
  quantity: 1,
  upgradeLevel: 0,
  acquiredAt: '2026-01-01T00:00:00.000Z',
  acquisitionSource: 'starter',
  ...overrides,
});
export class FixedClock implements Clock {
  constructor(private readonly iso: string) {}
  now(): Date {
    return new Date(this.iso);
  }
}
export class SequenceRandomSource implements RandomSource {
  private index = 0;
  constructor(private readonly values: readonly number[]) {
    if (
      !values.length ||
      values.some((v) => v < 0 || v >= 1 || !Number.isFinite(v))
    )
      throw new Error('RNG values must be in [0,1)');
  }
  next(): number {
    const value = this.values[this.index++ % this.values.length];
    if (value === undefined) throw new Error('Empty RNG sequence');
    return value;
  }
}
