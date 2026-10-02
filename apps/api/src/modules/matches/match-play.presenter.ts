import {
  DELIVERIES,
  LENGTH_LABELS,
  LINE_LABELS,
  MATCH_FORMATS,
  PITCHES,
  SHOTS,
  metersPerSecondToKmh,
} from '@the-cricketer/game-core';
import type {
  BowlingStyle,
  DeliveryDefinition,
} from '@the-cricketer/game-core';
import {
  bowlingArm,
  legalBallsToOvers,
  requiredRate,
  currentRunRate,
  playerPerformances,
  signedMovement,
} from '@the-cricketer/match-engine';
import type {
  CreateMatchInput,
  EngineBallResult,
  EngineInnings,
  EngineMatchState,
  MatchPlayerSnapshot,
  ResolvedDelivery,
  MatchTeamSnapshot,
} from '@the-cricketer/match-engine';
import type {
  BattingFeedbackDto,
  BowlerOptionDto,
  DeliveryPreviewDto,
  DeliveryResultDto,
  MatchPlayStateDto,
} from '@the-cricketer/shared-types';

/** Player-facing wording and thresholds for labels only; none of these touch the cricket result. */
export const STYLE_NAMES: Record<BowlingStyle, string> = {
  right_arm_fast: 'Right-arm fast',
  left_arm_fast: 'Left-arm fast',
  right_arm_medium: 'Right-arm medium',
  left_arm_medium: 'Left-arm medium',
  off_spin: 'Off spin',
  leg_spin: 'Leg spin',
  left_arm_orthodox: 'Left-arm orthodox',
  left_arm_wrist_spin: 'Left-arm wrist spin',
};
const MOVEMENT_TEXT: Record<DeliveryDefinition['movementProfile'], string> = {
  none: 'Straight',
  swing_out: 'Swings away',
  swing_in: 'Swings in',
  seam: 'Seam movement',
  cutter: 'Cuts off the pitch',
  slower: 'Slower, deceptive',
  off_break: 'Turns from off',
  leg_break: 'Turns from leg',
  googly: 'Googly: turns back in',
  top_spin: 'Dips and bounces',
};
const FAMILY: Record<
  DeliveryDefinition['movementProfile'],
  'straight' | 'swing' | 'seam' | 'spin' | 'slower'
> = {
  none: 'straight',
  swing_out: 'swing',
  swing_in: 'swing',
  seam: 'seam',
  cutter: 'seam',
  slower: 'slower',
  off_break: 'spin',
  leg_break: 'spin',
  googly: 'spin',
  top_spin: 'spin',
};
const CARD_BANDS = {
  difficulty: [0.3, 0.5],
  controlCost: [0.08, 0.15],
  executionRating: [0.35, 0.55, 0.75],
} as const;
const band = (
  value: number,
  [low, high]: readonly [number, number],
): 'low' | 'medium' | 'high' =>
  value < low ? 'low' : value < high ? 'medium' : 'high';

export const bowlerKind = (style: BowlingStyle): 'fast' | 'medium' | 'spin' =>
  ['off_spin', 'leg_spin', 'left_arm_orthodox', 'left_arm_wrist_spin'].includes(
    style,
  )
    ? 'spin'
    : style.includes('medium')
      ? 'medium'
      : 'fast';

export const deliveryCard = (definition: DeliveryDefinition) => ({
  id: definition.id,
  name: definition.displayName,
  movement: MOVEMENT_TEXT[definition.movementProfile],
  difficulty: band(definition.difficulty, CARD_BANDS.difficulty),
  controlCost: band(definition.controlPenalty, CARD_BANDS.controlCost),
  defaultLength: definition.defaultLength,
  family: FAMILY[definition.movementProfile],
});

export const deliveriesFor = (style: BowlingStyle) =>
  DELIVERIES.filter((d) => d.eligibleStyles.includes(style));

export interface PlayContext {
  readonly input: CreateMatchInput;
  readonly state: EngineMatchState;
  readonly youPlayerId: string;
  /** engine.eligibleBowlers() at the moment of presentation */
  readonly eligibleBowlers: readonly string[];
  readonly maxOversPerBowler: number | null;
}

