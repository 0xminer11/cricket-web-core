import type { QualityLevel } from '@the-cricketer/game-core';

/**
 * Pick a renderer quality profile from coarse, privacy-neutral hints (no fingerprinting): CPU
 * threads, device memory where exposed, touch-first devices, and the user's data-saver setting.
 * `?quality=low|medium|high` overrides it in development builds for testing.
 */
export function detectQuality(): QualityLevel {
  if (typeof window === 'undefined') return 'medium';
  if (process.env.NODE_ENV !== 'production') {
    const forced = new URLSearchParams(window.location.search).get('quality');
    if (forced === 'low' || forced === 'medium' || forced === 'high')
      return forced;
  }
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  if (nav.connection?.saveData) return 'low';
  const memory = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (memory <= 2 || cores <= 2) return 'low';
  if (coarse || memory <= 4 || cores <= 4) return 'medium';
  return 'high';
}
