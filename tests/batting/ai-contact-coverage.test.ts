import { describe, expect, it } from 'vitest';
import {
  aiBowlerIntent,
  createMatchEngine,
  createTestMatch,
  humanShotIntent,
} from '../../packages/match-engine/src/index';
import { CONTACT_ASSIST } from '../../apps/web/src/features/match/config/batting-animations';
import { presentContact } from '../../apps/web/src/features/match/core/contact-assist';
import { previewToDelivery } from '../../apps/web/src/features/match/core/batting-presentation';
import { planIncoming } from '../../apps/web/src/features/match/core/trajectory';
import {
  BATTING_ACTIONS,
  selectShot,
} from '../../apps/web/src/features/match/core/batting-shot-selector';
import { vec } from '../../apps/web/src/features/match/core/vec';

type Quality = 'perfect' | 'good' | 'okay' | 'poor' | 'edge' | 'miss';

/**
 * The real question for the contact presentation: for the balls the AI bowler actually bowls, played with the
 * shots a player actually picks, whenever the ENGINE says the bat met the ball, does the bat visibly meet it?
 */
describe('contact presentation against the real engine and the real AI bowler', () => {
  const cases: {
    shotId: string;
    point: ReturnType<typeof planIncoming>['arrival'];
    quality: Quality;
    seconds: number;
  }[] = [];
  for (const style of [
    'right_arm_fast',
    'right_arm_medium',
    'off_spin',
    'leg_spin',
    'left_arm_fast',
  ] as const)
    for (const pitch of ['pitch.green', 'pitch.hard', 'pitch.dry'] as const)
      for (let n = 0; n < 12; n++) {
        const input = createTestMatch({
          matchId: 'x',
          formatId: 'format.5_over',
          pitchId: pitch,
          rngSeed: `cov-${style}-${n}`,
        });
        const bowler = input.teamB.players[5]!;
        bowler.bowlingStyle = style;
        const probe = createMatchEngine();
        probe.startMatch(JSON.parse(JSON.stringify(input)), {
          winnerTeamId: input.teamA.teamId,
          decision: 'bat',
        });
        probe.selectBowler(bowler.playerId);
        const intent = aiBowlerIntent(input.rngSeed, bowler, 1);
        const d = probe.previewDelivery(1, intent);
        const delivery = previewToDelivery({
          variationId: d.deliveryDefinitionId,
          name: 'x',
          target: d.actualTarget,
          line: d.actualLine,
          length: d.actualLength,
          lineLabel: '',
          lengthLabel: '',
          speedMs: d.speed,
          speedKmh: d.speed * 3.6,
          movement: { swing: 0, seam: 0, spin: 0 },
          bounce: d.bounce,
          bowlingArm: 'right',
          battingHand: 'right',
        });
        const path = planIncoming({
          delivery,
          release: vec(0.2, 0.3, 2.1),
          hand: 'right',
        });
        for (const action of BATTING_ACTIONS)
          for (const timing of [-0.3, -0.1, 0, 0.1, 0.3]) {
            const shot = selectShot({
              action,
              direction: 0,
              line: d.actualLine,
              length: d.actualLength,
            });
            const engine = createMatchEngine();
            engine.startMatch(JSON.parse(JSON.stringify(input)), {
              winnerTeamId: input.teamA.teamId,
              decision: 'bat',
            });
            engine.selectBowler(bowler.playerId);
            const ball = engine.resolveBall({
              actionId: `a-${action}-${timing}`,
              expectedSequence: 1,
              deliveryIntent: intent,
              battingIntent: humanShotIntent(
                { shotId: shot.shotId, direction: 0, timing, assist: 'off' },
                input.teamA.players[0]!,
                { speed: d.speed },
              ),
            });
            cases.push({
              shotId: shot.shotId,
              point: path.arrival,
              quality: ball.shot.contactQuality as Quality,
              seconds: Math.max(0.2, path.flightTime - 0.3),
            });
          }
      }

  const plans = (qualities: Quality[]) =>
    cases
      .filter((c) => qualities.includes(c.quality))
      .map((c) =>
        presentContact({
          shotId: c.shotId,
          hand: 'right',
          ballPoint: c.point,
          quality: c.quality,
          footwork: 55,
          secondsToBall: c.seconds,
        }),
      );
  const percentile = (values: number[], q: number) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length * q)]!;

  it('has plenty of every kind of contact to look at', () => {
    expect(cases.length).toBeGreaterThan(3000);
    expect(plans(['good', 'perfect']).length).toBeGreaterThan(300);
    expect(plans(['okay', 'poor']).length).toBeGreaterThan(1000);
  });

  it('a good contact meets the middle of the bat almost always, without the ball being moved', () => {
    const good = plans(['perfect', 'good']);
    const exceeded = good.filter((p) => p.exceeded).length / good.length;
    expect(exceeded).toBeLessThan(0.06);
    expect(
      percentile(
        good.map((p) => p.residual),
        0.9,
      ),
    ).toBeLessThan(0.02);
    expect(
      percentile(
        good.map((p) => p.ballShift),
        0.75,
      ),
    ).toBeLessThan(CONTACT_ASSIST.maxBallShift);
  });

  it('a lesser contact still meets the bat for nearly every ball, and the rest is flagged, never faked', () => {
    const lesser = plans(['okay', 'poor']);
    expect(
      percentile(
        lesser.map((p) => p.residual),
        0.85,
      ),
    ).toBeLessThan(0.1);
    for (const p of lesser) {
      expect(p.ballShift).toBeLessThanOrEqual(
        CONTACT_ASSIST.maxBallShiftReach + 1e-9,
      );
      if (p.residual > 0.02) expect(p.exceeded).toBe(true);
    }
  });
});
