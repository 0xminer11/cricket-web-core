import { Euler, Group } from 'three';
import type { Bone, Mesh, Object3D, Skeleton, SkinnedMesh } from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CANONICAL_SKELETON_MAP } from '@the-cricketer/game-core';
import type {
  CharacterSkeletonMap,
  LogicalBone,
} from '@the-cricketer/game-core';
import type { PlannedPart } from '../types';
import { AssetError } from './errors';

/**
 * Puts loaded pieces onto the base character, driven entirely by the plan:
 *  - skinned clothing (jersey, pants, shoes, gloves, pads) is REBOUND to the base skeleton, so it
 *    deforms with every animation exactly like the body;
 *  - rigid gear (bat, helmet) and head pieces (hair, beard) become children of one bone with the
 *    configured offset. No offsets are written in components.
 */
export class EquipmentAttachmentManager {
  private bones = new Map<LogicalBone, Bone>();
  private skeleton: Skeleton | undefined;

  constructor(
    private readonly skeletonMap: CharacterSkeletonMap = CANONICAL_SKELETON_MAP,
  ) {}

  /** Index the base character's skeleton by logical bone. Throws INVALID_CHARACTER_SKELETON. */
  bindBase(baseRoot: Object3D, assetId: string): Skeleton {
    let skeleton: Skeleton | undefined;
    baseRoot.traverse((node) => {
      const mesh = node as SkinnedMesh;
      if (!skeleton && mesh.isSkinnedMesh) skeleton = mesh.skeleton;
    });
    if (!skeleton)
      throw new AssetError(
        'INVALID_CHARACTER_SKELETON',
        assetId,
        'no skinned mesh',
      );
    const byName = new Map(skeleton.bones.map((b) => [b.name, b]));
    this.bones.clear();
    for (const [logical, name] of Object.entries(this.skeletonMap) as [
      LogicalBone,
      string,
    ][]) {
      const bone = byName.get(name);
      if (!bone)
        throw new AssetError(
          'INVALID_CHARACTER_SKELETON',
          assetId,
          `required ${logical} bone not found (expected ${name})`,
        );
      this.bones.set(logical, bone);
    }
    this.skeleton = skeleton;
    return skeleton;
  }

  getBone(logical: string): Bone | undefined {
    return this.bones.get(logical as LogicalBone);
  }

  /**
   * Create the object for a part from a cached model scene and attach it. Returns the holder
   * (remove it from its parent to detach) and the meshes it contributes.
   */
  attach(
    part: PlannedPart,
    modelScene: Object3D,
    characterRoot: Object3D,
  ): Group {
    if (!this.skeleton)
      throw new AssetError(
        'INVALID_CHARACTER_SKELETON',
        part.assetId,
        'base not bound',
      );
    const holder = new Group();
    holder.name = `part:${part.key}`;
    // Cloning shares geometry with the cache (never disposed per instance) and gives us our own
    // node tree; skinned meshes are cloned with throwaway bones that we immediately replace.
    const copy = cloneSkinned(modelScene);

    if (part.mode === 'skinned') {
      const meshes: SkinnedMesh[] = [];
      copy.traverse((node) => {
        if ((node as SkinnedMesh).isSkinnedMesh)
          meshes.push(node as SkinnedMesh);
      });
      if (meshes.length === 0)
        throw new AssetError(
          'INVALID_CHARACTER_SKELETON',
          part.assetId,
          'clothing has no skinned mesh',
        );
      for (const mesh of meshes) {
        mesh.removeFromParent();
        mesh.bind(this.skeleton, mesh.bindMatrix);
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        holder.add(mesh);
      }
      characterRoot.add(holder);
      return holder;
    }

    // rigid: strip any stray skeleton nodes and keep only the meshes
    const rigid = new Group();
    copy.traverse((node) => {
      if ((node as Mesh).isMesh) {
        const mesh = node as Mesh;
        mesh.castShadow = true;
        rigid.add(mesh.clone());
      }
    });
    holder.add(rigid);

    if (part.mode === 'head') {
      this.mount(holder, 'head', part.assetId);
      return holder;
    }
    const att = part.attachment;
    if (!att)
      throw new AssetError(
        'MISSING_ATTACHMENT_BONE',
        part.assetId,
        'attached part has no attachment definition',
      );
    holder.position.set(...att.position);
    holder.rotation.copy(new Euler(...att.rotation));
    holder.scale.setScalar(att.scale);
    this.mount(holder, att.bone, part.assetId);
    return holder;
  }

  private mount(holder: Object3D, boneName: string, assetId: string): void {
    const bone = this.getBone(boneName);
    if (!bone)
      throw new AssetError('MISSING_ATTACHMENT_BONE', assetId, boneName);
    bone.add(holder);
  }

  dispose(): void {
    this.bones.clear();
    this.skeleton = undefined;
  }
}
