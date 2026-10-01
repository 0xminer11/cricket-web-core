/**
 * Presentation-only formatting. Exact values stay exact everywhere else; these only decide how a
 * number or date reads on screen. All helpers accept any input without throwing or printing NaN.
 */

/** 1,248 -> "1,248"; large values compact: 18,400 -> "18.4K", 1,200,000 -> "1.2M". */
export function formatCount(value: number, compactFrom = 10_000): string {
  if (!Number.isFinite(value)) return '0';
  const v = Math.max(0, Math.trunc(value));
  const compact = (n: number, unit: string) => {
    const s = (Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return `${s}${unit}`;
  };
  if (v >= 1_000_000_000) return compact(v / 1_000_000_000, 'B');
  if (v >= 1_000_000) return compact(v / 1_000_000, 'M');
  if (v >= compactFrom) return compact(v / 1_000, 'K');
  return v.toLocaleString('en-US');
}

/** Ratios that may be undefined (no dismissals, no balls) show a dash, never NaN. */
export function formatRatio(
  value: number | null | undefined,
  digits = 1,
): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : value.toFixed(digits);
}

export const roleName = (id: string): string =>
  id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export function formatDateTime(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
export function formatDate(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Relative wording alongside (never instead of) the exact date. Calendar days are compared in the
 * viewer's local time zone so "Tomorrow" means the viewer's tomorrow.
 */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '';
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(target) - startOf(now)) / 86_400_000);
  if (days < 0) return 'Available now';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export const percent = (value: number, max: number): number =>
  !Number.isFinite(value) || !Number.isFinite(max) || max <= 0
    ? 0
    : Math.min(100, Math.max(0, Math.round((value / max) * 100)));

export const resultLabel = (
  r: 'won' | 'lost' | 'tied' | 'no_result' | null,
): string =>
  r === 'won'
    ? 'Won'
    : r === 'lost'
      ? 'Lost'
      : r === 'tied'
        ? 'Tied'
        : r
          ? 'No result'
          : '';
