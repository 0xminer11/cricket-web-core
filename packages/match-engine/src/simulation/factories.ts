import { clone } from '../state/clone';
import {
  PLAYER_ARCHETYPES,
  GAME_BALANCE_VERSION,
  MATCH_ENGINE_VERSION,
} from '@the-cricketer/game-core';
import type { Team } from '@the-cricketer/game-core';
import type {
  MatchPlayerSnapshot,
  MatchTeamSnapshot,
  CreateMatchInput,
  DeliveryIntent,
  ShotIntent,
} from '../state/types';
export function createTestPlayerSnapshot(
  overrides: Partial<MatchPlayerSnapshot> = {},
): MatchPlayerSnapshot {
  return {
    ...clone(PLAYER_ARCHETYPES[0]!.attributes),
    playerId: 'player.1',
    displayName: 'Arjun Rao',
    role: 'batting_all_rounder',
    battingHand: 'right',
    bowlingStyle: 'right_arm_fast',
    form: 50,
    fatigue: 0,
    equipmentModifiers: {},
    ...overrides,
  };
}
const NAMES = [
  'Arjun Rao',
  'Kabir Desai',
  'Rohan Sen',
  'Dev Menon',
  'Ishan Nair',
  'Aditya Shah',
  'Vikram Das',
  'Nikhil Roy',
  'Kiran Patel',
  'Rahul Bose',
  'Samar Singh',
];
export function createTestTeamSnapshot(
  teamId = 'team.a',
  rating = 55,
): MatchTeamSnapshot {
  const players = NAMES.map((displayName, index) => {
    const player = createTestPlayerSnapshot({
      playerId: `${teamId}.player.${index + 1}`,
      displayName,
      bowlingStyle: index % 3 === 0 ? 'off_spin' : 'right_arm_fast',
      battingHand: index % 4 === 0 ? 'left' : 'right',
    });
    for (const group of ['batting', 'bowling', 'physical'] as const)
      for (const key of Object.keys(player[group]))
        (player[group] as unknown as Record<string, number>)[key] = rating;
    return player;
  });
  return {
    teamId,
    displayName: teamId === 'team.a' ? 'Mysore Strikers' : 'Hubballi Warriors',
    players,
    battingOrder: players.map((p) => p.playerId),
    bowlingOrder: players.slice(5).map((p) => p.playerId),
  };
}
const FIRST_NAMES = [
  'Aarav',
  'Vihaan',
  'Ishaan',
  'Kabir',
  'Rohan',
  'Arjun',
  'Dev',
  'Nikhil',
  'Aditya',
  'Samar',
  'Karan',
  'Manav',
  'Yash',
  'Harsh',
  'Tanay',
  'Sahil',
  'Rahul',
  'Vikram',
  'Pranav',
  'Neel',
  'Rishi',
  'Siddharth',
  'Aman',
  'Dhruv',
  'Jay',
  'Kunal',
  'Omkar',
  'Parth',
  'Veer',
  'Zaid',
  'Faisal',
  'Imran',
  'Gurpreet',
  'Harpreet',
  'Mohit',
  'Naveen',
  'Pavan',
  'Raghav',
  'Sanjay',
  'Tarun',
];
const LAST_NAMES = [
  'Sharma',
  'Kumar',
  'Singh',
  'Patel',
  'Rao',
  'Nair',
  'Menon',
  'Desai',
  'Shah',
  'Das',
  'Roy',
  'Bose',
  'Khan',
  'Verma',
  'Iyer',
  'Reddy',
  'Gupta',
  'Joshi',
  'Kulkarni',
  'Mehta',
  'Chopra',
  'Pillai',
  'Bhat',
  'Hegde',
  'Shetty',
  'Naik',
  'Gowda',
  'Yadav',
  'Mishra',
  'Banerjee',
  'Ghosh',
  'Sen',
  'Malhotra',
  'Kapoor',
  'Thakur',
  'Pandey',
  'Rathore',
  'Chauhan',
  'Jain',
  'Dhillon',
];
/**
 * A realistic eleven by slot (batting order first, the bowlers last). The first five bat only; the rest
 * bowl, so the bowling order (players 6..11) is always valid for both formats.
 */
const ROSTER: readonly {
  readonly role: MatchPlayerSnapshot['role'];
  readonly style: MatchPlayerSnapshot['bowlingStyle'];
}[] = [
  { role: 'opening_batter', style: null },
  { role: 'opening_batter', style: null },
  { role: 'top_order_batter', style: null },
  { role: 'middle_order_batter', style: null },
  { role: 'wicketkeeper_batter', style: null },
  { role: 'finisher', style: 'right_arm_medium' },
  { role: 'batting_all_rounder', style: 'left_arm_medium' },
  { role: 'bowling_all_rounder', style: 'off_spin' },
  { role: 'spin_bowler', style: 'leg_spin' },
  { role: 'swing_bowler', style: 'left_arm_fast' },
  { role: 'fast_bowler', style: 'right_arm_fast' },
];
const hashText = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * Fictional roster from the existing team's cricket strengths, without hidden AI skill. Names are unique
 * within a team and differ between teams (a stable function of the team id); roles follow the slot, so a
 * team sheet reads like a real side. Attributes are unchanged by names and roles.
 */
export function createTeamSnapshot(definition: Team): MatchTeamSnapshot {
  const team = createTestTeamSnapshot(definition.teamId, definition.rating);
  team.displayName = definition.name;
  const firstSeed = hashText(`${definition.teamId}:first`);
  const lastSeed = hashText(`${definition.teamId}:last`);
  team.players.forEach((player, index) => {
    const slot = ROSTER[index]!;
    player.role = slot.role;
    player.bowlingStyle = slot.style;
    player.displayName = `${FIRST_NAMES[(firstSeed + index * 13) % FIRST_NAMES.length]!} ${LAST_NAMES[(lastSeed + index * 17) % LAST_NAMES.length]!}`;
  });
  for (const [index, player] of team.players.entries()) {
    const delta = (index % 5) - 2;
    for (const key of Object.keys(player.batting))
      (player.batting as unknown as Record<string, number>)[key] = Math.max(
        1,
        Math.min(100, definition.battingStrength + delta),
      );
    for (const key of Object.keys(player.bowling))
      (player.bowling as unknown as Record<string, number>)[key] = Math.max(
        1,
        Math.min(100, definition.bowlingStrength - delta),
      );
    Object.assign(player, {
      personality: {
        ...player.personality,
        riskAppetite: definition.aggression,
      },
    });
  }
  return team;
}
export function createTestMatch(
  overrides: Partial<CreateMatchInput> = {},
): CreateMatchInput {
  return {
    matchId: 'test-match',
    formatId: 'format.2_over',
    pitchId: 'pitch.hard',
    teamA: createTestTeamSnapshot(),
    teamB: createTestTeamSnapshot('team.b'),
    rngSeed: 'module8-example',
    balanceVersion: GAME_BALANCE_VERSION,
    matchEngineVersion: MATCH_ENGINE_VERSION,
    ...overrides,
  };
}
export const createTestDeliveryIntent = (
  overrides: Partial<DeliveryIntent> = {},
): DeliveryIntent => ({
  variationId: 'delivery.fast.stock',
  line: 'off_stump',
  length: 'good',
  ...overrides,
});
export const createTestShotIntent = (
  overrides: Partial<ShotIntent> = {},
): ShotIntent => ({ shotId: 'shot.cover_drive', ...overrides });
