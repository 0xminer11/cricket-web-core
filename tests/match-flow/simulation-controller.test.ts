import { describe, expect, it, vi } from 'vitest';
import { MatchGameplayController } from '../../apps/web/src/features/match/core/gameplay-controller';
import type { MatchApi } from '../../apps/web/src/features/match/api/match-client';
import type { ScenePort } from '../../apps/web/src/features/match/core/scene-port';
import type {
  SimulateResultDto,
  OverSummaryDto,
} from '../../packages/shared-types/src/index';
import { makeResult, makeState } from '../match-visual/support';

const scene = (): ScenePort => ({
  prepare: () => undefined,
  setTarget: () => undefined,
  startRunUp: () => undefined,
  cancelRunUp: () => undefined,
  beginFlight: () => undefined,
  skip: () => undefined,
  reset: () => undefined,
  setPaused: () => undefined,
  startDelivery: () => undefined,
  startSwing: () => undefined,
  applyShotResult: () => undefined,
  presentationTime: () => null,
  setFast: () => undefined,
  setTimeScale: () => undefined,
  step: () => undefined,
});

const waiting = () =>
  makeState({
    phase: 'simulate_required',
    currentBowler: null,
    you: {
      playerId: 'p-bowl',
      teamId: 't1',
      teamName: 'Mine',
      side: 'batting',
      status: 'waiting',
    },
  });

function setup(state = waiting()) {
  const api = {
    getState: vi.fn(async () => state),
    advance: vi.fn(),
    simulate: vi.fn(),
    deliver: vi.fn(),
    start: vi.fn(),
    lab: vi.fn(),
    nextBall: vi.fn(),
    shoot: vi.fn(),
    battingLab: vi.fn(),
    track: vi.fn(),
  } satisfies MatchApi;
  let id = 0;
  const controller = new MatchGameplayController({
    api,
    matchId: state.matchId,
    now: () => 1000,
    newActionId: () => `action-${++id}-abcdefgh`,
    onCompleted: () => undefined,
  });
  controller.attachScene(scene());
  return { api, controller };
}

const balls = (n: number): SimulateResultDto['simulated'] =>
  Array.from({ length: n }, (_, i) => ({
    sequence: i + 1,
    inningsNumber: 1,
    label: String(i % 4),
    headline: i % 4 ? `${i % 4} RUN` : 'DOT BALL',
    over: `0.${i + 1}`,
    score: `${i}/0`,
  }));

const after = () => makeState({ phase: 'ready_to_bowl', expectedSequence: 5 });

