import * as Phaser from 'phaser';
import { FLIGHT, SEQUENCE } from '../../config/visual-config';
import { PALETTE } from '../../config/palette';
import {
  BowlingAnimator,
  armFor,
  bowlerKindFor,
  resolveBowlingAnimation,
  timelineFor,
} from '../../core/bowling-animation';
import type { AnimatorEvent, Pose } from '../../core/bowling-animation';
import {
  batterFrameAt,
  resolveContactPresentation,
} from '../../core/batter-animation';
import type { ContactPresentation } from '../../core/batter-animation';
import { MatchCameraController } from '../../core/camera-controller';
import { BattingPresentation } from '../../core/batting-presentation';
import type { BattingDebugState } from '../../core/batting-presentation';
import {
  classifyTarget,
  project,
  screenToTarget,
  targetToWorld,
  worldToTarget,
} from '../../core/coordinates';
import type {
  BattingHand,
  NormalizedTarget,
  ViewParams,
} from '../../core/coordinates';
import type { MatchAssetRegistry } from '../../core/assets';
import { bowlerAssetId } from '../../core/assets';
import type {
  DeliveryPreviewDto,
  DeliveryResultDto,
} from '@the-cricketer/shared-types';
import type {
  FlightInput,
  SceneEvent,
  SceneMatchInfo,
  ScenePort,
} from '../../core/scene-port';
import { planTrajectory, ballAt } from '../../core/trajectory';
import type { TrajectoryPlan } from '../../core/trajectory';
import {
  VisualEventQueue,
  resultBanner,
  scheduleSequence,
} from '../../core/visual-events';
import type { ScheduledEvent } from '../../core/visual-events';
import { vec } from '../../core/vec';
import type { Vec3 } from '../../core/vec';
import {
  drawBall,
  drawBatter,
  drawBowler,
  drawGround,
  drawPitch,
  drawStumps,
  drawTargetMarker,
  drawZones,
} from '../render';
import type { Quality, RenderContext } from '../render';
import { B_ZONES } from '../zones';

export interface SceneHost {
  emit(event: SceneEvent): boolean | void;
}
export interface MatchSceneOptions {
  readonly host: SceneHost;
  readonly quality: Quality;
  readonly reducedMotion: boolean;
  readonly debug: boolean;
  readonly registry: MatchAssetRegistry;
}

interface Flight {
  readonly plan: TrajectoryPlan;
  readonly contact: ContactPresentation;
  readonly result: FlightInput;
  time: number;
  disturbed: number;
  trail: { x: number; y: number }[];
}

export interface SceneDebugState {
  readonly cameraState: string;
  /** Where the camera actually is: constant under reduced motion. */
  readonly cameraView: ViewParams;
  readonly fps: number;
  readonly lastPitch: {
    readonly world: { u: number; v: number };
    readonly normalized: NormalizedTarget;
    readonly screen: { x: number; y: number };
  } | null;
  readonly flightKind: string | null;
  readonly animatorPhase: string;
  readonly bowlerAnimationFallback: boolean;
  readonly releaseHand: Vec3 | null;
  /** Batting mode only: the presentation's clocks and the contact plan. */
  readonly batting: BattingDebugState | null;
  /** Batting mode only: where the ball and the bat's middle are on screen right now (for tests and the lab). */
  readonly screen: {
    readonly ball: { x: number; y: number } | null;
    readonly sweetSpot: { x: number; y: number } | null;
  } | null;
}

const LENGTH_NAMES = ['Yorker', 'Full', 'Good', 'Short', 'Bouncer'];

/**
 * The world: pitch, stumps, bowler, batter, ball and camera. It PRESENTS what the server decided
 * (the ball pitches where the engine says, moves by the engine's values, and the batter's swing is
 * chosen from the engine's shot and contact quality). It never computes a run or a wicket.
 */
