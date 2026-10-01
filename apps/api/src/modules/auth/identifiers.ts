import { createHash } from 'node:crypto';

/**
 * Email comparison form: trim + lowercase, nothing else.
 *
 * Deliberately NOT done: stripping dots or "+tags" (Gmail rules would merge distinct addresses
 * at other providers), Unicode compatibility folding, or IDN conversion (the validator only
 * admits ASCII addresses). Lower-casing the local part is a pragmatic choice: RFC 5321 permits
 * case-sensitive local parts but virtually no mail provider uses them, and treating `A@x.com`
 * and `a@x.com` as one account is what users expect. The address as typed is kept separately
 * for display.
 */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

/**
 * Short, non-reversible label for correlating events about the same identifier (email, IP) in
 * logs and rate-limit keys without storing the raw value.
 */
export const hashIdentifier = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Windows/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iOS/, 'iOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];
/** "Chrome on macOS": enough for a devices list, too coarse to fingerprint. */
export function summarizeUserAgent(
  userAgent: string | undefined,
): string | null {
  if (!userAgent) return null;
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (!browser && !system) return null;
  return [browser ?? 'Browser', system ? `on ${system}` : '']
    .filter(Boolean)
    .join(' ');
}
