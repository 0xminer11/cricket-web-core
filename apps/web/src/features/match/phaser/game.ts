import * as Phaser from 'phaser';
import type {
  DeliveryPreviewDto,
  DeliveryResultDto,
} from '@the-cricketer/shared-types';
import { MatchAssetRegistry } from '../core/assets';
import type {
  FlightInput,
  SceneEvent,
  SceneMatchInfo,
  ScenePort,
} from '../core/scene-port';
import type { NormalizedTarget } from '../core/coordinates';
import { MatchBootScene } from './scenes/match-boot-scene';
import { MatchPreloadScene } from './scenes/match-preload-scene';
import { MatchScene } from './scenes/match-scene';
import type { SceneDebugState, SceneHost } from './scenes/match-scene';
import { MatchUIScene } from './scenes/match-ui-scene';
import type { Quality } from './render';

export interface MatchGameOptions {
  readonly parent: HTMLElement;
  readonly host: SceneHost;
  readonly quality: Quality;
  readonly reducedMotion: boolean;
  readonly debug: boolean;
  /** Asset ids to treat as failed (development/testing the fallbacks). */
  readonly simulateAssetFailures?: readonly string[];
}

export interface MatchGame {
  readonly port: ScenePort;
  readonly registry: MatchAssetRegistry;
  debug(): SceneDebugState | null;
  canvasCount(): number;
  destroy(): void;
}

/** DPR by quality tier: low devices render at 1x, others are capped to keep the frame budget. */
const DPR_CAP: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };

/**
 * Commands issued before the scene has finished creating are queued and replayed in order, so the
 * controller never needs to know whether Phaser is ready yet.
 */
class BufferedPort implements ScenePort {
  private target: ScenePort | null = null;
  private queue: ((port: ScenePort) => void)[] = [];
  bind(target: ScenePort): void {
    this.target = target;
    const pending = this.queue;
    this.queue = [];
    for (const call of pending) call(target);
  }
  unbind(): void {
    this.target = null;
    this.queue = [];
  }
  private run(call: (port: ScenePort) => void): void {
    if (this.target) call(this.target);
    else this.queue.push(call);
  }
  prepare(info: SceneMatchInfo): void {
    // only the latest preparation matters
    this.queue = this.queue.filter((q) => q.name !== 'prepare');
    const prepare = (p: ScenePort) => p.prepare(info);
    Object.defineProperty(prepare, 'name', { value: 'prepare' });
    this.run(prepare);
  }
  setTarget(target: NormalizedTarget, visible: boolean): void {
    this.run((p) => p.setTarget(target, visible));
  }
  startRunUp(): void {
    this.run((p) => p.startRunUp());
  }
  cancelRunUp(): void {
    this.run((p) => p.cancelRunUp());
  }
  beginFlight(result: FlightInput): void {
    this.run((p) => p.beginFlight(result));
  }
  skip(): void {
    this.run((p) => p.skip());
  }
  reset(): void {
    this.run((p) => p.reset());
  }
  setPaused(paused: boolean): void {
    this.run((p) => p.setPaused(paused));
  }
  startDelivery(
    preview: DeliveryPreviewDto,
    replay?: Parameters<ScenePort['startDelivery']>[1],
  ): void {
    this.run((p) => p.startDelivery(preview, replay));
  }
  startSwing(shotId: string, startAt?: number): void {
    this.run((p) => p.startSwing(shotId, startAt));
  }
  applyShotResult(result: DeliveryResultDto): void {
    this.run((p) => p.applyShotResult(result));
  }
  presentationTime(): number | null {
    return this.target?.presentationTime() ?? null;
  }
  setFast(fast: boolean): void {
    this.run((p) => p.setFast(fast));
  }
  setTimeScale(scale: number): void {
    this.run((p) => p.setTimeScale(scale));
  }
  step(seconds: number): void {
    this.run((p) => p.step(seconds));
  }
}

export function createMatchGame(options: MatchGameOptions): MatchGame {
  const registry = new MatchAssetRegistry(
    undefined,
    options.simulateAssetFailures ?? [],
  );
  const port = new BufferedPort();
  const dpr = () =>
    Math.min(window.devicePixelRatio || 1, DPR_CAP[options.quality]);
  const size = () => {
    const rect = options.parent.getBoundingClientRect();
    return {
      width: Math.max(160, Math.round(rect.width * dpr())),
      height: Math.max(120, Math.round(rect.height * dpr())),
    };
  };
  const initial = size();
  const scene = new MatchScene({
    host: options.host,
    quality: options.quality,
    reducedMotion: options.reducedMotion,
    debug: options.debug,
    registry,
  });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: options.parent,
    width: initial.width,
    height: initial.height,
    backgroundColor: '#0b1622',
    // we size the canvas ourselves so HiDPI is explicit and bounded by the quality tier
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr() },
    render: {
      antialias: options.quality !== 'low',
      powerPreference: 'high-performance',
    },
    input: { touch: { capture: true }, mouse: { preventDefaultDown: true } },
    audio: { noAudio: true },
    banner: false,
    scene: [
      new MatchBootScene(),
      new MatchPreloadScene(
        registry,
        (event: SceneEvent) => void options.host.emit(event),
      ),
      scene,
      new MatchUIScene(options.reducedMotion),
    ],
  });
  game.canvas.style.touchAction = 'none';
  game.canvas.style.userSelect = 'none';
  (
    game.canvas.style as CSSStyleDeclaration & { webkitUserSelect: string }
  ).webkitUserSelect = 'none';
  game.canvas.setAttribute('aria-hidden', 'true');
  game.canvas.dataset.matchCanvas = 'true';
  // bind once the match scene has finished creating
  const bindWhenReady = () => {
    if (scene.isReady) {
      port.bind(scene);
      return;
    }
    requestAnimationFrame(bindWhenReady);
  };
  bindWhenReady();

  const resize = () => {
    const next = size();
    game.scale.setZoom(1 / dpr());
    game.scale.resize(next.width, next.height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(options.parent);
  const onVisibility = () => {
    // a hidden tab pauses the loop; nothing is ever resolved in the background
    if (document.hidden) game.loop.sleep();
    else game.loop.wake();
  };
  document.addEventListener('visibilitychange', onVisibility);
  return {
    port,
    registry,
    debug: () => (scene.isReady ? scene.debugState() : null),
    canvasCount: () => options.parent.querySelectorAll('canvas').length,
    destroy() {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      port.unbind();
      scene.teardown();
      game.destroy(true, false);
    },
  };
}
