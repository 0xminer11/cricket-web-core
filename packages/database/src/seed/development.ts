import { PLAYER_ARCHETYPES, TEAMS } from '@the-cricketer/game-core';
import type { PlayerAttributes } from '@the-cricketer/game-core';
import type { Database } from '../connection';
import type { PlayerFoundationInput } from '../player-foundation';
import { createPlayerFoundationIn } from '../player-foundation';
import type { Repositories } from '../repositories/index';

/**
 * DEVELOPMENT/TEST ONLY. Every user created here has origin='development' so a production check
 * (`SELECT count(*) FROM users WHERE origin <> 'organic'`) can prove none leaked. Ids are fixed so
 * reruns are no-ops and other modules' tests can reference them.
 */
export const DEV_IDS = {
  cricketerUser: '00000000-0000-7000-8000-00000000d001',
  batterUser: '00000000-0000-7000-8000-00000000d002',
  fastBowlerUser: '00000000-0000-7000-8000-00000000d003',
  allRounderUser: '00000000-0000-7000-8000-00000000d004',
} as const;

const archetype = (id: string): PlayerAttributes => {
  const found = PLAYER_ARCHETYPES.find((a) => a.id === id);
  if (!found) throw new Error(`Missing archetype ${id}`);
  return structuredClone(found.attributes) as PlayerAttributes;
};

const STARTER_KIT = [
  { itemDefinitionId: 'item.bat.street_willow_01', equip: true },
  { itemDefinitionId: 'item.gloves.quick_touch_01', equip: true },
  { itemDefinitionId: 'item.pads.mobile_guard_01', equip: true },
] as const;

const appearance = (n: number): PlayerFoundationInput['appearance'] => ({
  bodyPresetId: 'body.athletic_01',
  facePresetId: `face.preset_0${n}`,
  skinToneId: `skin.tone_0${n}`,
  hairStyleId: 'hair.short_01',
  hairColorId: 'haircolor.black',
  beardStyleId: null,
  heightScale: 1,
});

interface DevPlayerSpec {
  readonly userId: string;
  readonly input: Omit<PlayerFoundationInput, 'userId' | 'idempotencyPrefix'>;
}

function specs(): readonly DevPlayerSpec[] {
  const allRounder = archetype('archetype.power_finisher');
  const swing = archetype('archetype.swing_specialist');
  const team = TEAMS[0]?.teamId;
  if (!team) throw new Error('Missing Module 0 team definitions');
  const base = {
    career: { tier: 'academy' as const, teamDefinitionId: team },
    startingBalances: { coins: 5000, gems: 100 },
    starterItems: STARTER_KIT,
  };
  return [
    {
      // The all-purpose fixture for Modules 3-6: top-order batter, academy tier, level 5.
      userId: DEV_IDS.cricketerUser,
      input: {
        ...base,
        profile: {
          displayName: 'Dev Cricketer',
          countryCode: 'IN',
          jerseyNumber: 7,
          battingHand: 'right',
          primaryRole: 'top_order_batter',
        },
        appearance: appearance(1),
        attributes: archetype('archetype.technical_opener'),
        level: 5,
        currentXp: 120,
      },
    },
    {
      userId: DEV_IDS.batterUser,
      input: {
        ...base,
        profile: {
          displayName: 'Dev Batter',
          countryCode: 'IN',
          jerseyNumber: 18,
          battingHand: 'left',
          primaryRole: 'finisher',
        },
        appearance: appearance(2),
        attributes: archetype('archetype.power_finisher'),
        level: 3,
      },
    },
    {
      userId: DEV_IDS.fastBowlerUser,
      input: {
        ...base,
        profile: {
          displayName: 'Dev Fast Bowler',
          countryCode: 'AU',
          jerseyNumber: 99,
          battingHand: 'right',
          primaryRole: 'fast_bowler',
          bowlingStyle: 'right_arm_fast',
        },
        appearance: appearance(3),
        attributes: archetype('archetype.fast_enforcer'),
        level: 4,
      },
    },
    {
      userId: DEV_IDS.allRounderUser,
      input: {
        ...base,
        profile: {
          displayName: 'Dev All-Rounder',
          countryCode: 'GB',
          jerseyNumber: 10,
          battingHand: 'right',
          primaryRole: 'batting_all_rounder',
          secondaryRoles: ['bowling_all_rounder'],
          bowlingStyle: 'right_arm_medium',
        },
        appearance: appearance(4),
        attributes: {
          batting: allRounder.batting,
          bowling: swing.bowling,
          physical: swing.physical,
          personality: allRounder.personality,
        },
        level: 5,
      },
    },
  ];
}

export interface DevelopmentSeedResult {
  readonly created: readonly string[];
  readonly skipped: readonly string[];
  readonly matchId: string | null;
}

