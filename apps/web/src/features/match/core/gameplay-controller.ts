import type { DeliveryLength, DeliveryLine } from '@the-cricketer/game-core';
import type { BattingAssist } from '@the-cricketer/game-core';
import { getControlMode } from '@the-cricketer/game-core';
import type { ControlMode } from '@the-cricketer/game-core';
import type {
  OverSummaryDto,
  SimulateResultDto,
} from '@the-cricketer/shared-types';
import type {
  BattingFeedbackDto,
  BowlerOptionDto,
  DeliveryPreviewDto,
  DeliveryRequest,
  DeliveryResultDto,
  MatchPlayStateDto,
  ShotRequest,
} from '@the-cricketer/shared-types';
import type { MatchApi } from '../api/match-client';
import { BattingInputController } from './batting-input-controller';
import type { BattingInputSnapshot } from './batting-input-controller';
import type { BattingAction } from './batting-shot-selector';
import type { BattingState } from './batting-state-machine';
import { BattingTimingPredictor, timingCategory } from './batting-timing';
import type { BallTimeline } from './batting-timing';
import { BowlingInputController } from './bowling-input-controller';
import type { DeliveryOption, InputSnapshot } from './bowling-input-controller';
import { BowlingStateMachine } from './bowling-state-machine';
import type { BowlingState } from './bowling-state-machine';
import { classifyTarget } from './coordinates';
import type { NormalizedTarget } from './coordinates';
import type { ScenePort, SceneEvent } from './scene-port';
import { overSummary, resultBanner } from './visual-events';
import type { ResultBanner } from './visual-events';

export interface ControllerDeps {
  readonly api: MatchApi;
  readonly matchId: string;
  /** Monotonic milliseconds. */
  readonly now: () => number;
  readonly newActionId: () => string;
  readonly onCompleted?: (matchId: string) => void;
}

export interface ControllerError {
  readonly code: string;
  readonly message: string;
  /** True when the same action can safely be re-sent (it carries the same actionId). */
  readonly retryable: boolean;
}

export interface DeliverySummary {
  readonly speedKmh: number;
  readonly variation: string;
  readonly zone: string;
  readonly execution: string;
  readonly contact: string;
}

export interface ControllerSnapshot {
  readonly version: number;
  readonly status: 'loading' | 'ready' | 'error';
  readonly error: ControllerError | null;
  /** What the server says is true. May be ahead of what is on screen while a ball plays out. */
  readonly authoritative: MatchPlayStateDto | null;
  /** What the HUD shows; it catches up to `authoritative` when the animation reaches the result. */
  readonly display: MatchPlayStateDto | null;
  readonly bowlingState: BowlingState;
  readonly input: InputSnapshot;
  readonly bowler: BowlerOptionDto | CurrentBowlerView | null;
  readonly deliveries: readonly DeliveryOption[];
  readonly banner: ResultBanner | null;
  readonly over: { title: string; line: string } | null;
  readonly last: DeliverySummary | null;
  readonly waitingForServer: boolean;
  readonly busy: boolean;
  readonly notice: string | null;
  readonly paused: boolean;
  /** Which end of the pitch the player is at right now. */
  readonly mode: 'bowling' | 'batting';
  /** Who is in control of the next ball (Module 11). */
  readonly controlMode: ControlMode;
  /** The end-of-over card for the over just completed; null once dismissed. */
  readonly overSummary: OverSummaryDto | null;
  /** Balls the AI is playing while you watch, revealed at your chosen speed. */
  readonly simulation: SimulationView | null;
  readonly batting: BattingSnapshot;
}

/** Everything the batting controls and HUD need. Nothing here is a result until the server has answered. */
export interface BattingSnapshot {
  readonly state: BattingState;
  readonly input: BattingInputSnapshot;
  /** What the batter can read about the ball in flight. Null until the bowler has released. */
  readonly ball: { readonly speedKmh: number } | null;
  readonly bowlerName: string | null;
  /** The engine's own labels for the shot just played; revealed when the result is shown. */
  readonly feedback: BattingFeedbackDto | null;
  /** The shot the engine played, shown with the feedback once the result is on screen. */
  readonly shotName: string | null;
  /** A face-the-next-ball request is being made or a ball is being played. */
  readonly facing: boolean;
  readonly canFace: boolean;
  /** Fast presentation after contact (a choice made on screen; nothing is stored). */
  readonly fast: boolean;
  /** Where the timing cue should sit (0 = way early .. 1 = way late is not meaningful: the cue is a time). */
  readonly timeline: BallTimeline | null;
}
type CurrentBowlerView = NonNullable<MatchPlayStateDto['currentBowler']>;

interface Pending {
  readonly request: DeliveryRequest;
  status: 'sending' | 'resolved' | 'failed';
  result: DeliveryResultDto | null;
  attempts: number;
}

/** What the player sees while the AI plays: the balls the server played, revealed progressively. */
export interface SimulationView {
  readonly balls: SimulateResultDto['simulated'];
  readonly shown: number;
  readonly speed: 'normal' | 'fast' | 'instant';
  readonly done: boolean;
}