const teams = (input: CreateMatchInput) => [input.teamA, input.teamB];
export function findPlayer(
  input: CreateMatchInput,
  playerId: string,
): { team: MatchTeamSnapshot; player: MatchPlayerSnapshot } | null {
  for (const team of teams(input)) {
    const player = team.players.find((p) => p.playerId === playerId);
    if (player) return { team, player };
  }
  return null;
}
export const teamOf = (input: CreateMatchInput, playerId: string) =>
  findPlayer(input, playerId)?.team ?? null;
const teamById = (input: CreateMatchInput, id: string) =>
  teams(input).find((t) => t.teamId === id)!;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function ballLabel(ball: EngineBallResult): {
  label: string;
  runs: number;
} {
  const total = ball.runsOffBat + ball.extras;
  if (ball.wicketType) return { label: 'W', runs: total };
  switch (ball.extraType) {
    case 'wide':
      return {
        label: ball.extras > 1 ? `Wd${ball.extras}` : 'Wd',
        runs: total,
      };
    case 'no_ball':
      return {
        label: ball.runsOffBat ? `Nb+${ball.runsOffBat}` : 'Nb',
        runs: total,
      };
    case 'bye':
      return { label: `B${ball.extras}`, runs: total };
    case 'leg_bye':
      return { label: `Lb${ball.extras}`, runs: total };
    default:
      return { label: total === 0 ? '•' : String(total), runs: total };
  }
}

/** Which side the human is on for the innings in progress, or about to start. */
function sideFor(
  state: EngineMatchState,
  youTeamId: string,
): 'batting' | 'bowling' {
  const last = state.innings.at(-1);
  if (!last) return 'bowling';
  if (state.status === 'innings_break') {
    const number = state.innings.length + 1;
    const batting =
      number === 3 ? state.innings[1]!.battingTeamId : last.bowlingTeamId;
    return batting === youTeamId ? 'batting' : 'bowling';
  }
  return last.battingTeamId === youTeamId ? 'batting' : 'bowling';
}

function bowlerOption(
  context: PlayContext,
  innings: EngineInnings,
  player: MatchPlayerSnapshot,
): BowlerOptionDto {
  const style = player.bowlingStyle!;
  const bowled = innings.overs.filter((o) => o.bowlerId === player.playerId);
  const cap = innings.isSuperOver ? 1 : context.maxOversPerBowler;
  const eligible = context.eligibleBowlers.includes(player.playerId);
  let reason: string | null = null;
  if (!eligible) {
    reason =
      innings.overs.at(-1)?.bowlerId === player.playerId
        ? 'Bowled the previous over'
        : cap !== null && bowled.length >= cap
          ? `Has bowled the maximum ${plural(cap, 'over', 'overs')}`
          : 'Not available right now';
  }
  return {
    playerId: player.playerId,
    name: player.displayName,
    style,
    styleName: STYLE_NAMES[style],
    arm: bowlingArm(style),
    kind: bowlerKind(style),
    oversBowled: bowled.length,
    maxOvers: cap,
    eligible,
    reason,
    skills: {
      accuracy: player.bowling.accuracy,
      control: player.bowling.control,
      consistency: player.bowling.consistency,
      pace: player.bowling.pace,
      spin: player.bowling.spin,
    },
    fatigue: Math.round(player.fatigue),
    isYou: player.playerId === context.youPlayerId,
    deliveryIds: deliveriesFor(style).map((d) => d.id),
  };
}

export function resultText(
  state: EngineMatchState,
  input: CreateMatchInput,
): string | null {
  const result = state.result;
  if (!result) return null;
  const suffix = result.superOver ? ' in a Super Over' : '';
  if (result.type === 'tie') return `Match tied${suffix}`;
  const winner = teamById(input, result.winnerTeamId!).displayName;
  return `${winner} won by ${
    result.marginType === 'runs'
      ? plural(result.margin, 'run', 'runs')
      : plural(result.margin, 'wicket', 'wickets')
  }${suffix}`;
}

