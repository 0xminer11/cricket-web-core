import {
  LENGTH_LABELS,
  LINE_LABELS,
  lengthCenter,
  lineCenter,
} from '@the-cricketer/game-core';
import type { DeliveryLength, DeliveryLine } from '@the-cricketer/game-core';
import { classifyTarget, sanitizeTarget, screenToTarget } from './coordinates';
import type {
  BattingHand,
  NormalizedTarget,
  ViewParams,
  Viewport,
} from './coordinates';

export const DEFAULT_TARGET: NormalizedTarget = { x: 0.3, y: 0.48 };
export const NUDGE = { fine: 0.02, coarse: 0.08 } as const;
/** Assist snaps the aim to the middle of its zone when it is this close (normalized units). */
export const SNAP_RADIUS = 0.06;

export interface TargetReadoutText {
  readonly line: DeliveryLine;
  readonly length: DeliveryLength;
  readonly lineLabel: string;
  readonly lengthLabel: string;
  readonly text: string;
}

type Listener = (target: NormalizedTarget) => void;

/**
 * Owns the aimed pitch target in the engine's normalized coordinates. Independent of scoring, the
 * camera and the match scene, so bowling nets can reuse it. Every setter clamps, so the marker can
 * never leave the pitch and a NaN can never reach the engine.
 */
export class PitchTargetController {
  private value: NormalizedTarget;
  private readonly listeners = new Set<Listener>();
  constructor(initial: NormalizedTarget = DEFAULT_TARGET) {
    this.value = sanitizeTarget(initial);
  }
  get target(): NormalizedTarget {
    return this.value;
  }
  set(target: NormalizedTarget, snap = false): void {
    const clean = sanitizeTarget(target);
    this.value = snap ? this.snapped(clean) : clean;
    for (const listener of [...this.listeners]) listener(this.value);
  }
  /** Returns false when the pointer does not land on the ground (the marker stays where it was). */
  setFromScreen(
    sx: number,
    sy: number,
    view: ViewParams,
    viewport: Viewport,
    hand: BattingHand,
    snap = false,
  ): boolean {
    const hit = screenToTarget(sx, sy, view, viewport, hand);
    if (!hit) return false;
    this.set(hit, snap);
    return true;
  }
  setLine(line: DeliveryLine): void {
    this.set({ x: lineCenter(line), y: this.value.y });
  }
  setLength(length: DeliveryLength): void {
    this.set({ x: this.value.x, y: lengthCenter(length) });
  }
  /** Keyboard / button movement; positive dx moves toward the leg side, positive dy toward short. */
  nudge(dx: number, dy: number, coarse = false): void {
    const step = coarse ? NUDGE.coarse : NUDGE.fine;
    this.set({ x: this.value.x + dx * step, y: this.value.y + dy * step });
  }
  private snapped(t: NormalizedTarget): NormalizedTarget {
    const { line, length } = classifyTarget(t);
    const near = {
      x: lineCenter(line),
      y: lengthCenter(length),
    };
    return Math.hypot(t.x - near.x, t.y - near.y) <= SNAP_RADIUS ? near : t;
  }
  readout(): TargetReadoutText {
    const { line, length } = classifyTarget(this.value);
    return {
      line,
      length,
      lineLabel: LINE_LABELS[line],
      lengthLabel: LENGTH_LABELS[length],
      text: `${LINE_LABELS[line]}, ${LENGTH_LABELS[length].toLowerCase()}`,
    };
  }
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
