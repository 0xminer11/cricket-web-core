import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
} from 'three';
import type { Material, Texture } from 'three';
import type { QualityProfile } from '@the-cricketer/game-core';

/**
 * A lightweight dressing-room set: a floor disc, a back wall with simple lockers and benches, a
 * key + fill + rim light rig and a soft contact shadow under the feet. It is built from a handful
 * of primitives (no environment map download, no post-processing) and every geometry/material
 * it creates is disposed with it. Real dressing-room art can replace `buildRoom` later.
 */
export class StudioScene {
  readonly scene = new Scene();
  readonly keyLight: DirectionalLight;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(profile: QualityProfile) {
    this.scene.background = new Color('#0f1a21');
    this.scene.fog = new Fog('#0f1a21', 9, 22);

    this.scene.add(new HemisphereLight('#cfe8ff', '#2a3b46', 0.85));
    this.scene.add(new AmbientLight('#ffffff', 0.18));

    this.keyLight = new DirectionalLight('#fff4e0', 2.4);
    this.keyLight.position.set(2.6, 4.2, 3.4);
    this.keyLight.target.position.set(0, 0.9, 0);
    this.scene.add(this.keyLight, this.keyLight.target);
    if (profile.shadows && profile.shadowMapSize > 0) {
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.set(
        profile.shadowMapSize,
        profile.shadowMapSize,
      );
      this.keyLight.shadow.camera.near = 1;
      this.keyLight.shadow.camera.far = 12;
      this.keyLight.shadow.camera.left = -2;
      this.keyLight.shadow.camera.right = 2;
      this.keyLight.shadow.camera.top = 3;
      this.keyLight.shadow.camera.bottom = -1;
      this.keyLight.shadow.bias = -0.0004;
      this.keyLight.shadow.radius = 4;
    }
    const fill = new DirectionalLight('#9fc4ff', 0.75);
    fill.position.set(-3.2, 1.8, 2.2);
    const rim = new DirectionalLight('#7ee0ff', 1.3);
    rim.position.set(-1.5, 3, -3.6);
    this.scene.add(fill, rim);

    this.scene.add(this.buildFloor(profile), this.buildRoom());
    this.scene.add(this.contactShadow());
  }

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private buildFloor(profile: QualityProfile): Mesh {
    const floor = new Mesh(
      this.track(new CircleGeometry(7, 64)),
      this.track(
        new MeshStandardMaterial({
          color: '#22323d',
          roughness: 0.85,
          metalness: 0,
        }),
      ),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = profile.shadows;
    return floor;
  }

  private buildRoom(): Group {
    const room = new Group();
    const wallMat = this.track(
      new MeshStandardMaterial({ color: '#18262f', roughness: 0.95 }),
    );
    const wall = new Mesh(this.track(new PlaneGeometry(18, 7)), wallMat);
    wall.position.set(0, 3.5, -5.2);
    room.add(wall);
    const locker = this.track(new BoxGeometry(0.8, 2.1, 0.5));
    const colors = [
      '#27526a',
      '#1f6f8b',
      '#2d4a5a',
      '#27526a',
      '#35607a',
      '#1f6f8b',
      '#2d4a5a',
    ];
    const mats: Material[] = colors.map((c) =>
      this.track(
        new MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2 }),
      ),
    );
    colors.forEach((_, i) => {
      const m = new Mesh(locker, mats[i] as Material);
      m.position.set(-3.3 + i * 1.1, 1.05, -4.9);
      room.add(m);
    });
    const bench = new Mesh(
      this.track(new BoxGeometry(5, 0.12, 0.45)),
      this.track(
        new MeshStandardMaterial({ color: '#4a3b2a', roughness: 0.8 }),
      ),
    );
    bench.position.set(0, 0.45, -3.6);
    const legs = this.track(new BoxGeometry(0.08, 0.45, 0.35));
    const legMat = this.track(new MeshStandardMaterial({ color: '#2a2a2a' }));
    for (const x of [-2.3, 2.3]) {
      const leg = new Mesh(legs, legMat);
      leg.position.set(x, 0.22, -3.6);
      room.add(leg);
    }
    room.add(bench);
    return room;
  }

  /** Soft blob under the feet so the character looks grounded without an expensive shadow map. */
  private contactShadow(): Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    const texture: Texture = this.track(new CanvasTexture(canvas));
    texture.colorSpace = SRGBColorSpace;
    const blob = new Mesh(
      this.track(new PlaneGeometry(1.5, 1.5)),
      this.track(
        new MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.004;
    return blob;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.scene.clear();
  }
}
