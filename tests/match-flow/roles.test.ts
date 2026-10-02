import { expect, it } from 'vitest';
import { describeDb } from '../support/db';
import { buildAuthApp } from '../support/auth';
import type { App } from '../support/auth';
import {
  arrangeToss,
  completeToss,
  flowOf,
  startCareerMatch,
  stateOf,
} from '../support/match-flow';

type Ctx = Parameters<Parameters<typeof describeDb>[1]>[0];

async function app<T>(ctx: Ctx, run: (app: App) => Promise<T>): Promise<T> {
  const { app } = await buildAuthApp(ctx());
  try {
    return await run(app);
  } finally {
    await app.close();
  }
}

/** Where each kind of Cricketer bats (2-over format) and whether they are ever offered the ball. */
const ROLES = [
  { role: 'opening_batter', style: null, position: 1, bowls: false },
  { role: 'finisher', style: null, position: 4, bowls: false },
  { role: 'wicketkeeper_batter', style: null, position: 3, bowls: false },
  {
    role: 'batting_all_rounder',
    style: 'right_arm_medium',
    position: 4,
    bowls: true,
  },
  {
    role: 'bowling_all_rounder',
    style: 'off_spin',
    position: 5,
    bowls: true,
  },
  { role: 'fast_bowler', style: 'right_arm_fast', position: 5, bowls: true },
  { role: 'spin_bowler', style: 'off_spin', position: 5, bowls: true },
] as const;

describeDb('Module 11 roles', (ctx) => {
  for (const r of ROLES)
    it(
      `a ${r.role} takes the field in the right place: bats at ${r.position}, ${r.bowls ? 'is offered the ball' : 'is never offered the ball'}`,
      () =>
        app(ctx, async (app) => {
          const started = await startCareerMatch(app, ctx, {
            primaryRole: r.role,
            bowlingStyle: r.style,
          });
          const { browser, matchId } = started;
          // the team sheet: one Cricketer, in their slot, with their role named
          const sheet = (await flowOf(browser, matchId)).yourTeam.players;
          const me = sheet.find((p) => p.isYou)!;
          expect(me.battingPosition).toBe(r.position);
          expect(me.role).toBe(r.role);
          expect(sheet).toHaveLength(11);
          expect(new Set(sheet.map((p) => p.name)).size).toBe(11);
          // fielding first: the choice of bowler either includes the Cricketer or never does
          await arrangeToss(started, ctx, { userWins: true });
          await completeToss(browser, matchId, { decision: 'bowl' });
          let state = await stateOf(browser, matchId);
          if (state.phase === 'simulate_required')
            state = (
              await browser.post(`/api/v1/matches/${matchId}/simulate`, {
                mode: 'until_my_turn',
              })
            ).json().data.match;
          const you = state.eligibleBowlers.find((b) => b.isYou);
          if (r.bowls) {
            expect(state.phase).toBe('bowler_select');
            expect(you?.eligible).toBe(true);
          } else {
            expect(you).toBeUndefined();
            expect([
              'bowler_select',
              'innings_break',
              'simulate_required',
            ]).toContain(state.phase);
          }
        }),
      60000,
    );

  it(
    'a Cricketer is always given a turn with the bat: the chase stops where they are on strike',
    () =>
      app(ctx, async (app) => {
        for (const r of ROLES.slice(0, 2)) {
          const started = await startCareerMatch(app, ctx, {
            primaryRole: r.role,
            bowlingStyle: r.style,
          });
          const { browser, matchId } = started;
          await arrangeToss(started, ctx, { userWins: true });
          await completeToss(browser, matchId, { decision: 'bat' });
          let state = await stateOf(browser, matchId);
          for (
            let guard = 0;
            guard < 6 && state.phase === 'simulate_required';
            guard++
          )
            state = (
              await browser.post(`/api/v1/matches/${matchId}/simulate`, {
                mode: 'until_my_turn',
              })
            ).json().data.match;
          // either on strike, or the innings ended with everyone in front of them out (never skipped past)
          expect(['ready_to_bat', 'innings_break']).toContain(state.phase);
          if (state.phase === 'ready_to_bat')
            expect(state.striker?.playerId).toBe(state.you.playerId);
        }
      }),
    90000,
  );
});
