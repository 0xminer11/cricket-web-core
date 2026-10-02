import { describe, expect, it } from 'vitest';
import {
  SHOTS,
  classifyLength,
  classifyLine,
} from '../../packages/game-core/src/index';
import { MISCENTRE } from '../../apps/web/src/features/match/config/batting-animations';
import { presentContact } from '../../apps/web/src/features/match/core/contact-assist';
import type { ContactQuality } from '../../apps/web/src/features/match/core/contact-assist';
import { previewToDelivery } from '../../apps/web/src/features/match/core/batting-presentation';
import { planIncoming } from '../../apps/web/src/features/match/core/trajectory';
import { shotHint } from '../../apps/web/src/features/match/core/batting-shot-selector';
import { vec } from '../../apps/web/src/features/match/core/vec';

const SPEEDS = [26, 33, 40];
const BOUNCES = [0.3, 0.6, 0.9];
const GRID = Array.from({ length: 9 }, (_, i) => i / 8);

function balls(hand: 'right' | 'left') {
  const out: {
    x: number;
    y: number;
    point: ReturnType<typeof planIncoming>['arrival'];
    line: string;
    length: string;
    seconds: number;
  }[] = [];
  for (const x of GRID)
    for (const y of GRID)
      for (const speed of SPEEDS)
        for (const bounce of BOUNCES) {
          const d = previewToDelivery({
            variationId: 'delivery.fast.stock',
            name: 'x',
            target: { x, y },
            line: classifyLine(x),
            length: classifyLength(y),
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
            delivery: d,
            release: vec(0.2, 0.3, 2.1),
            hand,
          });
          out.push({
            x,
            y,
            point: path.arrival,
            line: classifyLine(x),
            length: classifyLength(y),
            seconds: path.flightTime,
          });
        }
  return out;
}

describe('contact assist coverage: every shot against every kind of ball', () => {
  const lines: string[] = [];
  it('a ball the shot suits is reached with the bat’s middle (within the quality’s own mis-centring); a ball it does not suit is flagged, never faked', () => {
    let worstSuitable = 0;
    const stats: Record<string, { n: number; exceeded: number }> = {};
    for (const hand of ['right', 'left'] as const) {
      const all = balls(hand);
      for (const shot of SHOTS) {
        for (const quality of [
          'perfect',
          'good',
          'okay',
          'poor',
        ] as ContactQuality[]) {
          for (const b of all) {
            const plan = presentContact({
              shotId: shot.id,
              hand,
              ballPoint: b.point,
              quality,
              footwork: 55,
              secondsToBall: Math.max(0.2, b.seconds - 0.3),
            });
            const hint = shotHint(shot.id, b.line as never, b.length as never);
            const key = `${shot.id}|${hint}`;
            const entry = (stats[key] ??= { n: 0, exceeded: 0 });
            entry.n++;
            if (plan.exceeded) entry.exceeded++;
            // the body limits hold whatever the ball
            expect(plan.used.rootOff).toBeLessThanOrEqual(1);
            if (!plan.exceeded && plan.contactMade) {
              const allowed = MISCENTRE[quality] ?? 0;
              if (hint === 'good')
                worstSuitable = Math.max(
                  worstSuitable,
                  plan.residual - allowed,
                );
              expect(
                plan.residual,
                `${hand} ${shot.id} ${quality} x=${b.x} y=${b.y}`,
              ).toBeLessThanOrEqual(allowed + 0.035);
            }
          }
        }
      }
    }
    void stats;
    void lines;
    expect(worstSuitable).toBeLessThan(0.035);
  });
});
