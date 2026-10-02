import { describe, expect, it } from 'vitest';
import {
  SHOTS,
  classifyLength,
  classifyLine,
} from '../../packages/game-core/src/index';
import { presentContact } from '../../apps/web/src/features/match/core/contact-assist';
import { previewToDelivery } from '../../apps/web/src/features/match/core/batting-presentation';
import { planIncoming } from '../../apps/web/src/features/match/core/trajectory';
import { shotHint } from '../../apps/web/src/features/match/core/batting-shot-selector';
import { vec } from '../../apps/web/src/features/match/core/vec';

/**
 * Contact quality report (brief section 259): for each animation, how far the bat is from the ball at the contact
 * frame for a forced PERFECT contact, over the balls that shot suits, before the ball is nudged. Small and believable
 * is the goal; there is deliberately no universal numeric target before real assets are measured.
 */
export function contactQualityReport(hand: 'right' | 'left') {
  const rows: {
    shotId: string;
    balls: number;
    averageGapCm: number;
    p90GapCm: number;
    exceededPercent: number;
  }[] = [];
  for (const shot of SHOTS) {
    const gaps: number[] = [];
    let exceeded = 0;
    for (const x of Array.from({ length: 9 }, (_, i) => i / 8))
      for (const y of Array.from({ length: 9 }, (_, i) => i / 8))
        for (const speed of [26, 33, 40])
          for (const bounce of [0.3, 0.6, 0.9]) {
            const line = classifyLine(x);
            const length = classifyLength(y);
            if (shotHint(shot.id, line, length) !== 'good') continue;
            const delivery = previewToDelivery({
              variationId: 'delivery.fast.stock',
              name: 'x',
              target: { x, y },
              line,
              length,
              lineLabel: '',
              lengthLabel: '',
              speedMs: speed,
              speedKmh: speed * 3.6,
              movement: { swing: 0, seam: 0, spin: 0 },
              bounce,
              bowlingArm: 'right',
              battingHand: hand,
            });
            const path = planIncoming({
              delivery,
              release: vec(0.2, 0.3, 2.1),
              hand,
            });
            const plan = presentContact({
              shotId: shot.id,
              hand,
              ballPoint: path.arrival,
              quality: 'perfect',
              footwork: 55,
              secondsToBall: Math.max(0.2, path.flightTime - 0.3),
            });
            gaps.push(plan.ballShift + plan.residual);
            if (plan.exceeded) exceeded++;
          }
    gaps.sort((a, b) => a - b);
    rows.push({
      shotId: shot.id,
      balls: gaps.length,
      averageGapCm:
        Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 1000) / 10,
      p90GapCm: Math.round(gaps[Math.floor(gaps.length * 0.9)]! * 1000) / 10,
      exceededPercent: Math.round((exceeded / gaps.length) * 1000) / 10,
    });
  }
  return rows;
}

describe('contact quality report: forced Perfect contact, per animation', () => {
  it('is small and believable for every shot, and identical for a left-hander', () => {
    const right = contactQualityReport('right');
    const left = contactQualityReport('left');
    expect(left).toEqual(right);
    for (const row of right) {
      expect(row.balls, row.shotId).toBeGreaterThan(15);
      // the report covers the WIDEST balls each shot's class admits, so the bound is loose; see docs/batting/contact-assist.md
      expect(row.averageGapCm, row.shotId).toBeLessThan(25);
    }
  });
});
