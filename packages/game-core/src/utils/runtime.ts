export interface RandomSource {
  next(): number;
}
/** Non-deterministic adapter; authoritative simulation must supply a versioned seeded implementation. */
export class DefaultRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}
/** Contract reserved for the match engine; no simulation algorithm is chosen in Module 1. */
export interface SeededRandomSource extends RandomSource {
  readonly seed: string;
  readonly algorithmVersion: string;
}
export interface Clock {
  now(): Date;
}
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
