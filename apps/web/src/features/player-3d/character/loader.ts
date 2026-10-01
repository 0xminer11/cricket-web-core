import type { Object3D, Texture, WebGLRenderer, AnimationClip } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetRegistry } from '../assets/asset-registry';
import type { AssetRegistry } from '../assets/asset-registry';
import type { ResolvedAsset } from '../assets/asset-registry';
import { AssetCache } from './asset-cache';
import { AssetError } from './errors';

/** What the rest of the viewer needs from a parsed file. */
export interface LoadedModel {
  readonly scene: Object3D;
  readonly animations: readonly AnimationClip[];
  readonly gltf: GLTF;
}

const LOAD_TIMEOUT_MS = 20_000;

/** Free every GPU resource of a parsed model. Called on cache eviction only. */
export function disposeModel(model: LoadedModel): void {
  const textures = new Set<Texture>();
  model.scene.traverse((node) => {
    const mesh = node as Object3D & {
      geometry?: { dispose(): void };
      material?: unknown;
    };
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of materials as Array<
      Record<string, unknown> & { dispose(): void }
    >) {
      for (const value of Object.values(m))
        if (value && (value as Texture).isTexture)
          textures.add(value as Texture);
      m.dispose();
    }
  });
  for (const t of textures) t.dispose();
}

/**
 * Downloads and parses GLBs through a bounded, shared cache. Decoders are loaded only when a
 * manifest entry asks for them (Meshopt, Draco, KTX2), so an uncompressed asset pays for none.
 * Requests are abortable and time out; the cache deduplicates concurrent loads of one file.
 */
export class CharacterAssetLoader {
  readonly cache: AssetCache<LoadedModel>;
  private loader: Promise<GLTFLoader> | undefined;
  private readonly decoders = new Set<string>();
  private renderer: WebGLRenderer | undefined;

  constructor(
    private readonly registry: AssetRegistry = assetRegistry,
    cache?: AssetCache<LoadedModel>,
  ) {
    this.cache =
      cache ??
      new AssetCache<LoadedModel>({
        maxEntries: 64,
        maxBytes: 32 * 1024 * 1024,
        dispose: disposeModel,
      });
  }

  /** KTX2 needs the renderer to pick a GPU texture format; called by the viewer session. */
  setRenderer(renderer: WebGLRenderer): void {
    this.renderer = renderer;
  }

  private async gltfLoader(): Promise<GLTFLoader> {
    this.loader ??= import('three/addons/loaders/GLTFLoader.js').then(
      (m) => new m.GLTFLoader(),
    );
    return this.loader;
  }

  private async ensureDecoder(
    asset: ResolvedAsset,
    loader: GLTFLoader,
  ): Promise<void> {
    if (this.decoders.has(asset.compression)) return;
    if (asset.compression === 'meshopt') {
      const { MeshoptDecoder } =
        await import('three/addons/libs/meshopt_decoder.module.js');
      loader.setMeshoptDecoder(MeshoptDecoder);
    } else if (asset.compression === 'draco') {
      const { DRACOLoader } =
        await import('three/addons/loaders/DRACOLoader.js');
      const draco = new DRACOLoader();
      draco.setDecoderPath('/draco/'); // ship the decoder files here only if an asset uses Draco
      loader.setDRACOLoader(draco);
    } else if (asset.compression === 'ktx2') {
      if (!this.renderer)
        throw new AssetError(
          'TEXTURE_LOAD_FAILED',
          asset.assetId,
          'KTX2 needs a renderer',
        );
      const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
      const ktx2 = new KTX2Loader();
      ktx2.setTranscoderPath('/basis/'); // ship the Basis transcoder only if an asset uses KTX2
      ktx2.detectSupport(this.renderer);
      loader.setKTX2Loader(ktx2);
    }
    this.decoders.add(asset.compression);
  }

  /**
   * Acquire a model (taking a cache reference the caller must `release`). Throws AssetError.
   * `signal` abandons the wait early; the download itself still completes into the cache.
   */
  async acquire(assetId: string, signal?: AbortSignal): Promise<LoadedModel> {
    const resolved = this.registry.resolve(assetId);
    if (!resolved.ok)
      throw new AssetError('ASSET_NOT_FOUND', assetId, resolved.reason);
    const { asset } = resolved;
    const load = async () => {
      let bytes: ArrayBuffer;
      try {
        const response = await fetch(asset.url, {
          signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        bytes = await response.arrayBuffer();
      } catch (error) {
        throw new AssetError(
          'GLB_LOAD_FAILED',
          assetId,
          error instanceof Error ? error.message : 'fetch failed',
        );
      }
      const loader = await this.gltfLoader();
      await this.ensureDecoder(asset, loader);
      try {
        const gltf = await loader.parseAsync(
          bytes,
          asset.url.slice(0, asset.url.lastIndexOf('/') + 1),
        );
        return {
          value: { scene: gltf.scene, animations: gltf.animations, gltf },
          bytes: bytes.byteLength,
        };
      } catch (error) {
        throw new AssetError(
          'GLB_LOAD_FAILED',
          assetId,
          error instanceof Error ? error.message : 'parse failed',
        );
      }
    };
    const pending = this.cache.acquire(asset.cacheKey, load);
    if (!signal) return pending;
    return raceAbort(pending, signal, () => {
      // The caller gave up: hand the reference straight back once the load finishes.
      pending.then(
        () => this.cache.release(asset.cacheKey),
        () => undefined,
      );
    });
  }

  release(assetId: string): void {
    const resolved = this.registry.resolve(assetId);
    if (resolved.ok) this.cache.release(resolved.asset.cacheKey);
  }

  /** Warm the cache without keeping references (hover/likely-next preloads). */
  async preload(assetId: string): Promise<void> {
    try {
      await this.acquire(assetId);
      this.release(assetId);
    } catch {
      /* preloading is best effort */
    }
  }
}

function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  onAbort: () => void,
): Promise<T> {
  if (signal.aborted) {
    onAbort();
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      onAbort();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', abort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', abort);
        reject(e);
      },
    );
  });
}

/** One shared loader (and cache) for the whole app, so revisiting the viewer reuses downloads. */
export const sharedCharacterLoader = new CharacterAssetLoader();
