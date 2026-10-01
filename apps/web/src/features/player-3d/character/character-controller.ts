import { Group } from 'three';
import type { AnimationClip, Mesh, Object3D, Skeleton } from 'three';
import { BODY_PART_MESHES } from '@the-cricketer/game-core';
import type { BodyPart } from '@the-cricketer/game-core';
import type { CharacterPlan, PlannedPart } from '../types';
import { diffParts } from './plan';
import { EquipmentAttachmentManager } from './attachment-manager';
import { BaseAssetError, AssetError } from './errors';
import type { CharacterAssetLoader } from './loader';
import { MaterialController } from './material-controller';
import { CharacterMorphController } from './morph-controller';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

interface AttachedPart {
  readonly part: PlannedPart;
  readonly holder: Object3D;
}

export interface ApplyReport {
  /** Optional pieces that could not be shown (the character still rendered). */
  readonly failedParts: readonly { key: string; code: string }[];
  readonly warnings: readonly string[];
}

/**
 * Builds and maintains the dressed character from a CharacterPlan.
 *
 * Plans are applied "latest wins": while a load is in flight, newer plans replace older ones, and
 * a stale load is never attached (rapid Bat A -> Bat B always ends on Bat B). New pieces are
 * loaded first and swapped in one step, so there is no frame without a bat. Optional pieces that
 * fail leave the character intact; only the base character is mandatory.
 */
export class CharacterController {
  /** Everything lives here: scaling this group scales skeleton, clothing and gear together. */
  readonly root = new Group();
  readonly materials: MaterialController;
  readonly morphs = new CharacterMorphController();
  readonly attachments = new EquipmentAttachmentManager();

  private baseAssetId: string | undefined;
  private baseHolder: Object3D | undefined;
  private skeleton: Skeleton | undefined;
  private clips: readonly AnimationClip[] = [];
  private bodyParts = new Map<BodyPart, Mesh[]>();
  private readonly attached = new Map<string, AttachedPart>();
  private latest: CharacterPlan | undefined;
  private running = false;
  private disposed = false;
  private waiters: Array<{
    resolve: (r: ApplyReport) => void;
    reject: (e: unknown) => void;
  }> = [];
  private lastReport: ApplyReport = { failedParts: [], warnings: [] };

  constructor(
    private readonly loader: CharacterAssetLoader,
    textureSize: number,
    private readonly onChange: () => void = () => undefined,
  ) {
    this.root.name = 'character';
    this.materials = new MaterialController(textureSize);
  }

  get animationClips(): readonly AnimationClip[] {
    return this.clips;
  }
  get ready(): boolean {
    return this.baseHolder !== undefined;
  }
  get partKeys(): string[] {
    return [...this.attached.keys()];
  }
  holderOf(key: string): Object3D | undefined {
    return this.attached.get(key)?.holder;
  }

