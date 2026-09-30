import { PLAYER_ARCHETYPES, TEAMS } from '@the-cricketer/game-core';
import type { PlayerAttributes } from '@the-cricketer/game-core';
import { uuidv7 } from '../ids';
import type {
  CareerRecord,
  InventoryItemRecord,
  MatchSummary,
  PlayerProfileRecord,
  PlayerStateRecord,
  TeamRecord,
  UserRecord,
  WalletBalanceRecord,
} from '../records';
import type { Repositories } from '../repositories/index';

/**
 * Valid-by-default builders for integration tests. Every call creates fresh, uniquely keyed rows
 * (users are origin='test'); pass overrides to exercise edge cases. They go through the same
 * repositories as production code, so factories cannot bypass constraints.
 */
export function defaultAttributes(): PlayerAttributes {
  const source = PLAYER_ARCHETYPES[0];
  if (!source) throw new Error('Missing Module 0 archetype fixture');
  return structuredClone(source.attributes) as PlayerAttributes;
}

export function createTestUser(
  repos: Repositories,
  overrides: { id?: string } = {},
): Promise<UserRecord> {
  return repos.users.create({ id: overrides.id ?? uuidv7(), origin: 'test' });
}

export interface TestPlayer {
  readonly user: UserRecord;
  readonly profile: PlayerProfileRecord;
  readonly state: PlayerStateRecord;
  readonly balances: readonly WalletBalanceRecord[];
}
export async function createTestPlayer(
  repos: Repositories,
  overrides: {
    displayName?: string;
    attributes?: PlayerAttributes;
    coins?: number;
    gems?: number;
    level?: number;
  } = {},
): Promise<TestPlayer> {
  const user = await createTestUser(repos);
  const profile = await repos.players.create({
    userId: user.id,
    displayName: overrides.displayName ?? 'Test Cricketer',
    countryCode: 'IN',
    jerseyNumber: 7,
    battingHand: 'right',
    primaryRole: 'top_order_batter',
  });
  await repos.players.createAppearance(profile.id, {
    bodyPresetId: 'body.athletic_01',
    facePresetId: 'face.preset_01',
    skinToneId: 'skin.tone_01',
    hairStyleId: 'hair.short_01',
    hairColorId: 'haircolor.black',
    beardStyleId: null,
    heightScale: 1,
  });
  await repos.players.createAttributes(
    profile.id,
    overrides.attributes ?? defaultAttributes(),
  );
  const state = await repos.players.createState(
    profile.id,
    overrides.level ? { level: overrides.level } : {},
  );
  await repos.wallet.ensureBalances(profile.id);
  const key = (currency: string) => `test-fund:${profile.id}:${currency}`;
  if ((overrides.coins ?? 1000) > 0)
    await repos.wallet.credit({
      playerId: profile.id,
      currency: 'coins',
      amount: overrides.coins ?? 1000,
      type: 'starter_grant',
      reference: { type: 'test', id: profile.id },
      idempotencyKey: key('coins'),
    });
  if ((overrides.gems ?? 0) > 0)
    await repos.wallet.credit({
      playerId: profile.id,
      currency: 'gems',
      amount: overrides.gems ?? 0,
      type: 'starter_grant',
      reference: { type: 'test', id: profile.id },
      idempotencyKey: key('gems'),
    });
  return {
    user,
    profile,
    state,
    balances: await repos.wallet.getBalances(profile.id),
  };
}

export function createTestCareer(
  repos: Repositories,
  playerId: string,
  overrides: { tier?: CareerRecord['currentTier']; teamId?: string } = {},
): Promise<CareerRecord> {
  return repos.careers.create({
    playerId,
    tier: overrides.tier ?? 'academy',
    ...(overrides.teamId ? { teamId: overrides.teamId } : {}),
  });
}

/** Canonical team row for a Module 0 definition (default: the first). Idempotent. */
export async function createTestTeam(
  repos: Repositories,
  definitionId?: string,
): Promise<TeamRecord> {
  const id = definitionId ?? TEAMS[0]?.teamId;
  if (!id) throw new Error('Missing Module 0 team definitions');
  const [team] = await repos.teams.ensureCanonicalTeams([id]);
  if (!team) throw new Error('Team seed failed');
  return team;
}

export function createTestInventoryItem(
  repos: Repositories,
  playerId: string,
  itemDefinitionId = 'item.bat.street_willow_01',
): Promise<InventoryItemRecord> {
  return repos.inventory
    .grantItem({ playerId, itemDefinitionId, source: 'reward' })
    .then((r) => r.item);
}

/** A created (not started) 2-over match between two canonical teams with one human and one AI participant per side. */
export async function createTestMatch(
  repos: Repositories,
  options: {
    playerId?: string;
    homeDefinitionId?: string;
    awayDefinitionId?: string;
  } = {},
): Promise<MatchSummary> {
  const home = await createTestTeam(
    repos,
    options.homeDefinitionId ?? 'team.academy.riverhawks',
  );
  const away = await createTestTeam(
    repos,
    options.awayDefinitionId ?? 'team.club.metro_stallions',
  );
  return repos.matches.createMatch({
    matchMode: 'friendly',
    matchFormatId: 'format.2_over',
    pitchDefinitionId: 'pitch.green',
    homeTeamId: home.id,
    awayTeamId: away.id,
    participants: [
      options.playerId
        ? {
            teamId: home.id,
            participantType: 'human',
            playerId: options.playerId,
            battingPosition: 1,
            displayName: 'Test Cricketer',
          }
        : {
            teamId: home.id,
            participantType: 'ai',
            battingPosition: 1,
            displayName: 'Home AI 1',
          },
      {
        teamId: home.id,
        participantType: 'ai',
        battingPosition: 2,
        displayName: 'Home AI 2',
      },
      {
        teamId: away.id,
        participantType: 'ai',
        battingPosition: 1,
        displayName: 'Away AI 1',
      },
      {
        teamId: away.id,
        participantType: 'ai',
        battingPosition: 2,
        displayName: 'Away AI 2',
      },
    ],
  });
}
