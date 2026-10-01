import { AnimationMixer, LoopRepeat } from 'three';
import type { AnimationAction, AnimationClip, Object3D } from 'three';
import { ANIMATION_CLIP_MAP } from '@the-cricketer/game-core';
import type { LogicalAnimation } from '@the-cricketer/game-core';
import type { BattingHand } from '../types';

/**
 * Viewer animation layer (idle, idle with bat, batting stance) on a Three.js AnimationMixer.
 * Callers speak LOGICAL animation names; supplied clip names are mapped in ANIMATION_CLIP_MAP, and
 * left-handed batters automatically get the mirrored clip. Transitions crossfade. This is a
 * presentation controller only: it deliberately knows nothing about shots or match state, so a
 * gameplay animation state machine can later drive the same skeleton without conflict.
 */
export class CharacterAnimationController {
  private mixer: AnimationMixer | undefined;
  private current:
    | { logical: LogicalAnimation; hand: BattingHand; action: AnimationAction }
    | undefined;
  private reduced = false;

  constructor(
    private readonly clips: () => readonly AnimationClip[],
    private readonly root: () => Object3D | undefined,
  ) {}

  /** Static pose instead of motion (prefers-reduced-motion). */
  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    if (this.mixer) this.mixer.timeScale = reduced ? 0 : 1;
  }

  /** True while something is moving and the render loop must keep running. */
  get animating(): boolean {
    return !!this.current && !this.reduced;
  }

  play(logical: LogicalAnimation, hand: BattingHand, fade = 0.35): boolean {
    if (this.current?.logical === logical && this.current.hand === hand)
      return true;
    const root = this.root();
    if (!root) return false;
    const name = ANIMATION_CLIP_MAP[logical][hand];
    const clip =
      this.clips().find((c) => c.name === name) ??
      this.clips().find((c) => c.name === ANIMATION_CLIP_MAP.idle.right);
    if (!clip) return false;
    this.mixer ??= new AnimationMixer(root);
    this.mixer.timeScale = this.reduced ? 0 : 1;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(LoopRepeat, Infinity);
    action.play();
    const previous = this.current?.action;
    if (previous && previous !== action) {
      action.crossFadeFrom(previous, fade, false);
    }
    this.current = { logical, hand, action };
    // Prime the pose once so a paused (reduced-motion) character is not left in the T-pose.
    this.mixer.update(this.reduced ? 0.5 : 0);
    return true;
  }

  update(deltaSeconds: number): void {
    this.mixer?.update(deltaSeconds);
  }

  dispose(): void {
    const root = this.root();
    this.mixer?.stopAllAction();
    if (root) this.mixer?.uncacheRoot(root);
    this.mixer = undefined;
    this.current = undefined;
  }
}
