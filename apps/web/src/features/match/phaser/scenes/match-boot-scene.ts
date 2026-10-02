import * as Phaser from 'phaser';

/** Boot: configure the canvas for this device, then hand over to preload. */
export class MatchBootScene extends Phaser.Scene {
  constructor() {
    super('MatchBootScene');
  }
  create(): void {
    this.cameras.main.setBackgroundColor(0x0b1622);
    this.scene.start('MatchPreloadScene');
  }
}
