import type { RandomSource } from '../../utils/runtime';

export const clamp = (n: number, min = 0, max = 1): number =>
  Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
export const clamp01 = (n: number): number => clamp(n, 0, 1);
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * clamp01(t);
export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
/** 0..1 from a 1..100 rating. */
export const rate = (n: number): number => clamp01(n / 100);

/** Standard normal CDF (Abramowitz-Stegun 7.1.26); good to ~1e-7, which is far more than a decision needs. */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** A normal draw from two uniforms (Box-Muller). Always consumes exactly two draws so streams stay aligned. */
export function gaussian(rng: RandomSource): number {
  const u1 = Math.max(1e-12, rng.next());
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Probabilities proportional to exp(utility / temperature); stable against large values. */
export function softmax(
  utilities: readonly number[],
  temperature: number,
): number[] {
  if (utilities.length === 0) return [];
  const t = Math.max(1e-6, temperature);
  const max = Math.max(...utilities);
  const exps = utilities.map((u) => Math.exp((u - max) / t));
  const total = exps.reduce((s, e) => s + e, 0);
  return exps.map((e) => e / total);
}

/** Index drawn from `probabilities` with ONE uniform draw. */
export function pickIndex(
  rng: RandomSource,
  probabilities: readonly number[],
): number {
  let roll = rng.next();
  for (let i = 0; i < probabilities.length; i++) {
    roll -= probabilities[i]!;
    if (roll < 0) return i;
  }
  return probabilities.length - 1;
}

/** Sum of a record's values, for weights that should be normalised. */
export const sum = (values: readonly number[]): number =>
  values.reduce((s, v) => s + v, 0);

export const mean = (values: readonly number[]): number =>
  values.length ? sum(values) / values.length : 0;