export function presentMatch(context: PlayContext): MatchPlayStateDto {
  const { input, state } = context;
  const you = findPlayer(input, context.youPlayerId)!;
  const format = MATCH_FORMATS.find((f) => f.id === state.formatId)!;
  const pitch = PITCHES.find((p) => p.id === state.pitchId)!;
  const innings = state.innings.at(-1)!;
  const side = sideFor(state, you.team.teamId);
  const battingTeam = teamById(input, innings.battingTeamId);
  const bowlingTeam = teamById(input, innings.bowlingTeamId);
  const players = new Map(
    teams(input).flatMap((t) => t.players.map((p) => [p.playerId, p] as const)),
  );
  const person = (id: string | null) => {
    if (!id) return null;
    const figure = innings.batting.find((b) => b.playerId === id)!;
    const player = players.get(id)!;
    return {
      playerId: id,
      name: player.displayName,
      runs: figure.runs,
      balls: figure.balls,
      hand: player.battingHand,
    };
  };

  let phase: MatchPlayStateDto['phase'];
  if (state.status === 'completed') phase = 'completed';
  else if (state.status === 'abandoned') phase = 'abandoned';
  else if (state.status === 'innings_break') phase = 'innings_break';
  else if (state.status !== 'in_progress') phase = 'simulate_required';
  else if (side === 'batting')
    phase =
      innings.strikerId === context.youPlayerId
        ? 'ready_to_bat'
        : 'simulate_required';
  else phase = innings.currentBowlerId ? 'ready_to_bowl' : 'bowler_select';

  const bowlerSnapshot = innings.currentBowlerId
    ? players.get(innings.currentBowlerId)!
    : null;
  const bowlerFigure = innings.currentBowlerId
    ? innings.bowling.find((b) => b.playerId === innings.currentBowlerId)!
    : null;
  const options =
    phase === 'bowler_select'
      ? bowlingTeam.bowlingOrder.map((id) =>
          bowlerOption(context, innings, players.get(id)!),
        )
      : [];
  const catalogStyles = new Set<BowlingStyle>();
  for (const option of options) catalogStyles.add(option.style as BowlingStyle);
  if (bowlerSnapshot) catalogStyles.add(bowlerSnapshot.bowlingStyle!);
  const catalog: MatchPlayStateDto['deliveryCatalog'] = {};
  for (const style of catalogStyles)
    for (const definition of deliveriesFor(style))
      catalog[definition.id] = deliveryCard(definition);

  const lastOver = innings.overs.at(-1);
  const thisOver = (lastOver?.balls ?? []).map((ball) => {
    const { label, runs } = ballLabel(ball);
    return {
      label,
      legal: ball.legalDelivery,
      runs,
      wicket: ball.wicketType !== null,
    };
  });
  const ballsRemaining = Math.max(0, innings.maxBalls - innings.legalBalls);
  const runsNeeded =
    innings.target !== null ? Math.max(0, innings.target - innings.runs) : null;
  const perOver = format.ballsPerOver;
  return {
    matchId: state.matchId,
    status: state.status,
    phase,
    expectedSequence: state.sequence + 1,
    format: {
      id: format.id,
      name: format.displayName,
      oversPerInnings: format.oversPerInnings,
      ballsPerOver: perOver,
      maxWickets: format.maxWickets,
    },
    pitch: {
      id: pitch.id,
      name: pitch.displayName,
      kind: pitch.id.replace('pitch.', '') as 'green' | 'hard' | 'dry',
    },
    you: {
      playerId: you.player.playerId,
      teamId: you.team.teamId,
      teamName: you.team.displayName,
      side,
      status: battingStatus(innings, side, context.youPlayerId),
    },
    battingTeam: { id: battingTeam.teamId, name: battingTeam.displayName },
    bowlingTeam: { id: bowlingTeam.teamId, name: bowlingTeam.displayName },
    innings: {
      number: innings.inningsNumber,
      isSuperOver: innings.isSuperOver,
      runs: innings.runs,
      wickets: innings.wickets,
      legalBalls: innings.legalBalls,
      oversText: legalBallsToOvers(innings.legalBalls, perOver),
      maxBalls: innings.maxBalls,
      maxWickets: innings.maxWickets,
      target: innings.target,
      runsNeeded,
      ballsRemaining,
      requiredRate:
        runsNeeded === null
          ? null
          : round2(requiredRate(runsNeeded, ballsRemaining, perOver)),
      currentRate:
        innings.legalBalls > 0
          ? round2(currentRunRate(innings.runs, innings.legalBalls, perOver))
          : null,
    },
    previousInnings: state.innings.slice(0, -1).map((i) => ({
      number: i.inningsNumber,
      teamName: teamById(input, i.battingTeamId).displayName,
      score: `${i.runs}/${i.wickets}`,
    })),
    striker: person(innings.strikerId),
    nonStriker: person(innings.nonStrikerId),
    currentBowler:
      bowlerSnapshot && bowlerFigure
        ? {
            playerId: bowlerSnapshot.playerId,
            name: bowlerSnapshot.displayName,
            style: bowlerSnapshot.bowlingStyle!,
            styleName: STYLE_NAMES[bowlerSnapshot.bowlingStyle!],
            arm: bowlingArm(bowlerSnapshot.bowlingStyle!),
            kind: bowlerKind(bowlerSnapshot.bowlingStyle!),
            oversText: legalBallsToOvers(bowlerFigure.legalBalls, perOver),
            runs: bowlerFigure.runs,
            wickets: bowlerFigure.wickets,
            maidens: bowlerFigure.maidens,
            skills: {
              accuracy: bowlerSnapshot.bowling.accuracy,
              control: bowlerSnapshot.bowling.control,
              consistency: bowlerSnapshot.bowling.consistency,
              pace: bowlerSnapshot.bowling.pace,
              spin: bowlerSnapshot.bowling.spin,
            },
            fatigue: Math.round(bowlerSnapshot.fatigue),
            isYou: bowlerSnapshot.playerId === context.youPlayerId,
            deliveryIds: deliveriesFor(bowlerSnapshot.bowlingStyle!).map(
              (d) => d.id,
            ),
          }
        : null,
    thisOver,
    overNumber: lastOver?.overNumber ?? 0,
    eligibleBowlers: options,
    deliveryCatalog: catalog,
    scorecard:
      state.status === 'completed'
        ? state.innings.map((i) => scorecardFor(context, i))
        : [],
    yourPerformance:
      state.status === 'completed' ? performanceFor(context) : null,
    result: state.result
      ? {
          type: state.result.type,
          text: resultText(state, input)!,
          winnerTeamName: state.result.winnerTeamId
            ? teamById(input, state.result.winnerTeamId).displayName
            : null,
          youWon: state.result.winnerTeamId
            ? state.result.winnerTeamId === you.team.teamId
            : null,
          superOver: state.result.superOver,
        }
      : null,
  };
}