describe('simulation at three speeds', () => {
  it('Instant applies the server state at once and reports a summary', async () => {
    const { controller, api } = setup();
    await controller.load();
    api.simulate.mockResolvedValue({ simulated: balls(4), match: after() });
    controller.setSimulationSpeed('instant');
    await controller.simulate('until_my_turn');
    const snap = controller.getSnapshot();
    expect(snap.simulation).toBeNull();
    expect(snap.authoritative!.expectedSequence).toBe(5);
    expect(snap.notice).toMatch(/Played 4 balls/);
    expect(snap.busy).toBe(false);
    expect(api.track).toHaveBeenCalledWith(
      'simulate_until_turn_used',
      'instant',
    );
  });

  it('Normal reveals ball by ball, keeps the controls locked until the last one, then settles', async () => {
    const { controller, api } = setup();
    await controller.load();
    api.simulate.mockResolvedValue({ simulated: balls(3), match: after() });
    controller.setSimulationSpeed('normal');
    await controller.simulate('until_my_turn');
    let snap = controller.getSnapshot();
    expect(snap.simulation).toMatchObject({
      shown: 0,
      speed: 'normal',
      done: false,
    });
    expect(snap.busy).toBe(true);
    // the server state is already known and applied
    expect(snap.authoritative!.expectedSequence).toBe(5);
    controller.revealSimulation(1);
    snap = controller.getSnapshot();
    expect(snap.simulation?.shown).toBe(1);
    expect(snap.busy).toBe(true);
    controller.revealSimulation(1);
    controller.revealSimulation(1);
    snap = controller.getSnapshot();
    expect(snap.simulation).toMatchObject({ shown: 3, done: true });
    expect(snap.busy).toBe(false);
    controller.closeSimulation();
    expect(controller.getSnapshot().simulation).toBeNull();
  });

  it('can be skipped to the end, and revealing past the end is harmless', async () => {
    const { controller, api } = setup();
    await controller.load();
    api.simulate.mockResolvedValue({ simulated: balls(6), match: after() });
    await controller.simulate('over', undefined, 'fast');
    controller.skipSimulation();
    expect(controller.getSnapshot().simulation).toMatchObject({
      shown: 6,
      done: true,
    });
    controller.revealSimulation(10);
    expect(controller.getSnapshot().simulation?.shown).toBe(6);
    expect(api.simulate).toHaveBeenCalledWith(waiting().matchId, {
      mode: 'over',
    });
  });

  it('a second request while one is running does nothing, and a failure unlocks the controls', async () => {
    const { controller, api } = setup();
    await controller.load();
    let reject!: (e: unknown) => void;
    api.simulate.mockImplementationOnce(
      () => new Promise((_, r) => (reject = r)),
    );
    const first = controller.simulate('until_my_turn');
    await controller.simulate('innings'); // ignored: busy
    expect(api.simulate).toHaveBeenCalledTimes(1);
    reject(Object.assign(new Error('x'), { code: 'NETWORK_ERROR' }));
    await first;
    const snap = controller.getSnapshot();
    expect(snap.busy).toBe(false);
    // nothing was played: the panel is still there to press again, so there is no "retry the delivery" prompt
    expect(snap.error?.code).toBe('NETWORK_ERROR');
    expect(snap.error?.retryable).toBe(false);
    expect(snap.simulation).toBeNull();
  });

  it('sends the chosen bowler for a simulated over', async () => {
    const { controller, api } = setup();
    await controller.load();
    api.simulate.mockResolvedValue({ simulated: balls(6), match: after() });
    await controller.simulate('over', 'bowler-7', 'instant');
    expect(api.simulate).toHaveBeenCalledWith(waiting().matchId, {
      mode: 'over',
      bowlerId: 'bowler-7',
    });
  });
});

describe('over summary and control mode in the controller', () => {
  const summary: OverSummaryDto = {
    overNumber: 1,
    score: '8/0',
    balls: [
      { label: '•', runs: 0, wicket: false },
      { label: '4', runs: 4, wicket: false },
    ],
    bowlerName: 'Bowler',
    bowlerFigures: '1-0-8-0',
    striker: 'A 4',
    nonStriker: 'B 0',
    chase: null,
  } as unknown as OverSummaryDto;

  it('shows the control mode derived from the phase', async () => {
    const waitingSetup = setup();
    await waitingSetup.controller.load();
    expect(waitingSetup.controller.getSnapshot().controlMode).toBe(
      'AI_SIMULATION',
    );
    const bowling = setup(makeState({ phase: 'ready_to_bowl' }));
    await bowling.controller.load();
    expect(bowling.controller.getSnapshot().controlMode).toBe('HUMAN_BOWLING');
    const batting = setup(makeState({ phase: 'ready_to_bat' }));
    await batting.controller.load();
    expect(batting.controller.getSnapshot().controlMode).toBe('HUMAN_BATTING');
  });

  it('tracks the start of the human turn once, not on every refresh of the same turn', async () => {
    const { controller, api } = setup(makeState({ phase: 'ready_to_bowl' }));
    await controller.load();
    await controller.load();
    expect(
      api.track.mock.calls.filter(
        (c) => c[0] === 'career_player_bowling_started',
      ),
    ).toHaveLength(1);
  });

  it('keeps an over summary until it is dismissed, and dismissing is idempotent', async () => {
    const { controller, api } = setup(makeState({ phase: 'ready_to_bowl' }));
    await controller.load();
    api.deliver.mockResolvedValue(makeResult({ overSummary: summary }));
    expect(controller.bowl()).toBe(true);
    for (const type of [
      'BALL_RELEASE',
      'BALL_PITCH',
      'BALL_NEAR_BATTER',
      'RESULT',
      'SCORE_UPDATE',
      'SEQUENCE_COMPLETE',
    ] as const) {
      await Promise.resolve();
      controller.handleSceneEvent(
        type === 'BALL_RELEASE'
          ? { type, hand: { u: 0.1, v: 0.3, z: 2.1 } }
          : ({ type } as never),
      );
    }
    expect(controller.getSnapshot().overSummary).toEqual(summary);
    controller.dismissOverSummary();
    controller.dismissOverSummary();
    expect(controller.getSnapshot().overSummary).toBeNull();
  });
});
