import type { DeliveryLength, DeliveryLine } from './types/index';
import { ENGINE_BALANCE as B } from './config/engine.config';

/**
 * Cricket-relative pitch geometry shared by the match engine and every presentation layer, so a
 * pixel never decides a line or a length. A target is two numbers in 0..1:
 *   x: line, 0 = wide outside the OFF stump, 1 = wide down the LEG side (relative to the batter's hand)
 *   y: length, 0 = yorker (at the batter's feet), 1 = bouncer (furthest from the batter)
 */
export const PITCH_LINES: readonly DeliveryLine[] = [
  'wide_off',
  'outside_off',
  'off_stump',
  'middle',
  'leg',
  'wide_leg',
];
export const PITCH_LENGTHS: readonly DeliveryLength[] = [
  'yorker',
  'full',
  'good',
  'short',
  'bouncer',
];
export const classifyLine = (x: number): DeliveryLine =>
  PITCH_LINES[B.lineEdges.filter((edge) => x >= edge).length]!;
export const classifyLength = (y: number): DeliveryLength =>
  PITCH_LENGTHS[B.lengthEdges.filter((edge) => y >= edge).length]!;

export const LINE_LABELS: Readonly<Record<DeliveryLine, string>> = {
  wide_off: 'Wide outside off',
  outside_off: 'Outside off',
  off_stump: 'Off stump',
  middle: 'Middle',
  leg: 'Leg stump',
  wide_leg: 'Wide down leg',
};
export const LENGTH_LABELS: Readonly<Record<DeliveryLength, string>> = {
  yorker: 'Yorker',
  full: 'Full',
  good: 'Good length',
  short: 'Short',
  bouncer: 'Bouncer',
};

/** Centre of a named band, used by the accessible line/length presets. */
export const lineCenter = (line: DeliveryLine): number => B.lineCenters[line];
export const lengthCenter = (length: DeliveryLength): number =>
  B.lengthCenters[length];

export const clampUnit = (n: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;

/** Internal speed is m/s; players see km/h. One conversion, used everywhere. */
export const metersPerSecondToKmh = (ms: number): number => ms * 3.6;
export const kmhToMetersPerSecond = (kmh: number): number => kmh / 3.6;
