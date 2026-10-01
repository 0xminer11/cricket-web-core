import type { Mesh, Object3D } from 'three';
import { BASE_MORPH_TARGETS } from '@the-cricketer/game-core';
import type { MorphTarget } from '@the-cricketer/game-core';

/**
 * Drives the morph targets that actually exist in the base asset (build and face shape). Body and
 * clothing meshes declare the same target names, so one weight set reshapes the body and its
 * clothes together. Only names in BASE_MORPH_TARGETS are ever driven; nothing else is exposed.
 */
export class CharacterMorphController {
  private readonly meshes = new Set<Mesh>();
  private weights: Partial<Record<MorphTarget, number>> = {};

  register(root: Object3D): void {
    root.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary) {
        this.meshes.add(mesh);
        this.applyTo(mesh);
      }
    });
  }

  unregister(root: Object3D): void {
    root.traverse((node) => this.meshes.delete(node as Mesh));
  }

  set(weights: Readonly<Record<MorphTarget, number>>): void {
    this.weights = weights;
    for (const mesh of this.meshes) this.applyTo(mesh);
  }

  private applyTo(mesh: Mesh): void {
    const dict = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    if (!dict || !influences) return;
    for (const name of BASE_MORPH_TARGETS) {
      const index = dict[name];
      if (index !== undefined) influences[index] = this.weights[name] ?? 0;
    }
  }

  get count(): number {
    return this.meshes.size;
  }
}
