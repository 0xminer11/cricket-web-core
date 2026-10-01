import type { SeededRandomSource } from '@the-cricketer/game-core';
export const RNG_ALGORITHM_VERSION = 'fnv1a-mulberry32-v1';
/** Explicit 32-bit integer operations are stable across JS runtimes. */
export class MatchRandom implements SeededRandomSource {
  readonly algorithmVersion = RNG_ALGORITHM_VERSION;
  private state: number;
  constructor(readonly seed: string) {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++)
      hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
    this.state = hash >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}