/** The player's own figures for the finished match, from the same rating the engine uses for rewards. */
function performanceFor(
  context: PlayContext,
): NonNullable<MatchPlayStateDto['yourPerformance']> {
  const mine = playerPerformances(context.state, context.input).find(
    (p) => p.playerId === context.youPlayerId,
  );
  const batting = mine?.batting ?? null;
  const bowling = mine?.bowling ?? null;
  return {
    rating: mine?.rating ?? 0,
    batting: batting
      ? {
          runs: batting.runs,
          balls: batting.balls,
          fours: batting.fours,
          sixes: batting.sixes,
          strikeRate: batting.balls ? round(batting.strikeRate, 1) : null,
          dismissal: batting.dismissal
            ? (WICKET_TEXT[batting.dismissal] ?? batting.dismissal)
            : null,
          notOut: batting.notOut,
        }
      : null,
    bowling: bowling
      ? {
          oversText: legalBallsToOvers(bowling.legalBalls, 6),
          runs: bowling.runs,
          wickets: bowling.wickets,
          maidens: bowling.maidens,
          economy: bowling.legalBalls ? round(bowling.economy, 2) : null,
        }
      : null,
  };
}

function scorecardFor(context: PlayContext, innings: EngineInnings) {
  const { input } = context;
  const perOver = MATCH_FORMATS.find(
    (f) => f.id === context.state.formatId,
  )!.ballsPerOver;
  const name = (id: string) => findPlayer(input, id)!.player.displayName;
  return {
    number: innings.inningsNumber,
    teamName: teamById(input, innings.battingTeamId).displayName,
    isSuperOver: innings.isSuperOver,
    score: `${innings.runs}/${innings.wickets}`,
    oversText: legalBallsToOvers(innings.legalBalls, perOver),
    extras: innings.extras,
    batting: innings.batting
      .filter((b) => b.balls > 0 || b.dismissal !== null)
      .map((b) => ({
        name: name(b.playerId),
        runs: b.runs,
        balls: b.balls,
        fours: b.fours,
        sixes: b.sixes,
        dismissal: b.dismissal
          ? (WICKET_TEXT[b.dismissal] ?? b.dismissal)
          : null,
        isYou: b.playerId === context.youPlayerId,
      })),
    bowling: innings.bowling
      .filter((b) => b.legalBalls > 0 || b.runs > 0)
      .map((b) => ({
        name: name(b.playerId),
        oversText: legalBallsToOvers(b.legalBalls, perOver),
        runs: b.runs,
        wickets: b.wickets,
        maidens: b.maidens,
        economy:
          b.legalBalls > 0
            ? round(currentRunRate(b.runs, b.legalBalls, perOver), 2)
            : null,
        isYou: b.playerId === context.youPlayerId,
      })),
  };
}