export class MatchScene extends Phaser.Scene implements ScenePort {
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private markerLabel!: Phaser.GameObjects.Text;
  private debugText: Phaser.GameObjects.Text | null = null;
  private camera!: MatchCameraController;
  private animator: BowlingAnimator | null = null;
  private queue = new VisualEventQueue();
  private flight: Flight | null = null;
  private info: SceneMatchInfo | null = null;
  private target: NormalizedTarget = { x: 0.3, y: 0.48 };
  private targetVisible = false;
  private paused = false;
  private releaseHand: Vec3 | null = null;
  private lastPitch: SceneDebugState['lastPitch'] = null;
  private fallbackBowler = false;
  private dust: { u: number; v: number; age: number }[] = [];
  private sparks: { u: number; v: number; z: number; age: number }[] = [];
  private frames = 0;
  private fpsClock = 0;
  private fps = 60;
  private dragging = false;
  private ready = false;
  private viewCache: ViewParams | null = null;
  private batting: BattingPresentation | null = null;
  private timeScale = 1;
  private fastPref = false;
  private stepDt = 0;
  private battingTrail: { x: number; y: number }[] = [];
  private screenProbe: SceneDebugState['screen'] = null;

  constructor(private readonly opts: MatchSceneOptions) {
    super('MatchScene');
  }

  get cameraController(): MatchCameraController {
    return this.camera;
  }
  get isReady(): boolean {
    return this.ready;
  }
  debugState(): SceneDebugState {
    const frame = this.animator?.frame();
    return {
      cameraState: this.camera.cameraState,
      cameraView: this.camera.view,
      fps: this.fps,
      lastPitch: this.lastPitch,
      flightKind: this.flight?.plan.kind ?? null,
      animatorPhase: frame?.phase ?? 'idle',
      bowlerAnimationFallback: this.fallbackBowler,
      releaseHand: this.releaseHand,
      batting: this.batting?.debug() ?? null,
      screen: this.screenProbe,
    };
  }

  create(): void {
    this.g = this.add.graphics();
    this.camera = new MatchCameraController(this.opts.reducedMotion);
    this.camera.snapTo('PreDelivery');
    for (let i = 0; i < LENGTH_NAMES.length; i++)
      this.labels.push(this.makeText());
    this.markerLabel = this.makeText(true);
    if (this.opts.debug) {
      this.debugText = this.add
        .text(8, 8, '', {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '12px',
          color: '#9ff',
          backgroundColor: 'rgba(0,0,0,0.55)',
        })
        .setDepth(50)
        .setScrollFactor(0);
    }
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', () => (this.dragging = false));
    this.input.on('pointerupoutside', () => (this.dragging = false));
    this.input.setPollAlways();
    this.ready = true;
    this.opts.host.emit({ type: 'SCENE_READY' });
  }