  /** Apply a plan. Resolves with the report once THIS plan (or a newer one) has been applied. */
  apply(plan: CharacterPlan): Promise<ApplyReport> {
    if (this.disposed) return Promise.resolve(this.lastReport);
    this.latest = plan;
    const done = new Promise<ApplyReport>((resolve, reject) =>
      this.waiters.push({ resolve, reject }),
    );
    if (!this.running) void this.drain();
    return done;
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      let applied: CharacterPlan | undefined;
      while (this.latest && this.latest !== applied && !this.disposed) {
        const plan = this.latest;
        applied = plan;
        this.lastReport = await this.run(plan);
      }
      const waiters = this.waiters;
      this.waiters = [];
      for (const w of waiters) w.resolve(this.lastReport);
    } catch (error) {
      const waiters = this.waiters;
      this.waiters = [];
      for (const w of waiters) w.reject(error);
    } finally {
      this.running = false;
    }
  }

  private async run(plan: CharacterPlan): Promise<ApplyReport> {
    if (!this.baseHolder || this.baseAssetId !== plan.baseAssetId)
      await this.loadBase(plan);
    if (this.disposed) return this.lastReport;
    this.applyLook(plan);

    const current = [...this.attached.values()].map((a) => a.part);
    const { add, remove } = diffParts(current, plan.parts);
    const failed: { key: string; code: string }[] = [];

    // Load everything new first; nothing visible changes until all loads have settled.
    const loaded = await Promise.all(
      add.map(async (part) => {
        try {
          const model = await this.loader.acquire(part.assetId);
          return {
            part,
            model: model as Awaited<
              ReturnType<CharacterAssetLoader['acquire']>
            > | null,
          };
        } catch (error) {
          failed.push({
            key: part.key,
            code: error instanceof AssetError ? error.code : 'GLB_LOAD_FAILED',
          });
          return { part, model: null };
        }
      }),
    );

    // A newer plan arrived (or the viewer closed) while loading: drop these results.
    if (this.disposed || this.latest !== plan) {
      for (const l of loaded) if (l.model) this.loader.release(l.part.assetId);
      return this.lastReport;
    }

    for (const old of remove) this.detach(old.key);
    for (const { part, model } of loaded) {
      if (!model) continue;
      try {
        const holder = this.attachments.attach(part, model.scene, this.root);
        this.materials.preparePart(
          holder,
          part,
          plan.hairColor,
          plan.jerseyNumber,
        );
        this.morphs.register(holder);
        this.attached.set(part.key, { part, holder });
      } catch (error) {
        this.loader.release(part.assetId);
        failed.push({
          key: part.key,
          code:
            error instanceof AssetError
              ? error.code
              : 'INVALID_CHARACTER_SKELETON',
        });
      }
    }
    this.syncBodyPartVisibility(plan);
    this.onChange();
    return { failedParts: failed, warnings: plan.warnings };
  }

  private async loadBase(plan: CharacterPlan): Promise<void> {
    let model;
    try {
      model = await this.loader.acquire(plan.baseAssetId);
    } catch (error) {
      throw new BaseAssetError(
        error instanceof AssetError ? error.code : 'GLB_LOAD_FAILED',
        plan.baseAssetId,
        error instanceof Error ? error.message : undefined,
      );
    }
    if (this.disposed) {
      this.loader.release(plan.baseAssetId);
      return;
    }
    // A fresh node tree (and skeleton) per viewer; geometry stays shared with the cache.
    const instance = cloneSkinned(model.scene);
    this.teardownBase();
    this.skeleton = this.attachments.bindBase(instance, plan.baseAssetId);
    this.materials.prepareBody(instance);
    this.morphs.register(instance);
    this.bodyParts.clear();
    instance.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      for (const [part, names] of Object.entries(BODY_PART_MESHES) as [
        BodyPart,
        readonly string[],
      ][])
        if (names.includes(node.name))
          this.bodyParts.set(part, [...(this.bodyParts.get(part) ?? []), mesh]);
    });
    this.clips = model.animations;
    this.baseHolder = instance;
    this.baseAssetId = plan.baseAssetId;
    this.root.add(instance);
  }

  /** Cheap, synchronous parts of a plan: colours, morphs, height. */
  private applyLook(plan: CharacterPlan): void {
    this.materials.setSkinColor(plan.skinColor);
    this.morphs.set(plan.morphWeights);
    // Uniform scale of the whole group about the feet: skeleton, clothing and gear follow.
    this.root.scale.setScalar(plan.heightScale);
  }

  private syncBodyPartVisibility(plan: CharacterPlan): void {
    const hidden = new Set(plan.hiddenBodyParts);
    for (const [part, meshes] of this.bodyParts)
      for (const mesh of meshes) mesh.visible = !hidden.has(part);
  }

  private detach(key: string): void {
    const entry = this.attached.get(key);
    if (!entry) return;
    this.morphs.unregister(entry.holder);
    entry.holder.removeFromParent();
    this.materials.disposePart(entry.holder);
    this.loader.release(entry.part.assetId);
    this.attached.delete(key);
  }

  private teardownBase(): void {
    if (!this.baseHolder) return;
    for (const key of [...this.attached.keys()]) this.detach(key);
    this.morphs.unregister(this.baseHolder);
    this.baseHolder.removeFromParent();
    this.materials.disposePart(this.baseHolder);
    if (this.baseAssetId) this.loader.release(this.baseAssetId);
    this.baseHolder = undefined;
  }

  /** The base skeleton root, for AnimationMixer binding. */
  get animationRoot(): Object3D | undefined {
    return this.baseHolder;
  }
  get baseSkeleton(): Skeleton | undefined {
    return this.skeleton;
  }

  dispose(): void {
    this.disposed = true;
    this.latest = undefined;
    this.teardownBase();
    this.materials.dispose();
    this.attachments.dispose();
    this.root.removeFromParent();
    for (const w of this.waiters) w.resolve(this.lastReport);
    this.waiters = [];
  }
}
