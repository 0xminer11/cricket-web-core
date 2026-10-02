import * as Phaser from 'phaser';
import type { ResultBanner } from '../../core/visual-events';

const TONE_COLOR: Record<ResultBanner['tone'], string> = {
  dot: '#d7dde5',
  run: '#ffffff',
  boundary: '#7dff9a',
  six: '#ffd54a',
  wicket: '#ff6b6b',
  extra: '#ffb86b',
};

/**
 * Screen-space overlay: the big result flash. The persistent, screen-reader-friendly result lives in
 * the page's DOM (HUD and live region) so the outcome is never conveyed only by this animation.
 */
export class MatchUIScene extends Phaser.Scene {
  private flash!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  constructor(private readonly reducedMotion: boolean) {
    super('MatchUIScene');
  }
  create(): void {
    this.flash = this.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontStyle: '900',
        fontSize: '56px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.sub = this.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
        align: 'center',
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.game.events.on('match:result', this.show, this);
    this.game.events.on('match:clear', this.clear, this);
    this.events.once('shutdown', () => {
      this.game.events.off('match:result', this.show, this);
      this.game.events.off('match:clear', this.clear, this);
    });
  }
  private show(banner: ResultBanner): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const size = Math.max(28, Math.min(72, w / 12));
    this.flash
      .setText(banner.headline)
      .setColor(TONE_COLOR[banner.tone])
      .setFontSize(size)
      .setPosition(w / 2, h * 0.3)
      .setAlpha(1)
      .setScale(1)
      .setVisible(true);
    this.sub
      .setText(banner.detail)
      .setFontSize(Math.max(13, Math.min(20, w / 50)))
      .setWordWrapWidth(Math.min(620, w - 40))
      .setPosition(w / 2, h * 0.3 + size * 0.7)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.killTweensOf([this.flash, this.sub]);
    if (this.reducedMotion) {
      this.tweens.add({
        targets: [this.flash, this.sub],
        alpha: 0,
        delay: 900,
        duration: 1,
        onComplete: () => this.clear(),
      });
      return;
    }
    this.flash.setScale(0.6);
    this.tweens.add({
      targets: this.flash,
      scale: 1,
      duration: 180,
      ease: 'Back.Out',
    });
    this.tweens.add({
      targets: [this.flash, this.sub],
      alpha: 0,
      delay: 1100,
      duration: 300,
      onComplete: () => this.clear(),
    });
  }
  private clear(): void {
    this.flash?.setVisible(false);
    this.sub?.setVisible(false);
  }
}
