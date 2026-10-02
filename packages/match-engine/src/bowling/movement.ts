import { DELIVERIES } from '@the-cricketer/game-core';
import type {
  BattingHand,
  BowlingStyle,
  DeliveryDefinition,
} from '@the-cricketer/game-core';
import type { ResolvedDelivery } from '../state/types';

/** Which arm a bowling style uses. Spin styles are named for the ball, not the arm, so it is listed. */
export type BowlingArm = 'right' | 'left';
export const bowlingArm = (style: BowlingStyle): BowlingArm =>
  style.startsWith('left_arm') ? 'left' : 'right';

/**
 * Sideways direction of movement in BATTER-RELATIVE terms: -1 toward the off side, +1 toward the leg
 * side, 0 straight. Presentation maps this to the screen using the batter's hand, so "outswing
 * always goes left on screen" can never creep in.
 *  - Swing is relative to the batter's body: outswing leaves the batter (off side), inswing comes in
 *    (leg side), whichever arm bowls and whichever hand bats.
 *  - Spin, and a cutter's natural turn, are described for a RIGHT-hander and mirrored for a left-hander.
 *  - Seam deviation nips back toward the stumps when the ball pitches on the off side and moves away
 *    when it pitches on the leg side.
 */
export function lateralDirection(
  profile: DeliveryDefinition['movementProfile'],
  style: BowlingStyle,
  hand: BattingHand,
  pitchedX: number,
): -1 | 0 | 1 {
  const handFlip = hand === 'left' ? -1 : 1;
  const arm = bowlingArm(style);
  switch (profile) {
    case 'swing_out':
      return -1;
    case 'swing_in':
      return 1;
    case 'seam':
      return pitchedX < 0.5 ? 1 : -1;
    case 'cutter': {
      const natural = arm === 'right' ? 1 : -1;
      return natural * handFlip === 1 ? 1 : -1;
    }
    case 'off_break': {
      // right-arm off spin turns into a right-hander; left-arm orthodox turns away from one
      const natural = arm === 'right' ? 1 : -1;
      return natural * handFlip === 1 ? 1 : -1;
    }
    case 'leg_break': {
      // right-arm leg spin turns away from a right-hander; a left-arm wrist spinner turns into one
      const natural = arm === 'right' ? -1 : 1;
      return natural * handFlip === 1 ? 1 : -1;
    }
    case 'googly': {
      const natural = arm === 'right' ? 1 : -1;
      return natural * handFlip === 1 ? 1 : -1;
    }
    default:
      return 0;
  }
}

export interface SignedMovement {
  readonly swing: number;
  readonly seam: number;
  readonly spin: number;
}

/** The engine's movement magnitudes with a batter-relative sign. */
export function signedMovement(
  delivery: ResolvedDelivery,
  style: BowlingStyle,
  hand: BattingHand,
): SignedMovement {
  const definition = DELIVERIES.find(
    (d) => d.id === delivery.deliveryDefinitionId,
  )!;
  const direction = lateralDirection(
    definition.movementProfile,
    style,
    hand,
    delivery.actualTarget.x,
  );
  // `|| 0` keeps a straight ball at +0 rather than -0 (which would show up in JSON and equality checks)
  return {
    swing: delivery.swing * direction || 0,
    seam: delivery.seam * direction || 0,
    spin: delivery.spin * direction || 0,
  };
}
