/**
 * Safe progress maths shared by every bar. Never returns NaN, Infinity or a value outside 0..100,
 * whatever it is given (a zero target, a negative value, XP past the target).
 */
export function progressPercent(current: number, target: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0)
    return 0;
  const pct = (Math.max(0, current) / target) * 100;
  return Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
}
export function clampProgress(current: number, target: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0)
    return 0;
  return Math.min(Math.max(0, current), target);
}
