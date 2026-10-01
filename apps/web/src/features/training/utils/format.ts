import type { DrillDto } from '@the-cricketer/shared-types';

export const DIFFICULTY_LABEL: Record<DrillDto['difficulty'], string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  elite: 'Elite',
};

/** A new random idempotency key. One per attempt: retries of the SAME attempt reuse it. */
export function newTrainingKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Player-facing text for why a drill cannot be started. */
export function unavailableText(d: DrillDto): string | null {
  if (d.available) return null;
  switch (d.reason) {
    case 'locked_level':
      return `Requires level ${d.detail?.requiredLevel ?? d.minimumLevel ?? '?'}`;
    case 'locked_role':
      return 'Not available for your role';
    case 'locked_style':
      return "Doesn't suit your bowling style";
    case 'cooldown':
      return `Available after ${d.detail?.matchesRemaining ?? 1} more ${d.detail?.matchesRemaining === 1 ? 'match' : 'matches'}`;
    case 'maxed_skill':
      return 'Already at maximum';
    case 'blocked_fatigue':
      return 'Too tired: rest first';
    case 'already_fresh':
      return 'You are fully rested';
    case 'insufficient_coins':
      return `Requires ${d.detail?.requiredCoins ?? d.cost.amount} coins. You have ${d.detail?.haveCoins ?? 0}`;
    default:
      return 'Not available yet';
  }
}

/** XP progress text that works for screen readers and never shows NaN. */
export const xpText = (xp: number, next: number | null): string =>
  next === null
    ? 'MAX'
    : `${xp.toLocaleString('en-US')} / ${next.toLocaleString('en-US')} XP`;

export const percentOf = (value: number, max: number | null): number =>
  max === null || !Number.isFinite(value) || !Number.isFinite(max) || max <= 0
    ? 100
    : Math.min(100, Math.max(0, Math.round((value / max) * 100)));
