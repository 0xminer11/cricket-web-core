import {
  PCFShadowMap,
  SRGBColorSpace,
  ACESFilmicToneMapping,
  WebGLRenderer,
} from 'three';
import type { PerspectiveCamera, Scene } from 'three';
import type { QualityProfile } from '@the-cricketer/game-core';

export interface EngineStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
}

/** Cheap capability probe that never throws. */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Owns the WebGL renderer and the render loop. The loop renders only while something changes
 * (animation playing, camera moving, a model attached) and sleeps otherwise; it also stops when the
 * tab is hidden or the viewer scrolls offscreen. Resize is handled with a ResizeObserver and the
 * pixel ratio is capped by the quality profile. `dispose` releases everything, including the GPU
 * context, so repeatedly entering the viewer cannot accumulate WebGL contexts.
 */
export class ViewerEngine {
  readonly renderer: WebGLRenderer;
  private raf = 0;
  private running = false;
  private visible = true;
  private onScreen = true;
  private disposed = false;
  private needsRender = true;
  private last = 0;
  private fps = 0;
  private frames = 0;
  private fpsSince = 0;
  private frameMs = 0;
  private resizeObserver: ResizeObserver | undefined;
  private intersection: IntersectionObserver | undefined;
  private readonly cleanup: Array<() => void> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
    private readonly profile: QualityProfile,
    private readonly hooks: {
      scene: () => Scene;
      camera: () => PerspectiveCamera;
      /** Called each frame; return true while something is still animating. */
      update: (deltaSeconds: number) => boolean;
      onResize: (width: number, height: number) => void;
      onContextLost: () => void;
      onContextRestored: () => void;
    },
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: profile.antialias,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    if (profile.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = PCFShadowMap;
    }
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio),
    );
    this.resize();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.intersection = new IntersectionObserver((entries) => {
      this.onScreen = entries.some((e) => e.isIntersecting);
      if (this.onScreen) this.wake();
    });
    this.intersection.observe(host);

    const onVisibility = () => {
      this.visible = document.visibilityState === 'visible';
      if (this.visible) this.wake();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanup.push(() =>
      document.removeEventListener('visibilitychange', onVisibility),
    );
    const lost = (e: Event) => {
      e.preventDefault(); // allows the browser to restore the context
      hooks.onContextLost();
    };
    const restored = () => hooks.onContextRestored();
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    this.cleanup.push(() => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    });
  }

  /** Ask for (at least) one more frame. Safe to call often. */
  requestRender(): void {
    this.needsRender = true;
    this.wake();
  }

  private wake(): void {
    if (this.disposed || this.running || !this.visible || !this.onScreen)
      return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    this.raf = 0;
    if (this.disposed) return;
    if (!this.visible || !this.onScreen) {
      this.running = false;
      return;
    }
    const minInterval = 1000 / this.profile.maxFps;
    const elapsed = now - this.last;
    if (elapsed < minInterval - 1) {
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    const delta = Math.min(0.1, elapsed / 1000);
    this.last = now;
    const animating = this.hooks.update(delta);
    if (animating || this.needsRender) {
      const started = performance.now();
      this.renderer.render(this.hooks.scene(), this.hooks.camera());
      this.frameMs = this.frameMs * 0.9 + (performance.now() - started) * 0.1;
      this.frames += 1;
      this.needsRender = false;
    }
    if (now - this.fpsSince >= 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsSince);
      this.frames = 0;
      this.fpsSince = now;
    }
    if (animating || this.needsRender)
      this.raf = requestAnimationFrame(this.tick);
    else this.running = false; // nothing changing: sleep until requestRender()
  };

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.hooks.onResize(width, height);
    this.requestRender();
  }

  get stats(): EngineStats {
    const info = this.renderer.info;
    return {
      fps: Math.round(this.fps),
      frameMs: Number(this.frameMs.toFixed(2)),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      pixelRatio: this.renderer.getPixelRatio(),
    };
  }

  /** Render once and return a PNG data URL (local portrait foundation; nothing is uploaded). */
  capturePortrait(): string {
    this.renderer.render(this.hooks.scene(), this.hooks.camera());
    return this.canvas.toDataURL('image/png');
  }

  get isRunning(): boolean {
    return this.running;
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.running = false;
    this.resizeObserver?.disconnect();
    this.intersection?.disconnect();
    for (const fn of this.cleanup) fn();
    this.cleanup.length = 0;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
