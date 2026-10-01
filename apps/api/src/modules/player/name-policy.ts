import type { PlayerEnvironment } from '@the-cricketer/config';

/** Fold case and diacritics so "ADMIN", "Admín" and "a d m i n" compare alike. */
const fold = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
const squash = (value: string): string =>
  fold(value).replace(/[^\p{L}\p{N}]+/gu, '');
const words = (value: string): string[] =>
  fold(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * Moderation foundation for display names (not a profanity service). Two rules:
 *  - reserved names (staff/system impersonation) match the whole name after folding;
 *  - blocked terms match whole words only, so "Dickson" or "Scunthorpe" are untouched.
 * Behind this one method a real moderation provider can be added later.
 */
export class NamePolicy {
  private readonly reserved: ReadonlySet<string>;
  private readonly blocked: ReadonlySet<string>;

  constructor(
    config: Pick<PlayerEnvironment, 'blockedNameTerms' | 'reservedNames'>,
  ) {
    this.reserved = new Set(config.reservedNames.map(squash));
    this.blocked = new Set(config.blockedNameTerms.map((t) => squash(t)));
  }

  /** `true` when the (already normalised and validated) name may be used. */
  isAllowed(name: string): boolean {
    if (this.reserved.has(squash(name))) return false;
    return !words(name).some((w) => this.blocked.has(w));
  }
}