export const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
function round2(n: number | null): number | null {
  return n === null ? null : round(n, 2);
}

export const WICKET_TEXT: Record<string, string> = {
  bowled: 'Bowled',
  caught: 'Caught',
  lbw: 'LBW',
  run_out: 'Run out',
  stumped: 'Stumped',
  hit_wicket: 'Hit wicket',
};
const CONTACT_TEXT: Record<string, string> = {
  perfect: 'perfect contact',
  good: 'good contact',
  okay: 'okay contact',
  poor: 'poor contact',
  edge: 'an edge',
  miss: 'a miss',
};

function headline(ball: EngineBallResult, shotName: string) {
  const contact = CONTACT_TEXT[ball.shot.contactQuality]!;
  const how = `${shotName}, ${contact}`;
  if (ball.wicketType)
    return {
      headline: 'WICKET',
      detail: `${WICKET_TEXT[ball.wicketType] ?? ball.wicketType} - ${how}`,
    };
  if (ball.extraType === 'wide')
    return { headline: 'WIDE', detail: 'Too wide to play: 1 extra run' };
  if (ball.extraType === 'no_ball')
    return {
      headline: 'NO BALL',
      detail: ball.runsOffBat
        ? `Free hit scored ${ball.runsOffBat} off the bat - ${how}`
        : `1 extra run - ${how}`,
    };
  if (ball.extraType === 'bye' || ball.extraType === 'leg_bye')
    return {
      headline: ball.extraType === 'bye' ? 'BYE' : 'LEG BYE',
      detail: `${ball.extras} extra run - ${how}`,
    };
  if (ball.runsOffBat === 6) return { headline: 'SIX', detail: how };
  if (ball.runsOffBat === 4) return { headline: 'FOUR', detail: how };
  if (ball.runsOffBat === 0) return { headline: 'DOT BALL', detail: how };
  return {
    headline: plural(ball.runsOffBat, 'RUN', 'RUNS'),
    detail: how,
  };
}

/** Where the player's own Cricketer is in the innings that is on (or about to start). */
function battingStatus(
  innings: EngineInnings,
  side: 'batting' | 'bowling',
  youPlayerId: string,
): MatchPlayStateDto['you']['status'] {
  if (side === 'bowling') return 'not_batting';
  if (innings.strikerId === youPlayerId) return 'on_strike';
  if (innings.nonStrikerId === youPlayerId) return 'non_striker';
  const figure = innings.batting.find((b) => b.playerId === youPlayerId);
  return figure?.dismissal ? 'dismissed' : 'waiting';
}

const CONTACT_LABEL = {
  perfect: 'PERFECT',
  good: 'GOOD',
  okay: 'OKAY',
  poor: 'POOR',
  edge: 'EDGE',
  miss: 'MISS',
} as const;