interface PendingShot {
  readonly request: ShotRequest;
  readonly preview: DeliveryPreviewDto;
  readonly shotId: string;
  readonly errorSeconds: number;
  status: 'sending' | 'resolved' | 'failed';
  result: DeliveryResultDto | null;
  attempts: number;
  /** After a retry the whole ball is played again, so the swing is replayed automatically. */
  replay: boolean;
}

const RETRYABLE = new Set(['NETWORK_ERROR', 'INVALID_RESPONSE']);
const RESYNC = new Set([
  'STALE_SEQUENCE',
  'ACTION_ID_REUSED',
  'BOWLER_NOT_ELIGIBLE',
  'INVALID_DELIVERY',
  'NOT_YOUR_TURN_TO_BOWL',
  'MATCH_FINISHED',
  'NOT_YOUR_TURN_TO_BAT',
]);

/**
 * Orchestrates one match in the browser: it loads the authoritative state, collects the player's
 * intent, sends it, sequences the presentation and keeps three kinds of state apart:
 *   authoritative (what the server decided), presentation (what the HUD currently shows) and input
 *   (what the player is choosing). It contains no cricket rules: it cannot compute a run.
 */
export class MatchGameplayController {
  readonly machine = new BowlingStateMachine();
  readonly input = new BowlingInputController(this.machine);
  readonly battingInput = new BattingInputController();
  private mode: 'bowling' | 'batting' = 'bowling';
  private preview: DeliveryPreviewDto | null = null;
  private timeline: BallTimeline | null = null;
  private ballSpeed: number | null = null;
  private pendingShot: PendingShot | null = null;
  private feedback: BattingFeedbackDto | null = null;
  private shotShown: string | null = null;
  private facing = false;
  private fast = false;
  private overSummary: OverSummaryDto | null = null;
  private sim: {
    result: SimulateResultDto;
    shown: number;
    speed: 'normal' | 'fast' | 'instant';
  } | null = null;
  private simSpeed: 'normal' | 'fast' | 'instant' = 'instant';
  private lastControl: ControlMode | null = null;
  private turnTracked = false;
  private scene: ScenePort | null = null;
  private authoritative: MatchPlayStateDto | null = null;
  private display: MatchPlayStateDto | null = null;
  private status: ControllerSnapshot['status'] = 'loading';
  private error: ControllerError | null = null;
  private pending: Pending | null = null;
  private banner: ResultBanner | null = null;
  private over: { title: string; line: string } | null = null;
  private last: DeliverySummary | null = null;
  private notice: string | null = null;
  private busy = false;
  private paused = false;
  private chosenBowlerId: string | null = null;
  private waiting = false;
  private disposed = false;
  private generation = 0;
  private version = 0;
  private cached: ControllerSnapshot | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: ControllerDeps) {
    this.machine.subscribe(() => this.touch());
    this.input.subscribe(() => this.touch());
    this.battingInput.subscribe(() => this.touch());
    this.battingInput.setAssist('normal');
  }

  attachScene(scene: ScenePort | null): void {
    this.scene = scene;
    if (scene) this.prepareScene();
  }

  // ---- state access -------------------------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private touch(): void {
    this.version++;
    this.cached = null;
    for (const listener of [...this.listeners]) listener();
  }
  getSnapshot = (): ControllerSnapshot => {
    if (this.cached) return this.cached;
    this.cached = {
      version: this.version,
      status: this.status,
      error: this.error,
      authoritative: this.authoritative,
      display: this.display,
      bowlingState: this.machine.state,
      input: this.input.snapshot(),
      bowler: this.activeBowler(),
      deliveries: this.deliveryOptions(),
      banner: this.banner,
      over: this.over,
      last: this.last,
      waitingForServer: this.waiting,
      busy: this.busy,
      notice: this.notice,
      paused: this.paused,
      mode: this.mode,
      controlMode: getControlMode({
        phase:
          (this.display ?? this.authoritative)?.phase ?? 'simulate_required',
      }),
      overSummary: this.overSummary,
      simulation: this.simulationView(),
      batting: this.battingSnapshot(),
    };
    return this.cached;
  };

  /** Meter cursor 0..1 for the UI, from the controller's clock. */
  meterCursor(): number {
    return this.input.cursor(this.deps.now() / 1000);
  }

  // ---- loading and resync --------------------------------------------------------------------

  async load(): Promise<void> {
    this.status = 'loading';
    this.touch();
    try {
      const state = await this.deps.api.getState(this.deps.matchId);
      if (this.disposed) return;
      this.status = 'ready';
      this.error = null;
      this.applyAuthoritative(state);
    } catch (error) {
      if (this.disposed) return;
      this.status = 'error';
      this.error = toError(error, true);
      this.touch();
    }
  }

  /** Throw away any local divergence and rebuild from the server (brief section 220). */
  async resyncMatchState(notice: string | null = null): Promise<void> {
    this.generation++;
    this.pending = null;
    this.resetBatting();
    this.waiting = false;
    this.scene?.cancelRunUp();
    this.scene?.reset();
    try {
      const state = await this.deps.api.getState(this.deps.matchId);
      if (this.disposed) return;
      this.status = 'ready';
      this.error = null;
      this.notice = notice;
      this.banner = null;
      this.applyAuthoritative(state);
    } catch (error) {
      if (this.disposed) return;
      this.error = toError(error, true);
      this.machine.reset('PREPARING');
      this.touch();
    }
  }

  private applyAuthoritative(state: MatchPlayStateDto): void {
    this.authoritative = state;
    this.display = state;
    this.trackControl(state);
    this.machine.reset('PREPARING');
    this.configureFromState(state);
    if (state.phase === 'completed') this.deps.onCompleted?.(state.matchId);
    this.prepareScene();
    this.touch();
  }

  private configureFromState(state: MatchPlayStateDto): void {
    this.mode = state.phase === 'ready_to_bat' ? 'batting' : 'bowling';
    if (state.phase === 'ready_to_bat') {
      this.resetBatting();
      this.chosenBowlerId = null;
      return;
    }
    if (state.phase === 'ready_to_bowl' && state.currentBowler) {
      this.chosenBowlerId = state.currentBowler.playerId;
      this.input.configure({
        bowlerId: state.currentBowler.playerId,
        deliveries: this.optionsFor(state, state.currentBowler.deliveryIds),
        skills: state.currentBowler.skills,
      });
      this.machine.transition('TARGETING');
      this.input.startMeter(this.deps.now() / 1000);
    } else if (state.phase === 'bowler_select') {
      const keep = state.eligibleBowlers.find(
        (b) => b.playerId === this.chosenBowlerId && b.eligible,
      );
      if (!keep) this.chosenBowlerId = null;
      this.input.configure({
        bowlerId: null,
        deliveries: [],
        skills: { accuracy: 50, control: 50, consistency: 50 },
      });
    } else {
      this.chosenBowlerId = null;
    }
  }

  private optionsFor(
    state: MatchPlayStateDto,
    ids: readonly string[],
  ): DeliveryOption[] {
    return ids.flatMap((id) => {
      const card = state.deliveryCatalog[id];
      return card
        ? [
            {
              id,
              difficulty: card.difficulty,
              defaultLength: card.defaultLength,
            },
          ]
        : [];
    });
  }

  private activeBowler(): ControllerSnapshot['bowler'] {
    const state = this.authoritative;
    if (!state) return null;
    if (state.currentBowler) return state.currentBowler;
    return (
      state.eligibleBowlers.find((b) => b.playerId === this.chosenBowlerId) ??
      null
    );
  }
  private deliveryOptions(): readonly DeliveryOption[] {
    const state = this.authoritative;
    const bowler = this.activeBowler();
    return state && bowler ? this.optionsFor(state, bowler.deliveryIds) : [];
  }

  private prepareScene(): void {
    const state = this.authoritative;
    if (!this.scene || !state) return;
    const bowler = this.activeBowler() ?? state.eligibleBowlers[0] ?? null;
    const striker = state.striker;
    this.scene.prepare({
      mode: this.mode,
      pitchKind: state.pitch.kind,
      battingHand: striker?.hand ?? 'right',
      bowlerStyle: bowler?.style ?? 'right_arm_fast',
      bowlerName: bowler?.name ?? '',
      batterName: striker?.name ?? '',
      bowlingTeamName: state.bowlingTeam.name,
      battingTeamName: state.battingTeam.name,
    });
    this.scene.setFast(this.fast);
    this.scene.setTarget(
      this.input.targetController.target,
      this.mode === 'bowling' && this.machine.inputOpen,
    );
  }

  // ---- player intent -------------------------------------------------------------------------

  selectBowler(playerId: string): boolean {
    const state = this.authoritative;
    if (!state || state.phase !== 'bowler_select') return false;
    const option = state.eligibleBowlers.find((b) => b.playerId === playerId);
    if (!option || !option.eligible) return false;
    this.chosenBowlerId = playerId;
    this.input.configure({
      bowlerId: playerId,
      deliveries: this.optionsFor(state, option.deliveryIds),
      skills: option.skills,
    });
    if (this.machine.state === 'PREPARING')
      this.machine.transition('TARGETING');
    this.input.startMeter(this.deps.now() / 1000);
    this.prepareScene();
    this.touch();
    return true;
  }

  selectDelivery(id: string): void {
    if (this.input.selectDelivery(id)) {
      this.deps.api.track('bowling_delivery_selected', id.slice(0, 80));
      this.scene?.setTarget(this.input.targetController.target, true);
    }
  }

  setTarget(target: NormalizedTarget, snap = false): void {
    if (!this.machine.inputOpen) return;
    this.input.targetController.set(target, snap || this.input.assist);
    this.scene?.setTarget(this.input.targetController.target, true);
  }
  /** Accessible presets: move the aim to a named line or length without changing the other axis. */
  setLine(line: DeliveryLine): void {
    if (!this.machine.inputOpen) return;
    this.input.targetController.setLine(line);
    this.scene?.setTarget(this.input.targetController.target, true);
  }
  setLength(length: DeliveryLength): void {
    if (!this.machine.inputOpen) return;
    this.input.targetController.setLength(length);
    this.scene?.setTarget(this.input.targetController.target, true);
  }
  nudgeTarget(dx: number, dy: number, coarse = false): void {
    if (!this.machine.inputOpen) return;
    this.input.targetController.nudge(dx, dy, coarse);
    this.scene?.setTarget(this.input.targetController.target, true);
  }
  setAssist(on: boolean): void {
    this.input.setAssist(on);
  }

  // ---- bowling -------------------------------------------------------------------------------

  /** The BOWL button. Safe to call repeatedly: only the first call while input is open does anything. */
  bowl(): boolean {
    const state = this.authoritative;
    if (!state || this.pending || this.disposed) return false;
    if (state.phase !== 'ready_to_bowl' && state.phase !== 'bowler_select')
      return false;
    const intent = this.input.commit(this.deps.now() / 1000);
    if (!intent) return false;
    const request: DeliveryRequest = {
      actionId: this.deps.newActionId(),
      expectedSequence: state.expectedSequence,
      ...(state.phase === 'bowler_select' && this.chosenBowlerId
        ? { bowlerId: this.chosenBowlerId }
        : {}),
      deliveryIntent: {
        variationId: intent.variationId,
        target: intent.target,
        ...(intent.executionInput !== undefined
          ? { executionInput: intent.executionInput }
          : {}),
      },
    };
    this.banner = null;
    this.over = null;
    this.overSummary = null;
    this.notice = null;
    this.error = null;
    const zone = classifyTarget(intent.target);
    this.deps.api.track(
      'bowling_target_selected',
      `${zone.line}/${zone.length}`,
    );
    this.deps.api.track(
      'bowling_execution_completed',
      intent.executionInput === undefined
        ? 'assist'
        : String(Math.round(intent.executionInput * 10) / 10),
    );
    this.pending = { request, status: 'sending', result: null, attempts: 0 };
    this.scene?.setTarget(intent.target, false);
    this.scene?.startRunUp();
    this.send(this.pending);
    this.touch();
    return true;
  }

  private send(pending: Pending): void {
    const token = ++this.generation;
    pending.status = 'sending';
    pending.attempts++;
    this.deps.api
      .deliver(this.deps.matchId, pending.request)
      .then((result) => {
        if (
          this.disposed ||
          token !== this.generation ||
          this.pending !== pending
        )
          return;
        pending.status = 'resolved';
        pending.result = result;
        // the authoritative state moves now; the HUD waits for the animation to reach the result
        this.authoritative = result.match;
        this.touch();
      })
      .catch((error: unknown) => {
        if (
          this.disposed ||
          token !== this.generation ||
          this.pending !== pending
        )
          return;
        this.onDeliveryFailed(pending, error);
      });
  }

  private onDeliveryFailed(pending: Pending, error: unknown): void {
    pending.status = 'failed';
    this.waiting = false;
    const failure = toError(error, true);
    // nothing was resolved, so nothing may be shown: abort the run-up and give control back
    this.scene?.cancelRunUp();
    this.machine.tryTransition('TARGETING');
    this.deps.api.track('match_visual_error', failure.code.slice(0, 80));
    if (RESYNC.has(failure.code)) {
      this.pending = null;
      this.error = { ...failure, retryable: false };
      this.touch();
      void this.resyncMatchState(
        failure.code === 'STALE_SEQUENCE' || failure.code === 'ACTION_ID_REUSED'
          ? 'The match had moved on, so it was reloaded. Bowl again.'
          : `${failure.message} The match was reloaded.`,
      );
      return;
    }
    if (!RETRYABLE.has(failure.code)) this.pending = null;
    this.error = {
      ...failure,
      retryable: RETRYABLE.has(failure.code),
    };
    this.touch();
  }

  /** Re-send the SAME action (same actionId) after a network failure; the server never bowls it twice. */
  retry(): boolean {
    const pending = this.pending;
    if (!pending || pending.status !== 'failed') return false;
    if (this.machine.state === 'TARGETING') this.machine.transition('READY');
    if (!this.machine.tryTransition('RUN_UP')) return false;
    this.error = null;
    this.scene?.startRunUp();
    this.send(pending);
    this.touch();
    return true;
  }

  // ---- batting -------------------------------------------------------------------------------

  private battingSnapshot(): BattingSnapshot {
    const state = this.authoritative;
    const input = this.battingInput.snapshot();
    return {
      state: this.battingInput.machine.state,
      input,
      ball: this.ballSpeed === null ? null : { speedKmh: this.ballSpeed },
      bowlerName: this.preview?.bowler.name ?? null,
      feedback: this.feedback,
      shotName: this.shotShown,
      facing: this.facing,
      fast: this.fast,
      canFace:
        this.mode === 'batting' &&
        state?.phase === 'ready_to_bat' &&
        !this.facing &&
        !this.pendingShot &&
        !this.busy &&
        this.battingInput.machine.state === 'WAITING',
      timeline: this.timeline,
    };
  }

  private resetBatting(): void {
    this.pendingShot = null;
    this.preview = null;
    this.timeline = null;
    this.ballSpeed = null;
    this.facing = false;
    this.feedback = null;
    this.shotShown = null;
    this.battingInput.machine.reset('WAITING');
  }

  /**
   * The cue for the timing helper: how far the ball is from the moment to press, read straight from the
   * scene's clock (0 = way early .. 1 = press now, then falling). Null when there is nothing to time.
   */
  battingCue(): { cue: number; secondsToIdeal: number; shotId: string } | null {
    const predictor = this.battingInput.timing;
    const shot = this.battingInput.currentShot();
    const now = this.scene?.presentationTime() ?? null;
    if (
      !predictor ||
      !shot ||
      now === null ||
      !this.battingInput.machine.shotInputOpen
    )
      return null;
    return {
      cue: predictor.cue(now, shot.shotId),
      secondsToIdeal: predictor.idealTapTime(shot.shotId) - now,
      shotId: shot.shotId,
    };
  }

  setBattingAction(action: BattingAction): void {
    if (this.battingInput.setAction(action))
      this.deps.api.track('shot_selected', action);
  }
  setBattingDirection(direction: number): void {
    this.battingInput.setDirection(direction);
  }
  setBattingShot(shotId: string | null): void {
    if (this.battingInput.setManualShot(shotId) && shotId)
      this.deps.api.track('shot_selected', shotId.slice(0, 60));
  }
  setFastPresentation(on: boolean): void {
    this.fast = on;
    this.scene?.setFast(on);
    this.touch();
  }
  /** The server's result for the ball being played (for sound: it follows the engine's result, nothing else). */
  resultInPlay(): DeliveryResultDto | null {
    return this.pendingShot?.result ?? null;
  }
  setBattingAssist(level: BattingAssist): void {
    this.battingInput.setAssist(level);
  }

  /** FACE NEXT BALL: the AI bowler runs in. Safe to call repeatedly; only the first call per ball does anything. */
  async faceNextBall(): Promise<boolean> {
    const state = this.authoritative;
    if (
      !state ||
      state.phase !== 'ready_to_bat' ||
      this.facing ||
      this.pendingShot ||
      this.disposed ||
      this.paused ||
      this.battingInput.machine.state !== 'WAITING'
    )
      return false;
    this.facing = true;
    this.feedback = null;
    this.shotShown = null;
    this.overSummary = null;
    this.banner = null;
    this.over = null;
    this.notice = null;
    this.error = null;
    this.timeline = null;
    this.ballSpeed = null;
    const token = this.generation;
    this.touch();
    try {
      const preview = await this.deps.api.nextBall(this.deps.matchId);
      if (this.disposed || token !== this.generation) return false;
      this.preview = preview;
      this.battingInput.machine.tryTransition('BOWLER_APPROACH');
      this.battingInput.beginDelivery(
        preview.delivery.line,
        preview.delivery.length,
      );
      if (!this.turnTracked) {
        this.turnTracked = true;
        this.deps.api.track('batting_turn_started');
      }
      this.scene?.startDelivery(preview);
      this.touch();
      return true;
    } catch (error) {
      if (this.disposed || token !== this.generation) return false;
      this.facing = false;
      this.onBattingFailed(null, error);
      return false;
    }
  }

  /**
   * The player's swing (a tap on the pitch, the SWING button or the keyboard). The bat starts moving NOW,
   * before the server has answered; the answer then decides what the swing achieved.
   */
  swing(at?: number): boolean {
    const state = this.authoritative;
    const preview = this.preview;
    const scene = this.scene;
    if (
      !state ||
      !preview ||
      !scene ||
      this.disposed ||
      this.paused ||
      this.pendingShot ||
      state.phase !== 'ready_to_bat'
    )
      return false;
    const now = at ?? scene.presentationTime();
    if (now === null) return false;
    const committed = this.battingInput.commit(now);
    if (!committed) return false;
    // assist Auto times the swing for the player: the batter holds the stance until the right moment
    scene.startSwing(
      committed.intent.shotId,
      committed.intent.assist === 'auto'
        ? this.battingInput.timing?.idealTapTime(committed.intent.shotId)
        : undefined,
    );
    const request: ShotRequest = {
      actionId: this.deps.newActionId(),
      expectedSequence: state.expectedSequence,
      battingIntent: {
        shotId: committed.intent.shotId,
        direction: committed.intent.direction,
        timingInput: committed.intent.timingInput,
        assist: committed.intent.assist,
      },
    };
    this.deps.api.track('shot_committed', committed.intent.shotId.slice(0, 60));
    this.deps.api.track(
      'batting_timing_recorded',
      committed.intent.assist === 'auto'
        ? 'auto'
        : timingCategory(committed.intent.timingInput),
    );
    this.pendingShot = {
      request,
      preview,
      shotId: committed.intent.shotId,
      errorSeconds: committed.errorSeconds,
      status: 'sending',
      result: null,
      attempts: 0,
      replay: false,
    };
    this.sendShot(this.pendingShot);
    this.touch();
    return true;
  }

  private sendShot(pending: PendingShot): void {
    const token = ++this.generation;
    pending.status = 'sending';
    pending.attempts++;
    this.deps.api
      .shoot(this.deps.matchId, pending.request)
      .then((result) => {
        if (
          this.disposed ||
          token !== this.generation ||
          this.pendingShot !== pending
        )
          return;
        pending.status = 'resolved';
        pending.result = result;
        this.waiting = false;
        // the authoritative state moves now; the HUD waits for the animation to reach the result
        this.authoritative = result.match;
        this.battingInput.machine.tryTransition('RESULT_RESOLVED');
        if (pending.replay)
          this.scene?.startDelivery(pending.preview, {
            shotId: pending.shotId,
            errorSeconds: pending.errorSeconds,
            result,
          });
        else this.scene?.applyShotResult(result);
        this.touch();
      })
      .catch((error: unknown) => {
        if (
          this.disposed ||
          token !== this.generation ||
          this.pendingShot !== pending
        )
          return;
        this.onBattingFailed(pending, error);
      });
  }

  private onBattingFailed(pending: PendingShot | null, error: unknown): void {
    const failure = toError(error, true);
    this.waiting = false;
    if (pending) pending.status = 'failed';
    // nothing was resolved, so nothing may be shown: stop the swing and give control back
    this.scene?.reset();
    this.battingInput.machine.reset('WAITING');
    this.deps.api.track('match_visual_error', failure.code.slice(0, 80));
    if (RESYNC.has(failure.code)) {
      this.pendingShot = null;
      this.error = { ...failure, retryable: false };
      this.touch();
      void this.resyncMatchState(
        failure.code === 'STALE_SEQUENCE' || failure.code === 'ACTION_ID_REUSED'
          ? 'The match had moved on, so it was reloaded.'
          : `${failure.message} The match was reloaded.`,
      );
      return;
    }
    if (!RETRYABLE.has(failure.code)) {
      this.pendingShot = null;
      this.preview = null;
      this.facing = false;
    }
    this.error = {
      ...failure,
      retryable: RETRYABLE.has(failure.code) && !!pending,
    };
    this.touch();
  }

  /** Re-send the SAME shot (same actionId); the server never plays it twice, and the ball is shown again. */
  retryShot(): boolean {
    const pending = this.pendingShot;
    if (!pending || pending.status !== 'failed') return false;
    this.error = null;
    pending.replay = true;
    this.waiting = true;
    this.battingInput.machine.tryTransition('BOWLER_APPROACH');
    this.sendShot(pending);
    this.touch();
    return true;
  }

  private handleBattingEvent(event: SceneEvent): boolean | void {
    const input = this.battingInput;
    switch (event.type) {
      case 'BALL_RELEASE':
        input.machine.tryTransition('BALL_RELEASED');
        return true;
      case 'BALL_TIMELINE': {
        this.timeline = {
          pitchTime: event.pitchTime,
          contactTime: event.contactTime,
          speedKmh: event.speedKmh,
        };
        this.ballSpeed = event.speedKmh;
        input.setTimeline(new BattingTimingPredictor(this.timeline));
        input.machine.tryTransition('READING_DELIVERY');
        // a replayed ball plays its own swing; the player has nothing to do
        if (this.pendingShot?.replay) {
          input.machine.tryTransition('SWING_STARTED');
          this.touch();
          return;
        }
        // a tap just before release is honoured, not lost
        const buffered = input.takeBuffered(0);
        if (buffered !== null) this.swing(0);
        this.touch();
        return;
      }
      case 'SWING_INPUT':
        this.swing(event.at);
        return;
      case 'CONTACT_WINDOW':
        input.machine.tryTransition('CONTACT_WINDOW');
        return;
      case 'LATE_CUTOFF':
        // the ball has gone by without a swing: the shot is played, hopelessly late
        if (!this.pendingShot && this.timeline)
          this.swing(this.timeline.contactTime + 1);
        return;
      case 'RESULT': {
        const result = this.pendingShot?.result;
        if (!result) return;
        input.machine.tryTransition('RESULT_RESOLVED');
        input.machine.tryTransition('BALL_OUTCOME');
        this.banner = resultBanner(result.outcome);
        this.feedback = result.batting;
        this.shotShown = result.shot.name;
        this.touch();
        return;
      }
      case 'SCORE_UPDATE': {
        const result = this.pendingShot?.result;
        if (!result) return;
        this.display = result.match;
        this.over = overSummary(result);
        this.last = {
          speedKmh: result.delivery.speedKmh,
          variation: result.delivery.name,
          zone: `${result.delivery.actual.lineLabel}, ${result.delivery.actual.lengthLabel.toLowerCase()}`,
          execution: result.delivery.executionRating,
          contact: result.shot.contactQuality,
        };
        this.touch();
        return;
      }
      case 'SEQUENCE_COMPLETE':
        this.finishBattingSequence();
        return;
      default:
        return;
    }
  }

  private finishBattingSequence(): void {
    const result = this.pendingShot?.result;
    if (!result) return;
    this.pendingShot = null;
    this.preview = null;
    this.timeline = null;
    this.facing = false;
    this.waiting = false;
    this.display = result.match;
    this.authoritative = result.match;
    this.overSummary =
      result.match.phase === 'completed' ? null : result.overSummary;
    this.trackControl(result.match);
    const machine = this.battingInput.machine;
    machine.tryTransition('BALL_OUTCOME');
    machine.tryTransition('RESETTING');
    machine.reset('WAITING');
    this.scene?.reset();
    const next = result.match;
    this.mode = next.phase === 'ready_to_bat' ? 'batting' : 'bowling';
    if (next.phase === 'completed') {
      this.touch();
      this.deps.onCompleted?.(next.matchId);
      return;
    }
    if (next.phase === 'ready_to_bowl' || next.phase === 'bowler_select')
      this.configureFromState(next);
    this.prepareScene();
    this.touch();
  }

  // ---- scene events --------------------------------------------------------------------------

  /** The scene reports presentation milestones here. Returning false from BALL_RELEASE holds the ball. */
  handleSceneEvent(event: SceneEvent): boolean | void {
    if (this.mode === 'batting') return this.handleBattingEvent(event);
    switch (event.type) {
      case 'BALL_RELEASE': {
        const pending = this.pending;
        if (!pending || pending.status === 'failed') return true;
        if (pending.status === 'sending' || !pending.result) {
          if (!this.waiting) {
            this.waiting = true;
            this.touch();
          }
          return false;
        }
        this.waiting = false;
        this.machine.tryTransition('RELEASED');
        this.machine.tryTransition('BALL_IN_FLIGHT');
        this.scene?.beginFlight(pending.result);
        this.touch();
        return true;
      }
      case 'BALL_PITCH':
        this.machine.tryTransition('PITCHED');
        return;
      case 'BALL_NEAR_BATTER':
        this.machine.tryTransition('PITCHED');
        this.machine.tryTransition('BATTER_ACTION');
        return;
      case 'RESULT': {
        const result = this.pending?.result;
        if (!result) return;
        this.machine.tryTransition('PITCHED');
        this.machine.tryTransition('BATTER_ACTION');
        this.machine.tryTransition('RESULT');
        this.banner = resultBanner(result.outcome);
        this.touch();
        return;
      }
      case 'SCORE_UPDATE': {
        const result = this.pending?.result;
        if (!result) return;
        this.display = result.match;
        this.over = overSummary(result);
        this.last = {
          speedKmh: result.delivery.speedKmh,
          variation: result.delivery.name,
          zone: `${result.delivery.actual.lineLabel}, ${result.delivery.actual.lengthLabel.toLowerCase()}`,
          execution: result.delivery.executionRating,
          contact: result.shot.contactQuality,
        };
        this.touch();
        return;
      }
      case 'SEQUENCE_COMPLETE':
        this.finishSequence();
        return;
      case 'TARGET_CHANGED':
        this.setTarget(event.target);
        return;
      default:
        return;
    }
  }

  private finishSequence(): void {
    const result = this.pending?.result;
    if (!result) return;
    this.pending = null;
    this.waiting = false;
    this.display = result.match;
    this.authoritative = result.match;
    this.overSummary =
      result.match.phase === 'completed' ? null : result.overSummary;
    this.trackControl(result.match);
    if (this.machine.state !== 'RESULT') {
      this.machine.tryTransition('PITCHED');
      this.machine.tryTransition('BATTER_ACTION');
      this.machine.tryTransition('RESULT');
    }
    this.machine.tryTransition('RESETTING');
    this.scene?.reset();
    const next = result.match;
    if (next.phase === 'completed') {
      this.machine.tryTransition('PREPARING');
      this.touch();
      this.deps.onCompleted?.(next.matchId);
      return;
    }
    if (next.phase === 'ready_to_bowl' && next.currentBowler) {
      this.input.configure({
        bowlerId: next.currentBowler.playerId,
        deliveries: this.optionsFor(next, next.currentBowler.deliveryIds),
        skills: next.currentBowler.skills,
      });
      this.machine.tryTransition('TARGETING');
      this.input.startMeter(this.deps.now() / 1000);
    } else {
      this.chosenBowlerId = null;
      this.machine.tryTransition('PREPARING');
    }
    this.prepareScene();
    this.touch();
  }

  /** Skip the rest of the presentation. The result is already known and applied exactly once. */
  skip(): void {
    if (this.mode === 'batting') {
      if (this.pendingShot?.result) this.scene?.skip();
      return;
    }
    if (
      ['BALL_IN_FLIGHT', 'PITCHED', 'BATTER_ACTION', 'RESULT'].includes(
        this.machine.state,
      )
    )
      this.scene?.skip();
  }

  // ---- steps the human does not control -------------------------------------------------------

  async advance(): Promise<void> {
    await this.runBusy(async () => {
      const state = await this.deps.api.advance(this.deps.matchId);
      if (!this.disposed) this.applyAuthoritative(state);
    });
  }

  setSimulationSpeed(speed: 'normal' | 'fast' | 'instant'): void {
    this.simSpeed = speed;
  }

  dismissOverSummary(): void {
    if (!this.overSummary) return;
    this.overSummary = null;
    this.touch();
  }

  /**
   * Ask the server to play balls the player does not control. The server decides how many (it stops where the
   * player's Cricketer is next needed); the browser only chooses how fast to WATCH them. The balls are revealed
   * one by one at the chosen speed and the screen shows the new state when the last one is revealed (instantly at
   * the Instant speed). Nothing here invents a score: every line is a ball the server played.
   */
  async simulate(
    mode: 'until_my_turn' | 'over' | 'innings',
    bowlerId?: string,
    speed: 'normal' | 'fast' | 'instant' = this.simSpeed,
  ): Promise<void> {
    if (this.busy || this.disposed) return;
    this.overSummary = null;
    this.busy = true;
    this.error = null;
    this.sim = null;
    this.touch();
    if (mode === 'until_my_turn')
      this.deps.api.track('simulate_until_turn_used', speed);
    try {
      const result = await this.deps.api.simulate(this.deps.matchId, {
        mode,
        ...(bowlerId ? { bowlerId } : {}),
      });
      if (this.disposed) return;
      if (speed === 'instant' || result.simulated.length === 0) {
        this.settleSimulation(result);
        this.busy = false;
        this.touch();
        return;
      }
      // the server state is already final; the screen catches up as the balls are shown
      this.sim = { result, shown: 0, speed };
      this.authoritative = result.match;
      this.touch();
    } catch (error) {
      if (!this.disposed) {
        this.error = toError(error, false);
        this.busy = false;
        this.touch();
      }
    }
  }

  private simulationView(): SimulationView | null {
    if (!this.sim) return null;
    return {
      balls: this.sim.result.simulated,
      shown: this.sim.shown,
      speed: this.sim.speed,
      done: this.sim.shown >= this.sim.result.simulated.length,
    };
  }

  /** Reveal `count` more balls of the simulation just played. */
  revealSimulation(count = 1): void {
    const sim = this.sim;
    if (!sim) return;
    sim.shown = Math.min(sim.result.simulated.length, sim.shown + count);
    if (sim.shown >= sim.result.simulated.length) {
      const result = sim.result;
      this.sim = { ...sim, shown: sim.shown };
      this.settleSimulation(result, false);
      this.busy = false;
    }
    this.touch();
  }

  /** The player does not want to wait: show everything now. */
  skipSimulation(): void {
    if (this.sim) this.revealSimulation(this.sim.result.simulated.length);
  }

  /** Leave the feed (after the last ball has been shown) and carry on with the match. */
  closeSimulation(): void {
    if (this.sim && this.sim.shown >= this.sim.result.simulated.length) {
      this.sim = null;
      this.touch();
    }
  }

  private settleSimulation(result: SimulateResultDto, clear = true): void {
    this.notice = simulationSummary(
      this.display ?? this.authoritative,
      result.match,
      result.simulated.length,
    );
    this.applyAuthoritative(result.match);
    if (clear) this.sim = null;
  }

  /** Track that the Cricketer's turn to bat or bowl has begun (once per turn, never on a refresh of the same turn). */
  private trackControl(state: MatchPlayStateDto): void {
    const mode = getControlMode({ phase: state.phase });
    if (mode === this.lastControl) return;
    this.lastControl = mode;
    if (mode === 'HUMAN_BATTING')
      this.deps.api.track('career_player_batting_started');
    else if (mode === 'HUMAN_BOWLING')
      this.deps.api.track('career_player_bowling_started');
  }

  private async runBusy(work: () => Promise<void>): Promise<void> {
    if (this.busy || this.disposed) return;
    this.busy = true;
    this.error = null;
    this.touch();
    try {
      await work();
    } catch (error) {
      if (!this.disposed) this.error = toError(error, false);
    } finally {
      this.busy = false;
      if (!this.disposed) this.touch();
    }
  }

  // ---- pause / lifecycle ---------------------------------------------------------------------

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.scene?.setPaused(paused);
    this.touch();
  }

  /** Closes the error banner; giving up on a failed delivery also drops its pending action. */
  dismissError(): void {
    this.error = null;
    if (this.pending?.status === 'failed') this.pending = null;
    if (this.pendingShot?.status === 'failed') {
      this.pendingShot = null;
      this.facing = false;
      this.preview = null;
    }
    this.touch();
  }

  /**
   * (Re)start after construction or after `destroy()`. React StrictMode mounts, unmounts and
   * remounts a component in development, so the controller must survive a destroy/activate cycle.
   */
  activate(): void {
    this.disposed = false;
  }

  destroy(): void {
    this.disposed = true;
    this.generation++;
    this.pending = null;
    this.pendingShot = null;
    this.scene = null;
  }
}

