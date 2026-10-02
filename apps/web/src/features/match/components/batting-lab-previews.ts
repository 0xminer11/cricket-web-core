import { BATTING_INPUT } from '@the-cricketer/game-core';
import type {
  BattingLabResultDto,
  DeliveryOutcomeDto,
  DeliveryPreviewDto,
  DeliveryResultDto,
  ResolvedShotDto,
} from '@the-cricketer/shared-types';

/**
 * DEVELOPMENT ONLY. Rare results (a bowled, a catch, a clean six) almost never come out of a normal ball,
 * yet the scene must be checked against all of them. These swap a SYNTHETIC shot and outcome in on the
 * client so the presentation can be inspected frame by frame. They are never sent to the server and never
 * touch a match.
 */
export const BATTING_PREVIEWS = [
  'engine result',
  'perfect',
  'good',
  'okay',
  'poor',
  'edge',
  'miss',
  'bowled',
  'lbw',
  'caught',
  'six',
  'four',
  'wide',
] as const;
export type BattingPreview = (typeof BATTING_PREVIEWS)[number];

type LabBall = Pick<BattingLabResultDto, 'delivery' | 'shot' | 'outcome'>;

export function applyBattingPreview(
  lab: LabBall,
  preview: BattingPreview,
): LabBall {
  if (preview === 'engine result') return lab;
  const shot: ResolvedShotDto = { ...lab.shot };
  const outcome: DeliveryOutcomeDto = {
    ...lab.outcome,
    runsOffBat: 0,
    extras: 0,
    extraType: null,
    wicketType: null,
    legal: true,
    totalRuns: 0,
    distanceClass: 'infield',
    headline: 'DOT BALL',
    detail: `${preview} (synthetic preview)`,
  };
  let delivery = lab.delivery;
  switch (preview) {
    case 'perfect':
    case 'good':
    case 'okay':
    case 'poor':
    case 'edge':
    case 'miss':
      shot.contactQuality = preview;
      break;
    case 'bowled':
    case 'lbw':
      shot.contactQuality = 'miss';
      outcome.wicketType = preview;
      outcome.headline = 'WICKET';
      break;
    case 'caught':
      shot.contactQuality = 'good';
      shot.category = 'lofted';
      outcome.wicketType = 'caught';
      outcome.headline = 'WICKET';
      break;
    case 'six':
      shot.contactQuality = 'perfect';
      shot.category = 'lofted';
      outcome.runsOffBat = 6;
      outcome.totalRuns = 6;
      outcome.headline = 'SIX';
      outcome.distanceClass = 'six';
      break;
    case 'four':
      shot.contactQuality = 'perfect';
      outcome.runsOffBat = 4;
      outcome.totalRuns = 4;
      outcome.headline = 'FOUR';
      outcome.distanceClass = 'boundary';
      break;
    case 'wide':
      outcome.extras = 1;
      outcome.totalRuns = 1;
      outcome.extraType = 'wide';
      outcome.legal = false;
      outcome.headline = 'WIDE';
      delivery = {
        ...delivery,
        actual: {
          ...delivery.actual,
          line: 'wide_off',
          lineLabel: 'Wide outside off',
        },
      };
      break;
  }
  return { delivery, shot, outcome };
}

/** What a batter could read about the lab's ball: the preview the scene needs to play it. */
export function previewFromLab(
  lab: LabBall,
  bowlerStyle: string,
): DeliveryPreviewDto {
  const d = lab.delivery;
  const arm = d.bowlingArm;
  return {
    sequence: 1,
    inningsNumber: 1,
    overNumber: 1,
    ballInOver: 1,
    bowler: {
      playerId: 'lab-bowler',
      name: 'Lab bowler',
      style: bowlerStyle,
      styleName: bowlerStyle.replace(/_/g, ' '),
      arm,
      kind:
        bowlerStyle.includes('spin') || bowlerStyle.includes('orthodox')
          ? 'spin'
          : bowlerStyle.includes('medium')
            ? 'medium'
            : 'fast',
    },
    delivery: {
      variationId: d.variationId,
      name: d.name,
      target: d.actual.target,
      line: d.actual.line,
      length: d.actual.length,
      lineLabel: d.actual.lineLabel,
      lengthLabel: d.actual.lengthLabel,
      speedMs: d.speedMs,
      speedKmh: d.speedKmh,
      movement: d.movement,
      bounce: d.bounce,
      bowlingArm: arm,
      battingHand: d.battingHand,
    },
    // the presentation never reads the match state; the lab has none
    match: null as unknown as DeliveryPreviewDto['match'],
  };
}

/** The lab's result in the shape the scene plays (the scene reads only the delivery, shot and outcome). */
export function resultFromLab(lab: LabBall): DeliveryResultDto {
  return {
    sequence: 1,
    inningsNumber: 1,
    overNumber: 1,
    ballInOver: 1,
    replayed: false,
    delivery: lab.delivery,
    shot: lab.shot,
    outcome: lab.outcome,
    batting: null,
    overSummary: null,
    events: [],
    match: null as unknown as DeliveryResultDto['match'],
  };
}

/** The tap that gives this timing input, as seconds from the ideal moment. */
export const errorSecondsFor = (timingInput: number): number =>
  timingInput * BATTING_INPUT.windowSeconds;