export interface HumanTiming {
  readonly input: number;
  readonly assist: 'off' | 'normal' | 'high' | 'auto';
  readonly label: BattingFeedbackDto['timing'];
}

/** The delivery the AI bowler is about to bowl, before any shot: no contact, no outcome, no no-ball flag. */
export function presentPreview(
  context: PlayContext,
  input: {
    readonly sequence: number;
    readonly inningsNumber: number;
    readonly overNumber: number;
    readonly ballInOver: number;
    readonly bowlerId: string;
    readonly strikerId: string;
    readonly delivery: ResolvedDelivery;
  },
): DeliveryPreviewDto {
  const bowler = findPlayer(context.input, input.bowlerId)!.player;
  const batter = findPlayer(context.input, input.strikerId)!.player;
  const style = bowler.bowlingStyle!;
  const definition = DELIVERIES.find(
    (d) => d.id === input.delivery.deliveryDefinitionId,
  )!;
  const movement = signedMovement(input.delivery, style, batter.battingHand);
  return {
    sequence: input.sequence,
    inningsNumber: input.inningsNumber,
    overNumber: input.overNumber,
    ballInOver: input.ballInOver,
    bowler: {
      playerId: bowler.playerId,
      name: bowler.displayName,
      style,
      styleName: STYLE_NAMES[style],
      arm: bowlingArm(style),
      kind: bowlerKind(style),
    },
    delivery: {
      variationId: definition.id,
      name: definition.displayName,
      target: {
        x: round(input.delivery.actualTarget.x, 4),
        y: round(input.delivery.actualTarget.y, 4),
      },
      line: input.delivery.actualLine,
      length: input.delivery.actualLength,
      lineLabel: LINE_LABELS[input.delivery.actualLine],
      lengthLabel: LENGTH_LABELS[input.delivery.actualLength],
      speedMs: round(input.delivery.speed, 2),
      speedKmh: round(metersPerSecondToKmh(input.delivery.speed), 1),
      movement: {
        swing: round(movement.swing, 4),
        seam: round(movement.seam, 4),
        spin: round(movement.spin, 4),
      },
      bounce: round(input.delivery.bounce, 3),
      bowlingArm: bowlingArm(style),
      battingHand: batter.battingHand,
    },
    match: presentMatch(context),
  };
}

