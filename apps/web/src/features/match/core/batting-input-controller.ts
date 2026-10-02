import { BATTING_INPUT } from '@the-cricketer/game-core';
import type { BattingAssist } from '@the-cricketer/game-core';
import type { DeliveryLength, DeliveryLine } from '@the-cricketer/game-core';
import { BattingStateMachine } from './batting-state-machine';
import {
  clampDirection,
  selectShot,
  shotHint,
  suggestedAction,
} from './batting-shot-selector';
import type {
  BattingAction,
  ShotChoice,
  ShotHint,
} from './batting-shot-selector';
import type { BattingTimingPredictor } from './batting-timing';

/** What the browser sends: a shot, a direction and a timing error. Never a result. */
export interface ShotIntentInput {
  readonly shotId: string;
  readonly direction: number;
  readonly timingInput: number;
  readonly assist: BattingAssist;
}

export interface BattingInputSnapshot {
  readonly action: BattingAction;
  readonly direction: number;
  readonly manualShotId: string | null;
  readonly assist: BattingAssist;
  /** The shot that would be played right now (null before the delivery is known). */
  readonly shot: ShotChoice | null;
  readonly hint: ShotHint | null;
  readonly suggested: BattingAction | null;
  readonly armed: boolean;
  readonly canSwing: boolean;
}

export interface CommittedSwing {
  readonly intent: ShotIntentInput;
  /** Contact-time error in seconds (for the scene and the debug overlay). */
  readonly errorSeconds: number;
  /** When the swing started, on the presentation clock. */
  readonly tapTime: number;
}

type Listener = () => void;

/**
 * Collects the player's batting choices for one delivery: what to do, which way, and WHEN. It owns no
 * network, scene or scoring code. Timing is recorded relative to the ball (through the predictor), not
 * as a wall-clock time, so the same input means the same thing at any frame rate. `commit` is the only
 * way a swing starts: it locks the shot, and a second tap while one is under way does nothing.
 */
export class BattingInputController {
  readonly machine = new BattingStateMachine();
  private action: BattingAction = 'drive';
  private direction = 0;
  private manualShotId: string | null = null;
  private assistLevel: BattingAssist = 'off';
  private predictor: BattingTimingPredictor | null = null;
  private line: DeliveryLine | null = null;
  private length: DeliveryLength | null = null;
  private buffered: number | null = null;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.machine.subscribe(() => this.changed());
  }

  // ---- choices (changeable until the swing is committed) -------------------------------------------

  setAction(action: BattingAction): boolean {
    if (this.machine.committed) return false;
    this.action = action;
    this.manualShotId = null;
    this.armIfReading();
    this.changed();
    return true;
  }
  setDirection(direction: number): boolean {
    if (this.machine.committed) return false;
    this.direction = clampDirection(direction);
    this.armIfReading();
    this.changed();
    return true;
  }
  /** Advanced mode: name the exact shot. The simplified controls resume as soon as one is chosen. */
  setManualShot(shotId: string | null): boolean {
    if (this.machine.committed) return false;
    this.manualShotId = shotId;
    this.armIfReading();
    this.changed();
    return true;
  }
  setAssist(level: BattingAssist): void {
    this.assistLevel = level;
    this.changed();
  }
  get assist(): BattingAssist {
    return this.assistLevel;
  }
  private armIfReading(): void {
    if (this.machine.state === 'READING_DELIVERY')
      this.machine.tryTransition('SHOT_ARMED');
  }

  // ---- the delivery being faced --------------------------------------------------------------------

  /** A new ball: the choice persists (so the player is not asked again), but the swing is a fresh decision. */
  beginDelivery(line: DeliveryLine, length: DeliveryLength): void {
    this.line = line;
    this.length = length;
    this.predictor = null;
    this.buffered = null;
    this.changed();
  }
  /** The bowler has released: timing starts to mean something. */
  setTimeline(predictor: BattingTimingPredictor): void {
    this.predictor = predictor;
    this.changed();
  }
  get timing(): BattingTimingPredictor | null {
    return this.predictor;
  }

  /** The shot that is selected for the ball being faced. */
  currentShot(): ShotChoice | null {
    if (!this.line || !this.length) return null;
    if (this.manualShotId)
      return {
        shotId: this.manualShotId,
        action: this.action,
        reason: 'chosen by hand',
      };
    return selectShot({
      action: this.action,
      direction: this.direction,
      line: this.line,
      length: this.length,
    });
  }

  // ---- commit --------------------------------------------------------------------------------------

  /**
   * Start the swing at `now` (presentation seconds since release). Returns null (and does nothing) when a
   * swing is not allowed: before the ball is released, after one is already committed, or without a
   * timeline. A tap a hair before release is remembered for `inputBufferSeconds` instead of being lost.
   */
  commit(now: number): CommittedSwing | null {
    if (!this.machine.shotInputOpen) {
      if (
        this.machine.state === 'BALL_RELEASED' ||
        this.machine.state === 'BOWLER_APPROACH'
      )
        this.buffered = now;
      return null;
    }
    const shot = this.currentShot();
    if (!shot || !this.predictor) return null;
    if (!this.machine.tryTransition('SWING_STARTED')) return null;
    const timing =
      this.assistLevel === 'auto'
        ? 0
        : this.predictor.normalized(now, shot.shotId);
    return {
      intent: {
        shotId: shot.shotId,
        direction: this.direction,
        timingInput: timing,
        assist: this.assistLevel,
      },
      errorSeconds: this.predictor.errorSeconds(now, shot.shotId),
      tapTime: now,
    };
  }

  /** A tap made just before the shot system opened, still fresh enough to honour (or null). */
  takeBuffered(now: number): number | null {
    const at = this.buffered;
    this.buffered = null;
    return at !== null && now - at <= BATTING_INPUT.inputBufferSeconds
      ? at
      : null;
  }

  snapshot(): BattingInputSnapshot {
    const shot = this.currentShot();
    return {
      action: this.action,
      direction: this.direction,
      manualShotId: this.manualShotId,
      assist: this.assistLevel,
      shot,
      hint:
        shot &&
        this.line &&
        this.length &&
        BATTING_INPUT.assist[this.assistLevel].shotHint
          ? shotHint(shot.shotId, this.line, this.length)
          : null,
      suggested:
        this.line &&
        this.length &&
        BATTING_INPUT.assist[this.assistLevel].shotHint
          ? suggestedAction(this.line, this.length)
          : null,
      armed: this.machine.state === 'SHOT_ARMED',
      canSwing: this.machine.shotInputOpen && shot !== null,
    };
  }
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