/** Create the development players (once) and one completed 2-over match for the Dev Cricketer. */
export async function seedDevelopmentData(
  database: Database,
  environment: string,
): Promise<DevelopmentSeedResult> {
  if (!['development', 'test'].includes(environment))
    throw new Error(`Development seed data is not allowed in ${environment}`);
  const created: string[] = [];
  const skipped: string[] = [];
  for (const spec of specs()) {
    await database.transaction(
      async (tx) => {
        const repos = database.repositories(tx);
        if (await repos.users.findById(spec.userId)) {
          skipped.push(spec.input.profile.displayName);
          return;
        }
        await repos.users.create({ id: spec.userId, origin: 'development' });
        await createPlayerFoundationIn(repos, {
          ...spec.input,
          userId: spec.userId,
          idempotencyPrefix: `dev-seed:${spec.userId}`,
        });
        created.push(spec.input.profile.displayName);
      },
      { operation: 'seed.development_player' },
    );
  }
  const matchId = await database.transaction(
    (tx) => seedDevelopmentMatch(database.repositories(tx)),
    { operation: 'seed.development_match' },
  );
  return { created, skipped, matchId };
}

/** Deterministic scorecard data only (no cricket simulation): 2 x 2 overs of hand-written deliveries. */
async function seedDevelopmentMatch(
  repos: Repositories,
): Promise<string | null> {
  const dev = await repos.players.findByUserId(DEV_IDS.cricketerUser);
  if (!dev) return null;
  if (
    (await repos.matches.listPlayerMatchHistory(dev.id, { limit: 1 })).items
      .length > 0
  )
    return null;

  const [home, away] = await repos.teams.ensureCanonicalTeams([
    'team.academy.riverhawks',
    'team.club.metro_stallions',
  ]);
  if (!home || !away) return null;
  const summary = await repos.matches.createMatch({
    matchMode: 'friendly',
    matchFormatId: 'format.2_over',
    pitchDefinitionId: 'pitch.green',
    homeTeamId: home.id,
    awayTeamId: away.id,
    rngSeed: 'dev-seed-match',
    rngAlgorithmVersion: 'dev',
    participants: [
      {
        teamId: home.id,
        participantType: 'human',
        playerId: dev.id,
        battingPosition: 1,
        selectedRole: 'top_order_batter',
        displayName: dev.displayName,
        overall: 62,
      },
      {
        teamId: home.id,
        participantType: 'ai',
        battingPosition: 2,
        displayName: 'Home AI Batter',
        overall: 45,
      },
      {
        teamId: away.id,
        participantType: 'ai',
        battingPosition: 1,
        displayName: 'Away AI Batter',
        overall: 50,
      },
      {
        teamId: away.id,
        participantType: 'ai',
        battingPosition: 2,
        displayName: 'Away AI Bowler',
        overall: 48,
      },
    ],
  });
  const p = (teamId: string, position: number) => {
    const found = summary.participants.find(
      (x) => x.teamId === teamId && x.battingPosition === position,
    );
    if (!found) throw new Error('participant missing');
    return found.id;
  };
  const matchId = summary.match.id;
  await repos.matches.startMatch(matchId);

  // [runsOffBat, wicket]; 12 legal deliveries per innings.
  const innings: readonly {
    batting: string;
    bowling: string;
    balls: readonly [number, boolean][];
  }[] = [
    {
      batting: home.id,
      bowling: away.id,
      balls: [
        [1, false],
        [0, false],
        [4, false],
        [0, false],
        [2, false],
        [6, false],
        [0, false],
        [1, false],
        [4, false],
        [0, false],
        [1, false],
        [0, true],
      ],
    },
    {
      batting: away.id,
      bowling: home.id,
      balls: [
        [0, false],
        [1, false],
        [0, false],
        [2, false],
        [0, false],
        [4, false],
        [1, false],
        [0, false],
        [0, false],
        [1, false],
        [2, false],
        [0, false],
      ],
    },
  ];
  let inningsNumber = 0;
  for (const spec of innings) {
    inningsNumber += 1;
    const inn = await repos.matches.createInnings({
      matchId,
      inningsNumber,
      battingTeamId: spec.batting,
      bowlingTeamId: spec.bowling,
    });
    const striker = p(spec.batting, 1);
    const nonStriker = p(spec.batting, 2);
    const bowler = p(spec.bowling, 2);
    let sequence = 0;
    for (const overNumber of [1, 2]) {
      const over = await repos.matches.startOver({
        inningsId: inn.id,
        overNumber,
        bowlerParticipantId: bowler,
      });
      for (let ball = 1; ball <= 6; ball += 1) {
        sequence += 1;
        const [runs, wicket] = spec.balls[sequence - 1] ?? [0, false];
        await repos.matches.recordBall({
          overId: over.id,
          sequenceNumber: sequence,
          ballInOver: ball,
          strikerParticipantId: striker,
          nonStrikerParticipantId: nonStriker,
          bowlerParticipantId: bowler,
          deliveryDefinitionId: 'delivery.fast.outswing',
          line: 'off_stump',
          length: 'good',
          runsOffBat: runs,
          extras: 0,
          legalDelivery: true,
          ...(wicket
            ? { wicketType: 'bowled' as const, dismissedParticipantId: striker }
            : {}),
        });
      }
      await repos.matches.completeOver(over.id);
    }
    await repos.matches.completeInnings(inn.id);
  }
  await repos.matches.completeMatch({
    matchId,
    resultType: 'win',
    winnerTeamId: home.id,
    resultSummary: 'River Hawks Academy won by 8 runs',
  });
  return matchId;
}
