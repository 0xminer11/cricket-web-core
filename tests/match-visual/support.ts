import type {
  DeliveryOutcomeDto,
  DeliveryResultDto,
  MatchPlayStateDto,
  ResolvedDeliveryDto,
  ResolvedShotDto,
} from '../../packages/shared-types/src/index';

export const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '844x390', width: 844, height: 390 },
  { name: '390x844', width: 390, height: 844 },
] as const;

export function makeDelivery(
  overrides: Partial<ResolvedDeliveryDto> = {},
): ResolvedDeliveryDto {
  return {
    variationId: 'delivery.fast.outswing',
    name: 'Fast Outswing',
    intended: {
      target: { x: 0.3, y: 0.45 },
      line: 'outside_off',
      length: 'good',
      lineLabel: 'Outside off',
      lengthLabel: 'Good length',
    },
    actual: {
      target: { x: 0.32, y: 0.5 },
      line: 'outside_off',
      length: 'good',
      lineLabel: 'Outside off',
      lengthLabel: 'Good length',
    },
    speedMs: 38,
    speedKmh: 136.8,
    movement: { swing: -0.2, seam: 0, spin: 0 },
    bounce: 0.5,
    executionRating: 'good',
    noBall: false,
    bowlingArm: 'right',
    battingHand: 'right',
    ...overrides,
  };
}

export function makeShot(
  overrides: Partial<ResolvedShotDto> = {},
): ResolvedShotDto {
  return {
    shotId: 'shot.cover_drive',
    name: 'Cover Drive',
    category: 'drive',
    contactQuality: 'good',
    sector: 'cover',
    worldDirection: 35,
    exitSpeed: 25,
    launchAngle: 8,
    ...overrides,
  };
}

export function makeOutcome(
  overrides: Partial<DeliveryOutcomeDto> = {},
): DeliveryOutcomeDto {
  return {
    runsOffBat: 1,
    extras: 0,
    extraType: null,
    wicketType: null,
    legal: true,
    totalRuns: 1,
    distanceClass: 'infield',
    headline: '1 RUN',
    detail: 'Cover Drive, good contact',
    ...overrides,
  };
}

export function makeState(
  overrides: Partial<MatchPlayStateDto> = {},
): MatchPlayStateDto {
  const card = (id: string, name: string) => ({
    id,
    name,
    movement: 'Swings away',
    difficulty: 'medium' as const,
    controlCost: 'medium' as const,
    defaultLength: 'good' as const,
    family: 'swing' as const,
  });
  const bowler = {
    playerId: 'p-bowl',
    name: 'Naveen',
    style: 'right_arm_fast',
    styleName: 'Right-arm fast',
    arm: 'right' as const,
    kind: 'fast' as const,
    oversText: '0.0',
    runs: 0,
    wickets: 0,
    maidens: 0,
    skills: { accuracy: 60, control: 55, consistency: 50, pace: 70, spin: 10 },
    fatigue: 0,
    isYou: true,
    deliveryIds: ['delivery.fast.stock', 'delivery.fast.outswing'],
  };
  return {
    matchId: '11111111-1111-4111-8111-111111111111',
    status: 'in_progress',
    phase: 'ready_to_bowl',
    expectedSequence: 1,
    format: {
      id: 'format.2_over',
      name: '2 overs',
      oversPerInnings: 2,
      ballsPerOver: 6,
      maxWickets: 3,
    },
    pitch: { id: 'pitch.hard', name: 'Hard', kind: 'hard' },
    you: {
      playerId: 'p-bowl',
      teamId: 't1',
      teamName: 'Mine',
      side: 'bowling',
      status: 'not_batting' as const,
    },
    battingTeam: { id: 't2', name: 'Them' },
    bowlingTeam: { id: 't1', name: 'Mine' },
    innings: {
      number: 1,
      isSuperOver: false,
      runs: 0,
      wickets: 0,
      legalBalls: 0,
      oversText: '0.0',
      maxBalls: 12,
      maxWickets: 3,
      target: null,
      runsNeeded: null,
      ballsRemaining: 12,
      requiredRate: null,
      currentRate: null,
    },
    previousInnings: [],
    striker: {
      playerId: 'b1',
      name: 'Rival',
      runs: 0,
      balls: 0,
      hand: 'right',
    },
    nonStriker: {
      playerId: 'b2',
      name: 'Partner',
      runs: 0,
      balls: 0,
      hand: 'left',
    },
    currentBowler: bowler,
    thisOver: [],
    overNumber: 1,
    eligibleBowlers: [],
    deliveryCatalog: {
      'delivery.fast.stock': card('delivery.fast.stock', 'Stock'),
      'delivery.fast.outswing': card('delivery.fast.outswing', 'Outswing'),
    },
    yourPerformance: null,
    scorecard: [],
    result: null,
    ...overrides,
  };
}

export function makeResult(
  overrides: Partial<DeliveryResultDto> = {},
): DeliveryResultDto {
  return {
    sequence: 1,
    inningsNumber: 1,
    overNumber: 1,
    ballInOver: 1,
    replayed: false,
    delivery: makeDelivery(),
    shot: makeShot(),
    outcome: makeOutcome(),
    batting: null,
    overSummary: null,
    events: [],
    match: makeState({ expectedSequence: 2 }),
    ...overrides,
  };
}