  private makeText(strong = false): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: strong ? '14px' : '11px',
        fontStyle: strong ? 'bold' : 'normal',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: strong ? 4 : 3,
      })
      .setVisible(false)
      .setDepth(20);
  }

  // ---- ScenePort --------------------------------------------------------------------------

  prepare(info: SceneMatchInfo): void {
    this.info = info;
    if (info.mode === 'batting') {
      this.prepareBatting(info);
      return;
    }
    this.batting = null;
    const style = info.bowlerStyle;
    const resolved = resolveBowlingAnimation(
      style,
      this.opts.registry.unavailableClips(),
    );
    this.fallbackBowler = resolved.fallback;
    if (resolved.fallback)
      this.opts.host.emit({
        type: 'ASSET_WARNING',
        message: `No animation clip for ${style}; using a fallback action`,
      });
    const kind = bowlerKindFor(style);
    const arm = armFor(style);
    // a failed bowler asset (not just a clip) is reported once; the procedural bowler is the fallback
    const assetId = bowlerAssetId(kind, arm);
    if (!this.opts.registry.usable(assetId))
      this.opts.host.emit({
        type: 'ASSET_WARNING',
        message: `Asset ${assetId} unavailable; using the placeholder bowler`,
      });
    this.animator = new BowlingAnimator(
      timelineFor(
        kind,
        arm,
        resolved.definition.releaseMarker,
        this.opts.reducedMotion,
      ),
    );
    this.animator.on((event) => this.onAnimator(event));
    this.flight = null;
    this.queue.clear();
    this.releaseHand = null;
    this.camera.snapTo('PreDelivery');
  }

  // ---- batting ----------------------------------------------------------------------------

  private prepareBatting(info: SceneMatchInfo): void {
    this.camera = new MatchCameraController(
      this.opts.reducedMotion,
      'BowlerView',
    );
    this.camera.snapTo('BowlerView');
    this.animator = null;
    this.flight = null;
    this.queue.clear();
    this.dust = [];
    this.sparks = [];
    this.battingTrail = [];
    this.batting = new BattingPresentation({
      hand: info.battingHand,
      reducedMotion: this.opts.reducedMotion,
      trackBat: this.opts.debug,
      unavailableClips: this.opts.registry.unavailableClips(),
      emit: (event) => this.onBattingEvent(event),
      camera: (state) => this.camera.setState(state),
    });
    this.batting.setFast(this.fastPref);
    this.batting.prepare(info.bowlerStyle);
    this.fallbackBowler = this.batting.bowlerFallback;
    if (this.fallbackBowler)
      this.opts.host.emit({
        type: 'ASSET_WARNING',
        message: `No animation clip for ${info.bowlerStyle}; using a fallback action`,
      });
  }

  startDelivery(
    preview: DeliveryPreviewDto,
    replay?: {
      shotId: string;
      errorSeconds: number;
      result: DeliveryResultDto;
    },
  ): void {
    this.battingTrail = [];
    this.dust = [];
    this.sparks = [];
    this.batting?.startDelivery(preview, replay);
  }

  startSwing(shotId: string, startAt?: number): void {
    this.batting?.startSwing(shotId, undefined, startAt);
  }

  applyShotResult(result: DeliveryResultDto): void {
    this.batting?.applyResult(result);
  }

  presentationTime(): number | null {
    return this.batting?.now(performance.now()) ?? null;
  }

  setFast(fast: boolean): void {
    this.fastPref = fast;
    this.batting?.setFast(fast);
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.min(2, Math.max(0.02, scale));
  }

  step(seconds: number): void {
    this.stepDt += Math.max(0, Math.min(0.25, seconds));
  }

  private onBattingEvent(event: SceneEvent): boolean | void {
    if (event.type === 'BALL_PITCH' && this.batting) {
      const f = this.batting.frame();
      if (f.ball)
        this.dust.push({
          u: f.ball.position.u,
          v: f.ball.position.v,
          age: 0,
        });
    }
    const applied = this.batting?.appliedResult;
    if (event.type === 'RESULT' && applied)
      this.game.events.emit('match:result', resultBanner(applied.outcome));
    return this.opts.host.emit(event);
  }

  setTarget(target: NormalizedTarget, visible: boolean): void {
    this.target = target;
    this.targetVisible = visible;
  }

  startRunUp(): void {
    if (!this.animator) return;
    this.flight = null;
    this.queue.clear();
    this.releaseHand = null;
    this.animator.reset();
    this.camera.setState('RunUp');
    this.animator.start();
  }

  cancelRunUp(): void {
    this.animator?.cancel();
    this.camera.setState('PreDelivery');
  }

  beginFlight(result: FlightInput): void {
    const hand =
      this.releaseHand ?? this.animator?.frame().hand ?? vec(0.2, 0.3, 2.1);
    const hands: BattingHand = result.delivery.battingHand;
    const plan = planTrajectory({
      delivery: result.delivery,
      shot: result.shot,
      outcome: result.outcome,
      release: vec(hand.u, hand.v + FLIGHT.releaseAhead * 0, hand.z),
      hand: hands,
    });
    const contact = resolveContactPresentation(
      result.shot,
      plan.arrival,
      plan.kind,
      hands,
      this.opts.reducedMotion,
    );
    this.flight = { plan, contact, result, time: 0, disturbed: 0, trail: [] };
    if (contact.fallbackClip)
      this.opts.host.emit({
        type: 'ASSET_WARNING',
        message: `No batting animation for ${result.shot.shotId}; using ${contact.clip}`,
      });
    this.queue.schedule(
      scheduleSequence(plan, {
        reducedMotion: this.opts.reducedMotion,
        lead: contact.lead,
      }),
    );
    this.camera.setState('BallTracking');
  }

  skip(): void {
    if (this.batting) {
      this.batting.skip();
      return;
    }
    const flight = this.flight;
    if (!flight) return;
    for (const event of this.queue.flush()) this.handle(event);
    if (this.flight) {
      this.flight.time = this.flight.plan.duration;
      this.flight.disturbed = this.flight.plan.kind === 'bowled' ? 1 : 0;
    }
    this.animator?.update(30);
  }

  reset(): void {
    if (this.batting && this.info) {
      this.batting.reset();
      this.batting.prepare(this.info.bowlerStyle);
      this.camera.setState('Reset');
      this.dust = [];
      this.sparks = [];
      this.battingTrail = [];
      return;
    }
    this.flight = null;
    this.queue.clear();
    this.releaseHand = null;
    this.animator?.reset();
    this.camera.setState('PreDelivery');
    this.dust = [];
    this.sparks = [];
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  // ---- events -----------------------------------------------------------------------------

  private onAnimator(event: AnimatorEvent): boolean | void {
    switch (event.type) {
      case 'RUN_UP_STARTED':
        this.opts.host.emit({ type: 'RUN_UP_STARTED' });
        return;
      case 'BALL_RELEASE': {
        this.releaseHand = event.hand;
        this.camera.setState('Release');
        const accepted = this.opts.host.emit({
          type: 'BALL_RELEASE',
          hand: event.hand,
        });
        return accepted === false ? false : true;
      }
      default:
        return;
    }
  }

  private handle(event: ScheduledEvent): void {
    const flight = this.flight;
    switch (event.type) {
      case 'BALL_PITCH': {
        if (flight) {
          const p = flight.plan.pitchPoint;
          const screen = project(
            p,
            this.viewCache ?? this.camera.view,
            this.viewport(),
          );
          this.lastPitch = {
            world: { u: p.u, v: p.v },
            normalized: worldToTarget(
              p.u,
              p.v,
              flight.result.delivery.battingHand,
            ),
            screen: { x: screen.x, y: screen.y },
          };
          this.dust.push({ u: p.u, v: p.v, age: 0 });
        }
        this.opts.host.emit({ type: 'BALL_PITCH' });
        return;
      }
      case 'BALL_NEAR_BATTER':
        this.camera.setState('Batter');
        this.opts.host.emit({ type: 'BALL_NEAR_BATTER' });
        return;
      case 'CONTACT_PRESENTATION':
        if (flight?.contact.contactMade)
          this.sparks.push({
            u: flight.plan.arrival.u,
            v: flight.plan.arrival.v,
            z: flight.plan.arrival.z,
            age: 0,
          });
        this.opts.host.emit({ type: 'CONTACT_PRESENTATION' });
        return;
      case 'RESULT':
        if (flight) {
          const banner = resultBanner(flight.result.outcome);
          this.game.events.emit('match:result', banner);
        }
        this.camera.setState('Result');
        this.opts.host.emit({ type: 'RESULT' });
        return;
      case 'SCORE_UPDATE':
        this.opts.host.emit({ type: 'SCORE_UPDATE' });
        return;
      case 'SEQUENCE_COMPLETE':
        this.opts.host.emit({ type: 'SEQUENCE_COMPLETE' });
        return;
      default:
        return;
    }
  }

  // ---- pointer ----------------------------------------------------------------------------

  /**
   * Press / touch. Separate handlers for press and move, because the type of the underlying DOM event is
   * `touchstart` on a phone and `pointerdown` with a mouse: Phaser's own `pointerdown` event is the one that
   * means "pressed" for both.
   */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.batting) {
      // a tap on the pitch is the swing; WHICH shot is decided by the controls, not by where it lands
      if (this.batting.isActive) {
        const at = this.batting.now(performance.now());
        if (at !== null) this.opts.host.emit({ type: 'SWING_INPUT', at });
      }
      return;
    }
    if (!this.targetVisible || !this.info) return;
    this.dragging = true;
    this.aimAt(pointer);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.batting || !this.targetVisible || !this.info) return;
    if (!this.dragging || !pointer.isDown) return;
    this.aimAt(pointer);
  }

  private aimAt(pointer: Phaser.Input.Pointer): void {
    if (!this.info) return;
    const hit = screenToTarget(
      pointer.x,
      pointer.y,
      this.camera.view,
      this.viewport(),
      this.info.battingHand,
    );
    if (hit) this.opts.host.emit({ type: 'TARGET_CHANGED', target: hit });
  }

  private viewport() {
    return {
      width: this.scale.width,
      height: this.scale.height,
    };
  }

  // ---- frame ------------------------------------------------------------------------------

  override update(_time: number, delta: number): void {
    if (!this.ready) return;
    this.frames++;
    this.fpsClock += delta;
    if (this.fpsClock >= 2000) {
      this.fps = Math.round((this.frames * 1000) / this.fpsClock);
      this.opts.host.emit({ type: 'FPS_SAMPLE', fps: this.fps });
      this.frames = 0;
      this.fpsClock = 0;
    }
    let dt = this.paused
      ? this.stepDt
      : Math.min(delta / 1000, 0.05) * this.timeScale;
    this.stepDt = 0;
    if (this.paused) dt = Math.min(dt, 0.25);
    if (this.batting) {
      this.updateBatting(dt);
      return;
    }
    const frame = this.animator ? this.animator.update(dt) : null;
    const flight = this.flight;
    if (flight && dt > 0) {
      flight.time += dt;
      for (const event of this.queue.advance(dt)) this.handle(event);
    }
    const live = this.flight;
    const ball = live ? ballAt(live.plan, live.time) : null;
    const view = this.camera.update(dt, { ball });
    this.viewCache = view;
    for (const d of this.dust) d.age += dt;
    this.dust = this.dust.filter((d) => d.age < 0.7);
    for (const s of this.sparks) s.age += dt;
    this.sparks = this.sparks.filter((s) => s.age < 0.4);
    if (live && live.plan.kind === 'bowled') {
      const t = live.time - live.plan.flightTime;
      live.disturbed = Math.max(0, Math.min(1, t / 0.4));
    }
    this.draw(view, frame?.pose ?? null, ball);
  }

  private updateBatting(dt: number): void {
    const batting = this.batting!;
    batting.update(dt);
    const frame = batting.frame();
    const view = this.camera.update(dt, { ball: frame.ball?.position ?? null });
    this.viewCache = view;
    for (const d of this.dust) d.age += dt;
    this.dust = this.dust.filter((d) => d.age < 0.7);
    const g = this.g;
    g.clear();
    const viewport = this.viewport();
    const ctx: RenderContext = {
      g,
      P: (p) => project(p, view, viewport),
      width: viewport.width,
      height: viewport.height,
      quality: this.opts.quality,
      rotated: view.rotated ?? false,
    };
    for (const label of this.labels) label.setVisible(false);
    this.markerLabel.setVisible(false);
    drawGround(ctx);
    drawPitch(ctx, this.info?.pitchKind ?? 'hard');
    drawStumps(ctx, frame.stumpsDisturbed);
    const colors = (shirt: number, pants: number) => ({
      shirt,
      pants,
      skin: PALETTE.skin,
    });
    if (frame.bowler)
      drawBowler(
        ctx,
        frame.bowler,
        colors(PALETTE.bowlerShirt, PALETTE.bowlerPants),
      );
    if (frame.ballInHand)
      drawBall(ctx, frame.ballInHand, FLIGHT.ballRadius, [], 0);
    const ball = frame.ball?.position ?? null;
    // The ball is drawn over the batter on purpose: from behind him his body would hide the ball for the last
    // metres, which is exactly when the player needs to see it.
    drawBatter(
      ctx,
      frame.batter,
      colors(PALETTE.batterShirt, PALETTE.batterPants),
    );
    if (frame.ball) this.drawBattingBall(ctx, frame.ball);
    for (const s of frame.sparks) {
      const p = ctx.P(s.position);
      if (!p.visible) continue;
      g.lineStyle(2, 0xffffff, Math.max(0, 1 - s.age * 2.5));
      g.strokeCircle(p.x, p.y, p.scale * (0.1 + s.age * 0.9));
    }
    this.drawEffects(ctx);
    const probe = (p: Vec3 | null) => {
      if (!p) return null;
      const q = ctx.P(p);
      return q.visible ? { x: q.x, y: q.y } : null;
    };
    this.screenProbe = {
      ball: probe(ball),
      sweetSpot: probe(frame.batter.sweetSpot),
    };
    if (this.opts.debug) this.drawBattingDebug(ctx, frame);
  }

  private drawBattingBall(
    ctx: RenderContext,
    ball: { position: Vec3; spin: number },
  ): void {
    const p = ctx.P(ball.position);
    if (p.visible && !this.opts.reducedMotion) {
      this.battingTrail.push({ x: p.x, y: p.y });
      if (this.battingTrail.length > 9) this.battingTrail.shift();
    }
    drawBall(
      ctx,
      ball.position,
      FLIGHT.ballRadius,
      this.opts.reducedMotion ? [] : this.battingTrail,
      ball.spin,
    );
  }

  private drawBattingDebug(
    ctx: RenderContext,
    frame: ReturnType<BattingPresentation['frame']>,
  ): void {
    const d = this.batting!.debug();
    const mark = (p: Vec3, color: number, r: number) => {
      const q = ctx.P(p);
      if (!q.visible) return;
      ctx.g.lineStyle(2, color, 1);
      ctx.g.strokeCircle(q.x, q.y, r);
    };
    mark(frame.batter.sweetSpot, 0x00ff88, 7);
    mark(frame.batter.insideEdge, 0xffaa00, 5);
    mark(frame.batter.outsideEdge, 0xffaa00, 5);
    const lines = [
      `t=${d.flightTime?.toFixed(3) ?? '-'} contact@${d.contactTime?.toFixed(3) ?? '-'} swing@${d.swingStartedAt?.toFixed(3) ?? '-'} clock=${d.animClock?.toFixed(3) ?? '-'}`,
      `plan ${d.plan ? `${d.plan.quality} made=${d.plan.contactMade} exceeded=${d.plan.exceeded} warp=${d.plan.timingWarp.toFixed(2)}` : '-'} kind=${d.kind ?? '-'}`,
      `ball→bat ${d.ballToSweetSpot?.toFixed(3) ?? '-'} m (edge ${d.ballToEdge?.toFixed(3) ?? '-'})  closest ${d.closestToSweetSpot?.toFixed(3) ?? '-'} m`,
      `camera ${this.camera.cameraState} fps ${this.fps}`,
    ];
    this.debugText?.setText(lines.join('\n'));
  }

  private draw(view: ViewParams, pose: Pose | null, ball: Vec3 | null): void {
    const info = this.info;
    const g = this.g;
    g.clear();
    const viewport = this.viewport();
    const ctx: RenderContext = {
      g,
      P: (p) => project(p, view, viewport),
      width: viewport.width,
      height: viewport.height,
      quality: this.opts.quality,
    };
    drawGround(ctx);
    drawPitch(ctx, info?.pitchKind ?? 'hard');
    const hand: BattingHand = info?.battingHand ?? 'right';
    const readout = classifyTarget(this.target);
    const showAim =
      this.targetVisible && !this.flight && !this.animator?.isActive;
    for (const label of this.labels) label.setVisible(false);
    this.markerLabel.setVisible(false);
    if (showAim) {
      drawZones(ctx, hand, readout);
      drawTargetMarker(ctx, this.target, hand);
      this.placeLabels(ctx, hand, readout);
    }

    const flight = this.flight;
    drawStumps(ctx, flight?.disturbed ?? 0);

    // people and ball, back to front
    const batterTime = flight ? flight.time - flight.plan.flightTime : -5;
    const batterFrame = batterFrameAt(
      { hand },
      flight ? flight.contact : null,
      batterTime,
    );
    const ballBehindBatter = ball && ball.v > batterFrame.joints.pelvis.v;
    const colors = (shirt: number, pants: number) => ({
      shirt,
      pants,
      skin: PALETTE.skin,
    });
    if (ball && ballBehindBatter) this.drawBallNow(ctx, ball, flight);
    drawBatter(
      ctx,
      batterFrame,
      colors(PALETTE.batterShirt, PALETTE.batterPants),
    );
    if (ball && !ballBehindBatter) this.drawBallNow(ctx, ball, flight);
    if (pose) {
      drawBowler(ctx, pose, colors(PALETTE.bowlerShirt, PALETTE.bowlerPants));
      // before release the ball is in the bowler's hand
      if (!flight && this.animator) {
        const f = this.animator.frame();
        const releasedAlready = this.animator.released;
        if (!releasedAlready) drawBall(ctx, f.hand, FLIGHT.ballRadius, [], 0);
      }
    }
    this.drawEffects(ctx);
    if (this.opts.debug) this.drawDebug(ctx, flight);
  }

  private drawBallNow(
    ctx: RenderContext,
    ball: Vec3,
    flight: Flight | null,
  ): void {
    if (!flight) return;
    const p = ctx.P(ball);
    if (p.visible && !this.opts.reducedMotion) {
      flight.trail.push({ x: p.x, y: p.y });
      if (flight.trail.length > 9) flight.trail.shift();
    }
    const spin =
      flight.time * (8 + Math.abs(flight.result.delivery.movement.spin) * 90);
    drawBall(
      ctx,
      ball,
      FLIGHT.ballRadius,
      this.opts.reducedMotion ? [] : flight.trail,
      spin,
    );
  }

  private drawEffects(ctx: RenderContext): void {
    for (const d of this.dust) {
      const p = ctx.P(vec(d.u, d.v, 0.05));
      if (!p.visible) continue;
      ctx.g.fillStyle(0xe8dcc0, Math.max(0, 0.5 - d.age * 0.7));
      ctx.g.fillEllipse(
        p.x,
        p.y,
        p.scale * (0.35 + d.age),
        p.scale * (0.14 + d.age * 0.3),
      );
    }
    for (const s of this.sparks) {
      const p = ctx.P(vec(s.u, s.v, s.z));
      if (!p.visible) continue;
      ctx.g.lineStyle(2, 0xffffff, Math.max(0, 1 - s.age * 2.5));
      const r = p.scale * (0.1 + s.age * 0.9);
      ctx.g.strokeCircle(p.x, p.y, r);
    }
  }

  private placeLabels(
    ctx: RenderContext,
    hand: BattingHand,
    readout: ReturnType<typeof classifyTarget>,
  ): void {
    const edges = [0, ...B_ZONES.lengthEdges, 1];
    // zone labels need room: hide them on narrow canvases (the DOM readout still names the zone)
    const cssWidth = ctx.width * this.scale.zoom;
    const lineLabelsLeft = cssWidth > 640;
    for (let i = 0; i < LENGTH_NAMES.length && lineLabelsLeft; i++) {
      const mid = targetToWorld(
        { x: 0, y: (edges[i]! + edges[i + 1]!) / 2 },
        hand,
      );
      const p = ctx.P(vec(-1.95, mid.v, 0));
      const label = this.labels[i]!;
      if (!p.visible) continue;
      label.setText(LENGTH_NAMES[i]!.toUpperCase());
      label.setPosition(p.x, p.y);
      label.setOrigin(1, 0.5);
      label.setVisible(true);
      label.setAlpha(
        readout.length === LENGTH_NAMES[i]!.toLowerCase().replace(' length', '')
          ? 1
          : 0.7,
      );
    }
    const centre = ctx.P(targetToWorld(this.target, hand));
    if (centre.visible) {
      this.markerLabel.setText(
        `${readout.line.replace('_', ' ')} · ${readout.length}`.toUpperCase(),
      );
      this.markerLabel.setPosition(
        centre.x,
        centre.y - Math.max(24, centre.scale * 0.6),
      );
      this.markerLabel.setOrigin(0.5, 1);
      this.markerLabel.setVisible(ctx.width > 360);
    }
  }

  private drawDebug(ctx: RenderContext, flight: Flight | null): void {
    const lines: string[] = [];
    const aim = this.target;
    const cls = classifyTarget(aim);
    lines.push(
      `aim x=${aim.x.toFixed(3)} y=${aim.y.toFixed(3)} (${cls.line}/${cls.length})`,
    );
    if (flight) {
      const d = flight.result.delivery;
      lines.push(
        `intended ${d.intended.target.x.toFixed(3)},${d.intended.target.y.toFixed(3)} ${d.intended.line}/${d.intended.length}`,
        `actual   ${d.actual.target.x.toFixed(3)},${d.actual.target.y.toFixed(3)} ${d.actual.line}/${d.actual.length}`,
        `speed ${d.speedKmh} km/h  swing ${d.movement.swing}  seam ${d.movement.seam}  spin ${d.movement.spin}  bounce ${d.bounce}`,
        `kind ${flight.plan.kind} flight ${flight.plan.flightTime.toFixed(2)}s t=${flight.time.toFixed(2)}`,
      );
      // trajectory path
      ctx.g.lineStyle(1, 0x00ffff, 0.8);
      ctx.g.beginPath();
      for (let t = 0; t <= flight.plan.duration; t += 0.04) {
        const p = ctx.P(ballAt(flight.plan, t));
        if (!p.visible) continue;
        if (t === 0) ctx.g.moveTo(p.x, p.y);
        else ctx.g.lineTo(p.x, p.y);
      }
      ctx.g.strokePath();
      const pp = ctx.P(flight.plan.pitchPoint);
      ctx.g.lineStyle(2, 0x00ff88, 1);
      ctx.g.strokeCircle(pp.x, pp.y, 8);
    }
    const frame = this.animator?.frame();
    lines.push(
      `camera ${this.camera.cameraState}  anim ${frame?.phase ?? 'idle'} ${(frame?.phaseTime ?? 0).toFixed(2)} release@${this.animator?.timeline.releaseMarker ?? '-'}  fps ${this.fps}`,
    );
    this.debugText?.setText(lines.join('\n'));
  }

  teardown(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.ready = false;
  }
}

export { SEQUENCE };
