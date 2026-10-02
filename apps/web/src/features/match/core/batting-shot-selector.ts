import { BATTING_INPUT, SHOTS } from '@the-cricketer/game-core';
import type { DeliveryLength, DeliveryLine } from '@the-cricketer/game-core';

/**
 * The simplified batting controls. A player chooses WHAT they want to do (defend, drive, play it on
 * the leg side, cut/back-foot, loft) and, for the shots that have one, a cricket-relative direction;
 * the selector turns that into one of the Module 0 shots using the delivery they can see. UI code never
 * names a shot, so adding a shot (a sweep, a ramp) is a table change here, not a UI change.
 */
export const BATTING_ACTIONS = [
  'defend',
  'drive',
  'leg_side',
  'back_foot',
  'loft',
] as const;
export type BattingAction = (typeof BATTING_ACTIONS)[number];

export const ACTION_LABELS: Readonly<Record<BattingAction, string>> = {
  defend: 'Defend',
  drive: 'Drive',
  leg_side: 'Leg side',
  back_foot: 'Cut / back foot',
  loft: 'Loft',
};
export const ACTION_DESCRIPTIONS: Readonly<Record<BattingAction, string>> = {
  defend: 'Defensive shot',
  drive: 'Drive along the ground',
  leg_side: 'Shot to the leg side',
  back_foot: 'Cut or back-foot shot',
  loft: 'Lofted shot over the infield',
};

/** Direction: -1 strong leg side, 0 straight, +1 strong off side, for either hand. */
export const DIRECTION_STEPS = [-1, -0.5, 0, 0.5, 1] as const;
export const DIRECTION_LABELS: Readonly<Record<string, string>> = {
  '-1': 'Strong leg side',
  '-0.5': 'Leg side',
  '0': 'Straight',
  '0.5': 'Off side',
  '1': 'Strong off side',
};
export const clampDirection = (d: number): number =>
  Number.isFinite(d) ? Math.max(-1, Math.min(1, d)) : 0;

export interface SelectorInput {
  readonly action: BattingAction;
  readonly direction: number;
  readonly line: DeliveryLine;
  readonly length: DeliveryLength;
}

export interface ShotChoice {
  readonly shotId: string;
  readonly action: BattingAction;
  /** One short phrase for the debug overlay and the screen-reader announcement. */
  readonly reason: string;
}

const SHORT: readonly DeliveryLength[] = ['short', 'bouncer'];
const OFF_LINES: readonly DeliveryLine[] = ['wide_off', 'outside_off'];

/**
 * Pick the shot. The choice follows the player's intent first (drive stays a drive, loft stays a loft)
 * and only uses the delivery to choose between the shots that intent allows. It never "fixes" a bad
 * decision: a drive to a bouncer is still a drive, and the engine will judge it as one.
 */
export function selectShot(input: SelectorInput): ShotChoice {
  const { action, line, length } = input;
  const d = clampDirection(input.direction);
  const t = BATTING_INPUT.directionBands;
  const side = d < t.legBelow ? 'leg' : d > t.offAbove ? 'off' : 'straight';
  const pick = (shotId: string, reason: string): ShotChoice => ({
    shotId,
    action,
    reason,
  });
  switch (action) {
    case 'defend':
      return SHORT.includes(length)
        ? pick(
            'shot.back_foot_defensive',
            'short ball: defend off the back foot',
          )
        : pick(
            'shot.forward_defensive',
            'full or good ball: defend on the front foot',
          );
    case 'drive':
      return side === 'off'
        ? pick('shot.cover_drive', 'drive through the off side')
        : side === 'leg'
          ? pick('shot.on_drive', 'drive through the leg side')
          : pick('shot.straight_drive', 'drive straight');
    case 'leg_side':
      return length === 'bouncer'
        ? pick('shot.hook', 'bouncer to the leg side: hook')
        : length === 'short'
          ? pick('shot.pull', 'short ball to the leg side: pull')
          : pick('shot.flick', 'full or good ball to the leg side: flick');
    case 'back_foot':
      return OFF_LINES.includes(line) &&
        length !== 'yorker' &&
        length !== 'full'
        ? pick('shot.cut', 'wide of off: cut')
        : pick(
            'shot.back_foot_defensive',
            'on the stumps: play it off the back foot',
          );
    case 'loft':
      return side === 'off'
        ? pick('shot.lofted_off_side', 'lofted over the off side')
        : side === 'leg'
          ? pick('shot.lofted_leg_side', 'lofted over the leg side')
          : pick('shot.lofted_straight', 'lofted straight');
  }
}

/** Every Module 0 shot with a friendly name, for the advanced (manual) shot picker. */
export const MANUAL_SHOTS: readonly { shotId: string; label: string }[] =
  SHOTS.map((shot) => ({ shotId: shot.id, label: shot.displayName }));

export type ShotHint = 'good' | 'okay' | 'risky';
export const HINT_TEXT: Readonly<Record<ShotHint, string>> = {
  good: 'Good shot option',
  okay: 'Playable',
  risky: 'Risky',
};

/**
 * A subtle hint for assisted play. It is the same line/length suitability the engine uses, shown as
 * three words: never the engine's number, and never a replacement for the player's own decision.
 */
export function shotHint(
  shotId: string,
  line: DeliveryLine,
  length: DeliveryLength,
): ShotHint {
  const shot = SHOTS.find((s) => s.id === shotId);
  if (!shot) return 'risky';
  const score =
    (Number(shot.idealLines.includes(line)) +
      Number(shot.idealLengths.includes(length))) /
    2;
  return score >= 1 ? 'good' : score > 0 ? 'okay' : 'risky';
}

/** The action a sensible player would reach for against this ball (used by the assist suggestion). */
export function suggestedAction(
  line: DeliveryLine,
  length: DeliveryLength,
): BattingAction {
  if (length === 'yorker') return 'defend';
  if (SHORT.includes(length)) return 'leg_side';
  if (length === 'full') return 'drive';
  return OFF_LINES.includes(line) ? 'drive' : 'defend';
}
