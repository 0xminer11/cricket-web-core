import { lengthCenter } from '@the-cricketer/game-core';
import type { DeliveryLength } from '@the-cricketer/game-core';
import { BowlingStateMachine } from './bowling-state-machine';
import {
  executionScore,
  executionWindow,
  meterCursor,
  METER,
} from './timing-meter';
import type { Difficulty, MeterSkills } from './timing-meter';
import { PitchTargetController } from './pitch-target-controller';
import type { NormalizedTarget } from './coordinates';

export interface DeliveryOption {
  readonly id: string;
  readonly difficulty: Difficulty;
  readonly defaultLength: DeliveryLength;
}

/** What the browser is allowed to send: variation, aimed target, timing. Never a result. */
export interface DeliveryIntentInput {
  readonly variationId: string;
  readonly target: NormalizedTarget;
  readonly executionInput?: number;
}

export interface InputSnapshot {
  readonly bowlerId: string | null;
  readonly deliveryId: string | null;
  readonly target: NormalizedTarget;
  readonly assist: boolean;
  readonly canBowl: boolean;
  readonly inputOpen: boolean;
}

type Listener = () => void;

/**
 * Collects the player's choices for one delivery: bowler, variation, aim and execution timing.
 * Reusable by the future bowling nets. It owns no network, scene or scoring logic; `commit` returns
 * the intent and freezes input through the shared state machine, which is what makes a double tap
 * unable to start two deliveries.
 */
export class BowlingInputController {
  readonly targetController = new PitchTargetController();
  private bowlerId: string | null = null;
  private deliveryId: string | null = null;
  private assistOn = false;
  private skills: MeterSkills = { accuracy: 50, control: 50, consistency: 50 };
  private options: readonly DeliveryOption[] = [];
  private meterStartedAt = 0;
  private readonly listeners = new Set<Listener>();
  constructor(
    readonly machine: BowlingStateMachine = new BowlingStateMachine(),
  ) {
    this.targetController.subscribe(() => this.changed());
    machine.subscribe(() => this.changed());
  }

  configure(input: {
    bowlerId: string | null;
    deliveries: readonly DeliveryOption[];
    skills: MeterSkills;
  }): void {
    const bowlerChanged = this.bowlerId !== input.bowlerId;
    this.bowlerId = input.bowlerId;
    this.options = input.deliveries;
    this.skills = input.skills;
    if (!this.options.some((o) => o.id === this.deliveryId))
      this.deliveryId = this.options[0]?.id ?? null;
    if (bowlerChanged && this.deliveryId)
      this.applyDefaultLength(this.deliveryId);
    this.changed();
  }

  setAssist(on: boolean): void {
    this.assistOn = on;
    this.changed();
  }
  get assist(): boolean {
    return this.assistOn;
  }

  /** Picking a variation moves the aim to that variation's natural length (a yorker aims at the toes). */
  selectDelivery(id: string): boolean {
    if (!this.machine.inputOpen) return false;
    if (!this.options.some((o) => o.id === id)) return false;
    this.deliveryId = id;
    this.applyDefaultLength(id);
    this.changed();
    return true;
  }
  private applyDefaultLength(id: string): void {
    const option = this.options.find((o) => o.id === id);
    if (!option) return;
    const t = this.targetController.target;
    this.targetController.set({
      x: t.x,
      y: lengthCenter(option.defaultLength),
    });
  }

  get selectedDelivery(): DeliveryOption | null {
    return this.options.find((o) => o.id === this.deliveryId) ?? null;
  }
  get difficulty(): Difficulty {
    return this.selectedDelivery?.difficulty ?? 'medium';
  }
  get meterPeriod(): number {
    return METER.period[this.difficulty];
  }
  get halfWindow(): number {
    return executionWindow(this.skills, this.difficulty, this.assistOn);
  }
  /** Where the meter's origin is in time; the UI reads the cursor from this. */
  startMeter(now: number): void {
    this.meterStartedAt = now;
  }
  cursor(now: number): number {
    return meterCursor(now - this.meterStartedAt, this.meterPeriod);
  }

  get canBowl(): boolean {
    return (
      this.machine.inputOpen &&
      this.bowlerId !== null &&
      this.deliveryId !== null &&
      Number.isFinite(this.targetController.target.x) &&
      Number.isFinite(this.targetController.target.y)
    );
  }

  /**
   * Freeze the delivery. Returns null (and does nothing) when it is not allowed, so rapid repeated
   * taps resolve to exactly one intent: after the first, the machine is in RUN_UP and input is closed.
   */
  commit(now: number): DeliveryIntentInput | null {
    if (!this.canBowl) return null;
    if (this.machine.state === 'TARGETING') this.machine.transition('READY');
    if (!this.machine.tryTransition('RUN_UP')) return null;
    const score = executionScore(this.cursor(now), this.halfWindow);
    return {
      variationId: this.deliveryId!,
      target: this.targetController.target,
      // assisted play sends no input at all: the engine treats it as neutral (never an advantage)
      ...(this.assistOn
        ? {}
        : { executionInput: Math.round(score * 1000) / 1000 }),
    };
  }

  snapshot(): InputSnapshot {
    return {
      bowlerId: this.bowlerId,
      deliveryId: this.deliveryId,
      target: this.targetController.target,
      assist: this.assistOn,
      canBowl: this.canBowl,
      inputOpen: this.machine.inputOpen,
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