/**
 * One line about what the automatic play did: how many balls, the score change and wickets (within the same
 * innings), and whether the player is now on strike. It reads two server states; it computes no cricket.
 */
function simulationSummary(
  before: MatchPlayStateDto | null,
  after: MatchPlayStateDto,
  balls: number,
): string | null {
  if (!balls) return null;
  const parts = [`Played ${balls} ball${balls === 1 ? '' : 's'} automatically`];
  if (before && before.innings.number === after.innings.number) {
    const runs = after.innings.runs - before.innings.runs;
    const wickets = after.innings.wickets - before.innings.wickets;
    parts.push(
      `${runs} run${runs === 1 ? '' : 's'}${
        wickets > 0 ? `, ${wickets} wicket${wickets === 1 ? '' : 's'}` : ''
      }`,
    );
  }
  const text = parts.join(': ');
  return after.phase === 'ready_to_bat'
    ? `${text}. You are on strike.`
    : `${text}.`;
}

function toError(error: unknown, retryable: boolean): ControllerError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'UNKNOWN_ERROR';
  const message =
    error instanceof Error && error.message
      ? error.message
      : 'Something went wrong.';
  return {
    code,
    message:
      code === 'NETWORK_ERROR'
        ? 'The connection dropped before the ball was bowled. Nothing was counted. Try again.'
        : message,
    retryable: retryable && RETRYABLE.has(code),
  };
}