export function presentDelivery(
  context: PlayContext,
  ball: EngineBallResult,
  replayed: boolean,
  human: HumanTiming | null = null,
): DeliveryResultDto {
  const bowler = findPlayer(context.input, ball.bowlerId)!.player;
  const batter = findPlayer(context.input, ball.strikerId)!.player;
  const style = bowler.bowlingStyle!;
  const definition = DELIVERIES.find(
    (d) => d.id === ball.delivery.deliveryDefinitionId,
  )!;
  const shot = SHOTS.find((s) => s.id === ball.shot.shotId)!;
  const movement = signedMovement(ball.delivery, style, batter.battingHand);
  const q = ball.delivery.executionQuality;
  const [poor, average, good] = CARD_BANDS.executionRating;
  const side = (
    target: { x: number; y: number },
    line: EngineBallResult['delivery']['actualLine'],
    length: EngineBallResult['delivery']['actualLength'],
  ) => ({
    target: { x: round(target.x, 4), y: round(target.y, 4) },
    line,
    length,
    lineLabel: LINE_LABELS[line],
    lengthLabel: LENGTH_LABELS[length],
  });
  const said = headline(ball, shot.displayName);
  return {
    sequence: ball.sequenceNumber,
    inningsNumber: ball.inningsNumber,
    overNumber: ball.overNumber,
    ballInOver: ball.ballInOver,
    replayed,
    delivery: {
      variationId: definition.id,
      name: definition.displayName,
      intended: side(
        ball.delivery.target,
        ball.delivery.intendedLine,
        ball.delivery.intendedLength,
      ),
      actual: side(
        ball.delivery.actualTarget,
        ball.delivery.actualLine,
        ball.delivery.actualLength,
      ),
      speedMs: round(ball.delivery.speed, 2),
      speedKmh: round(metersPerSecondToKmh(ball.delivery.speed), 1),
      movement: {
        swing: round(movement.swing, 4),
        seam: round(movement.seam, 4),
        spin: round(movement.spin, 4),
      },
      bounce: round(ball.delivery.bounce, 3),
      executionRating:
        q < poor
          ? 'poor'
          : q < average
            ? 'average'
            : q < good
              ? 'good'
              : 'excellent',
      noBall: ball.delivery.noBall,
      bowlingArm: bowlingArm(style),
      battingHand: batter.battingHand,
    },
    shot: {
      shotId: shot.id,
      name: shot.displayName,
      category: shot.category,
      contactQuality: ball.shot.contactQuality,
      sector: ball.shot.sector,
      worldDirection: round(ball.shot.worldDirection, 1),
      exitSpeed: round(ball.shot.exitSpeed, 1),
      launchAngle: ball.shot.launchAngle,
    },
    outcome: {
      runsOffBat: ball.runsOffBat,
      extras: ball.extras,
      extraType: ball.extraType,
      wicketType: ball.wicketType,
      legal: ball.legalDelivery,
      totalRuns: ball.runsOffBat + ball.extras,
      distanceClass: ball.distanceClass,
      ...said,
    },
    batting: human
      ? {
          timing: human.label,
          timingInput: human.input,
          assist: human.assist,
          contact: CONTACT_LABEL[ball.shot.contactQuality],
        }
      : null,
    overSummary: ball.events.some((e) => e.type === 'OVER_COMPLETED')
      ? overSummaryFor(context, ball)
      : null,
    events: ball.events.map((e) => ({
      type: e.type,
      inningsNumber: e.inningsNumber,
      ...(e.playerId ? { playerId: e.playerId } : {}),
      ...(e.runs !== undefined ? { runs: e.runs } : {}),
    })),
    match: presentMatch(context),
  };
}

/** The end-of-over card for the ball that completes an over: everything is read from the engine state. */
export function overSummaryFor(
  context: PlayContext,
  ball: EngineBallResult,
): NonNullable<DeliveryResultDto['overSummary']> {
  const { input, state } = context;
  const innings = state.innings[ball.inningsNumber - 1]!;
  const over = innings.overs.find((o) => o.overNumber === ball.overNumber)!;
  const perOver = MATCH_FORMATS.find(
    (f) => f.id === state.formatId,
  )!.ballsPerOver;
  const name = (id: string) => findPlayer(input, id)!.player.displayName;
  const figure = innings.bowling.find((b) => b.playerId === over.bowlerId)!;
  const batterLine = (id: string | null) => {
    if (!id) return null;
    const b = innings.batting.find((x) => x.playerId === id)!;
    return `${name(id)} ${b.runs}${b.dismissal ? '' : '*'} (${b.balls})`;
  };
  const needed =
    innings.target !== null ? Math.max(0, innings.target - innings.runs) : null;
  const remaining = Math.max(0, innings.maxBalls - innings.legalBalls);
  return {
    overNumber: over.overNumber,
    inningsNumber: innings.inningsNumber,
    score: `${innings.runs}/${innings.wickets}`,
    runsInOver: over.balls.reduce((sum, b) => sum + b.runsOffBat + b.extras, 0),
    wicketsInOver: over.balls.filter((b) => b.wicketType !== null).length,
    balls: over.balls.map((b) => {
      const { label, runs } = ballLabel(b);
      return {
        label,
        legal: b.legalDelivery,
        runs,
        wicket: b.wicketType !== null,
      };
    }),
    bowlerName: name(over.bowlerId),
    bowlerFigures: `${legalBallsToOvers(figure.legalBalls, perOver)}-${figure.maidens}-${figure.runs}-${figure.wickets}`,
    striker: batterLine(ball.strikerAfter),
    nonStriker: batterLine(ball.nonStrikerAfter),
    chase:
      needed === null || innings.completed
        ? null
        : `Need ${needed} from ${plural(remaining, 'ball', 'balls')}`,
  };
}
