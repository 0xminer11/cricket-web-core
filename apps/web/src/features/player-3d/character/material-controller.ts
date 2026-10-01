import { Color } from 'three';
import type {
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
} from 'three';
import type { KitStyle } from '@the-cricketer/game-core';
import type { PlannedPart } from '../types';
import { createJerseyTexture } from './jersey-texture';

type ColorSlot = 'primary' | 'secondary' | 'accent' | 'grip';

/**
 * Material name -> the colour slot it takes. Artists name materials; configuration (not code in
 * components) decides what each name means, so new assets only need to follow the naming.
 */
export const MATERIAL_ROLES: Readonly<Record<string, ColorSlot>> = {
  Jersey_Body: 'primary',
  Jersey_Sleeve: 'primary',
  Jersey_Collar: 'accent',
  Pants: 'primary',
  Helmet_Shell: 'primary',
  Helmet_Grille: 'secondary',
  Bat_Grip: 'grip',
};

/**
 * Owns every material and dynamic texture the viewer creates. Materials from cached files are
 * CLONED per use, so changing a colour never leaks into the cache (or another character), and
 * everything created here is disposed together.
 */
export class MaterialController {
  private readonly owned = new Set<Material>();
  private readonly textures = new Map<string, Texture>();
  private skinMaterials: MeshStandardMaterial[] = [];
  private skinColor = '#b9805a';

  constructor(private readonly textureSize: number) {}

  private own<T extends Material>(material: T): T {
    this.owned.add(material);
    return material;
  }

  /** Give a mesh its own clones of the file's materials and return them. */
  private cloneMaterials(mesh: Mesh): MeshStandardMaterial[] {
    const originals = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const clones = originals.map((m) =>
      this.own(m.clone() as MeshStandardMaterial),
    );
    mesh.material = Array.isArray(mesh.material)
      ? clones
      : (clones[0] as MeshStandardMaterial);
    return clones;
  }

  /** Base body: every body mesh shares the same skin colour (no face/body mismatch). */
  prepareBody(root: Object3D): void {
    const shared = new Map<string, MeshStandardMaterial>();
    root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      const original = (
        Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      ) as MeshStandardMaterial;
      let clone = shared.get(original.name);
      if (!clone) {
        clone = this.own(original.clone());
        shared.set(original.name, clone);
        if (original.name === 'Skin') this.skinMaterials.push(clone);
      }
      mesh.material = clone;
    });
    this.setSkinColor(this.skinColor);
  }

  setSkinColor(hex: string): void {
    this.skinColor = hex;
    for (const m of this.skinMaterials) m.color.set(new Color(hex));
  }

  /** Prepare a freshly attached part: clone materials, apply palette colours, jersey texture. */
  preparePart(
    holder: Object3D,
    part: PlannedPart,
    hairColor: string,
    jerseyNumber: number | null,
  ): void {
    holder.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      for (const material of this.cloneMaterials(mesh)) {
        if (part.role === 'hair' || part.role === 'beard') {
          material.color.set(hairColor);
          continue;
        }
        const slot = MATERIAL_ROLES[material.name];
        const color = slot ? part.colors[slot] : undefined;
        if (color) material.color.set(color);
        if (material.name === 'Jersey_Body' && part.kit)
          this.applyJerseyTexture(material, part.kit, jerseyNumber);
      }
    });
  }

  private applyJerseyTexture(
    material: MeshStandardMaterial,
    style: KitStyle,
    number: number | null,
  ): void {
    const key = [
      style.primary,
      style.secondary,
      style.accent,
      style.pattern,
      style.number ? number : '-',
    ].join('|');
    let texture = this.textures.get(key);
    if (!texture) {
      texture = createJerseyTexture(style, number, this.textureSize);
      this.textures.set(key, texture);
    }
    material.map = texture;
    material.color.set('#ffffff'); // the texture carries the colour
    material.needsUpdate = true;
  }

  /** Recolour a single named slot on an attached object (e.g. a bat's grip) without new geometry. */
  setSlotColor(object: Object3D, slot: ColorSlot, hex: string): void {
    object.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const m of list as MeshStandardMaterial[])
        if (MATERIAL_ROLES[m.name] === slot) m.color.set(hex);
    });
  }

  /** Release materials created for one part (its textures are shared and disposed with the controller). */
  disposePart(holder: Object3D): void {
    holder.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const m of list) {
        if (this.owned.delete(m)) m.dispose();
      }
    });
  }

  dispose(): void {
    for (const m of this.owned) m.dispose();
    this.owned.clear();
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    this.skinMaterials = [];
  }

  stats() {
    return { materials: this.owned.size, textures: this.textures.size };
  }
}
