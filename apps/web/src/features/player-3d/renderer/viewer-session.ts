import { AxesHelper, SkeletonHelper } from 'three';
import type {
  CameraPresetId,
  LogicalAnimation,
  QualityLevel,
} from '@the-cricketer/game-core';
import { QUALITY_PROFILES } from '@the-cricketer/game-core';
import { CharacterAnimationController } from '../animation/animation-controller';
import { OrbitCameraController } from '../camera/orbit-camera-controller';
import { BaseAssetError } from '../character/errors';
import { CharacterController } from '../character/character-controller';
import type { ApplyReport } from '../character/character-controller';
import { sharedCharacterLoader } from '../character/loader';
import { StudioScene } from '../lighting/studio-scene';
import type { CharacterPlan } from '../types';
import { ViewerEngine, isWebGLAvailable } from './viewer-engine';
import type { EngineStats } from './viewer-engine';

export type SessionFailure =
  'webgl_unsupported' | 'base_asset_failed' | 'context_lost' | 'unknown';

export interface SessionEvents {
  onReady(info: {
    durationMs: number;
    bytes: number;
    report: ApplyReport;
  }): void;
  onFailure(reason: SessionFailure): void;
  /** Optional pieces failed to load; the character is still shown. */
  onPartialFailure(report: ApplyReport): void;
}

/**
 * One viewer instance: renderer + studio + camera + character + animation. React talks to this
 * class through a handful of methods; everything Three.js stays behind it, in the lazily loaded
 * viewer chunk. Safe to dispose at any time, including while assets are still loading.
 */
export class ViewerSession {
  private engine: ViewerEngine | undefined;
  private studio: StudioScene | undefined;
  private camera: OrbitCameraController | undefined;
  private character: CharacterController | undefined;
  private animation: CharacterAnimationController | undefined;
  private disposed = false;
  private started = 0;
  private currentPlan: CharacterPlan | undefined;
  private reducedMotion = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
    private readonly quality: QualityLevel,
    private readonly events: SessionEvents,
  ) {}

  /** Create the renderer. Returns false (and reports) when WebGL is unavailable. */
  init(): boolean {
    if (!isWebGLAvailable()) {
      this.events.onFailure('webgl_unsupported');
      return false;
    }
    const profile = QUALITY_PROFILES[this.quality];
    try {
      this.studio = new StudioScene(profile);
      const rect = this.host.getBoundingClientRect();
      this.camera = new OrbitCameraController(
        this.host,
        Math.max(1, rect.width) / Math.max(1, rect.height || 1),
        () => this.engine?.requestRender(),
      );
      this.character = new CharacterController(
        sharedCharacterLoader,
        profile.maxTextureSize,
        () => this.engine?.requestRender(),
      );
      this.studio.scene.add(this.character.root);
      this.animation = new CharacterAnimationController(
        () => this.character?.animationClips ?? [],
        () => this.character?.animationRoot,
      );
      this.reducedMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
        false;
      this.animation.setReducedMotion(this.reducedMotion);
      this.engine = new ViewerEngine(this.canvas, this.host, profile, {
        scene: () => (this.studio as StudioScene).scene,
        camera: () => (this.camera as OrbitCameraController).camera,
        update: (dt) => {
          this.animation?.update(dt);
          const moving = this.camera?.update(dt) ?? false;
          return moving || (this.animation?.animating ?? false);
        },
        onResize: (w, h) => this.camera?.resize(w / h),
        onContextLost: () => this.events.onFailure('context_lost'),
        onContextRestored: () => this.engine?.requestRender(),
      });
      sharedCharacterLoader.setRenderer(this.engine.renderer);
      this.camera.setAutoRotate(!this.reducedMotion);
      return true;
    } catch {
      this.events.onFailure('webgl_unsupported');
      return false;
    }
  }

  /** Apply a plan (latest wins). Reports readiness or failure through the events. */
  async setPlan(plan: CharacterPlan): Promise<void> {
    if (!this.character || this.disposed) return;
    this.currentPlan = plan;
    const first = this.started === 0;
    if (first) this.started = performance.now();
    try {
      const report = await this.character.apply(plan);
      if (this.disposed) return;
      this.animation?.play(plan.animation, plan.handedness);
      this.engine?.requestRender();
      if (first) {
        const stats = sharedCharacterLoader.cache.stats();
        this.events.onReady({
          durationMs: Math.round(performance.now() - this.started),
          bytes: stats.bytes,
          report,
        });
      }
      if (report.failedParts.length) this.events.onPartialFailure(report);
    } catch (error) {
      if (this.disposed) return;
      this.events.onFailure(
        error instanceof BaseAssetError ? 'base_asset_failed' : 'unknown',
      );
    }
  }

  setAnimation(logical: LogicalAnimation): void {
    if (this.currentPlan)
      this.animation?.play(logical, this.currentPlan.handedness);
    this.engine?.requestRender();
  }
  focus(preset: CameraPresetId): void {
    this.camera?.goTo(preset);
  }
  rotate(radians: number): void {
    this.camera?.rotateBy(radians);
  }
  zoom(factor: number): void {
    this.camera?.zoomBy(factor);
  }
  resetView(): void {
    this.camera?.reset();
  }

  get stats():
    | (EngineStats & {
        cache: ReturnType<typeof sharedCharacterLoader.cache.stats>;
        materials: number;
      })
    | undefined {
    if (!this.engine || !this.character) return undefined;
    return {
      ...this.engine.stats,
      cache: sharedCharacterLoader.cache.stats(),
      materials: this.character.materials.stats().materials,
    };
  }
  get attachedParts(): string[] {
    return this.character?.partKeys ?? [];
  }
  get controller(): CharacterController | undefined {
    return this.character;
  }
  get orbit(): OrbitCameraController | undefined {
    return this.camera;
  }
  get engineRunning(): boolean {
    return this.engine?.isRunning ?? false;
  }
  requestRender(): void {
    this.engine?.requestRender();
  }
  private boneHelper: SkeletonHelper | undefined;
  private axes: AxesHelper | undefined;
  /** DEVELOPMENT: draw the skeleton and world axes to debug attachments. */
  setBoneDebug(on: boolean): void {
    if (!this.studio || !this.character) return;
    if (on && !this.boneHelper) {
      this.boneHelper = new SkeletonHelper(this.character.root);
      this.axes = new AxesHelper(0.5);
      this.studio.scene.add(this.boneHelper, this.axes);
    } else if (!on && this.boneHelper) {
      this.studio.scene.remove(this.boneHelper);
      if (this.axes) this.studio.scene.remove(this.axes);
      this.boneHelper.dispose();
      this.axes?.dispose();
      this.boneHelper = this.axes = undefined;
    }
    this.engine?.requestRender();
  }
  capturePortrait(): string | undefined {
    return this.engine?.capturePortrait();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.setBoneDebug(false);
    this.animation?.dispose();
    this.camera?.dispose();
    this.character?.dispose();
    this.studio?.dispose();
    this.engine?.dispose();
    this.animation =
      this.camera =
      this.character =
      this.studio =
      this.engine =
        undefined;
  }
}
