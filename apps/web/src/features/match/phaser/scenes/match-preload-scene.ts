import * as Phaser from 'phaser';
import type { MatchAssetRegistry } from '../../core/assets';
import type { SceneEvent } from '../../core/scene-port';

/**
 * Preload only what a match needs. Today every asset is a procedural placeholder (nothing to
 * fetch); when real files are added to the registry they load here, and any that fail are marked
 * failed so the scene keeps its placeholder instead of crashing.
 */
export class MatchPreloadScene extends Phaser.Scene {
  private label!: Phaser.GameObjects.Text;
  constructor(
    private readonly assets: MatchAssetRegistry,
    private readonly emit: (e: SceneEvent) => void,
  ) {
    super('MatchPreloadScene');
  }
  preload(): void {
    this.label = this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Loading match…', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#cfe3f7',
      })
      .setOrigin(0.5);
    for (const entry of this.assets.loadable)
      if (entry.url) this.load.image(entry.id, entry.url);
    this.load.on('loaderror', (file: { key: string }) => {
      const warning = this.assets.markFailed(file.key, 'failed_to_load');
      this.emit({
        type: 'ASSET_WARNING',
        message: `${warning.assetId} failed to load; using ${warning.fallback}`,
      });
    });
    for (const warning of this.assets.warnings)
      this.emit({
        type: 'ASSET_WARNING',
        message: `${warning.assetId} unavailable (${warning.reason}); using ${warning.fallback}`,
      });
  }
  create(): void {
    this.label.destroy();
    this.scene.start('MatchScene');
    this.scene.launch('MatchUIScene');
  }
}
