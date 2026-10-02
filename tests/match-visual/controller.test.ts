import { describe, expect, it, vi } from 'vitest';
import { MatchGameplayController } from '../../apps/web/src/features/match/core/gameplay-controller';
import type { MatchApi } from '../../apps/web/src/features/match/api/match-client';
import type {
  SceneEvent,
  ScenePort,
} from '../../apps/web/src/features/match/core/scene-port';
import type {
  DeliveryResultDto,
  MatchPlayStateDto,
} from '../../packages/shared-types/src/index';
import { makeOutcome, makeResult, makeState } from './support';

class NetworkError extends Error {
  readonly code = 'NETWORK_ERROR';
}
class CodedError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

function fakeScene() {
  const calls: string[] = [];
  const scene: ScenePort = {
    prepare: () => void calls.push('prepare'),
    setTarget: () => void calls.push('setTarget'),
    startRunUp: () => void calls.push('startRunUp'),
    cancelRunUp: () => void calls.push('cancelRunUp'),
    beginFlight: () => void calls.push('beginFlight'),
    skip: () => void calls.push('skip'),
    reset: () => void calls.push('reset'),
    setPaused: (p) => void calls.push(p ? 'pause' : 'resume'),
    startDelivery: () => void calls.push('startDelivery'),
    startSwing: () => void calls.push('startSwing'),
    applyShotResult: () => void calls.push('applyShotResult'),
    presentationTime: () => null,
    setFast: () => undefined,
    setTimeScale: () => undefined,
    step: () => undefined,
  };
  return { scene, calls };
}

function setup(state: MatchPlayStateDto = makeState()) {
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
  let clock = 1000;
  const completed: string[] = [];
  const controller = new MatchGameplayController({
    api,
    matchId: state.matchId,
    now: () => (clock += 16),
    newActionId: () => `action-${++id}-abcdefgh`,
    onCompleted: (m) => completed.push(m),
  });
  const { scene, calls } = fakeScene();
  controller.attachScene(scene);
  return { api, controller, calls, completed };
}

const release = (c: MatchGameplayController) =>
  c.handleSceneEvent({
    type: 'BALL_RELEASE',
    hand: { u: 0.1, v: 0.3, z: 2.1 },
  });
const run = (c: MatchGameplayController, ...events: SceneEvent['type'][]) => {
  for (const type of events) c.handleSceneEvent({ type } as SceneEvent);
};

describe('MatchGameplayController', () => {
  it('loads the authoritative state and opens targeting for the bowler in an over', async () => {
    const { controller } = setup();
    await controller.load();
    const snap = controller.getSnapshot();
    expect(snap.status).toBe('ready');
    expect(snap.bowlingState).toBe('TARGETING');
    expect(snap.input.canBowl).toBe(true);
    expect(snap.deliveries.map((d) => d.id)).toEqual([
      'delivery.fast.stock',
      'delivery.fast.outswing',
    ]);
    expect(snap.display).toEqual(snap.authoritative);
  });

  it('requires a bowler choice at the start of an over, then plays the first ball with that bowler', async () => {
    const state = makeState({
      phase: 'bowler_select',
      currentBowler: null,
      eligibleBowlers: [
        {
          playerId: 'p1',
          name: 'A',
          style: 'right_arm_fast',
          styleName: 'Right-arm fast',
          arm: 'right',
          kind: 'fast',
          oversBowled: 0,
          maxOvers: 1,
          eligible: true,
          reason: null,
          skills: {
            accuracy: 50,
            control: 50,
            consistency: 50,
            pace: 50,
            spin: 5,
          },
          fatigue: 0,
          isYou: false,
          deliveryIds: ['delivery.fast.stock'],
        },
        {
          playerId: 'p2',
          name: 'B',
          style: 'off_spin',
          styleName: 'Off spin',
          arm: 'right',
          kind: 'spin',
          oversBowled: 1,
          maxOvers: 1,
          eligible: false,
          reason: 'Bowled the previous over',
          skills: {
            accuracy: 50,
            control: 50,
            consistency: 50,
            pace: 20,
            spin: 60,
          },
          fatigue: 0,
          isYou: false,
          deliveryIds: ['delivery.fast.stock'],
        },
      ],
    });
    const { controller, api } = setup(state);
    await controller.load();
    expect(controller.getSnapshot().bowlingState).toBe('PREPARING');
    expect(controller.bowl()).toBe(false);
    expect(controller.selectBowler('p2')).toBe(false);
    expect(controller.selectBowler('p1')).toBe(true);
    expect(controller.getSnapshot().bowlingState).toBe('TARGETING');
    api.deliver.mockResolvedValue(makeResult());
    expect(controller.bowl()).toBe(true);
    expect(api.deliver.mock.calls[0]![1]).toMatchObject({ bowlerId: 'p1' });
  });

  it('sends only intent: variation, aimed target and a bounded timing score, never a result', async () => {
    const { controller, api } = setup();
    await controller.load();
    controller.selectDelivery('delivery.fast.outswing');
    controller.setTarget({ x: 0.27, y: 0.48 });
    api.deliver.mockReturnValue(new Promise(() => undefined));
    controller.bowl();
    const body = api.deliver.mock.calls[0]![1];
    expect(Object.keys(body).sort()).toEqual(
      ['actionId', 'deliveryIntent', 'expectedSequence'].sort(),
    );
    expect(Object.keys(body.deliveryIntent).sort()).toEqual(
      ['executionInput', 'target', 'variationId'].sort(),
    );
    expect(body.deliveryIntent.variationId).toBe('delivery.fast.outswing');
    expect(body.deliveryIntent.target).toEqual({ x: 0.27, y: 0.48 });
    expect(body.expectedSequence).toBe(1);
    expect(body.deliveryIntent.executionInput).toBeGreaterThanOrEqual(0);
    expect(body.deliveryIntent.executionInput).toBeLessThanOrEqual(1);
  });

  it('a double tap starts exactly one delivery and locks the controls', async () => {
    const { controller, api, calls } = setup();
    await controller.load();
    api.deliver.mockReturnValue(new Promise(() => undefined));
    expect(controller.bowl()).toBe(true);
    expect(controller.bowl()).toBe(false);
    expect(controller.bowl()).toBe(false);
    expect(api.deliver).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c === 'startRunUp')).toHaveLength(1);
    expect(controller.getSnapshot().input.inputOpen).toBe(false);
    controller.selectDelivery('delivery.fast.stock');
    controller.setTarget({ x: 0.9, y: 0.9 });
    expect(controller.input.targetController.target).not.toEqual({
      x: 0.9,
      y: 0.9,
    });
  });

  it('plays a whole ball: hold at release until the server answers, then present, then reopen input', async () => {
    const { controller, api, calls } = setup();
    await controller.load();
    const reply = deferred<DeliveryResultDto>();
    api.deliver.mockReturnValue(reply.promise);
    controller.bowl();
    // the bowler reaches the release marker before the server has answered: the ball is held
    expect(release(controller)).toBe(false);
    expect(controller.getSnapshot().waitingForServer).toBe(true);
    expect(calls).not.toContain('beginFlight');
    const result = makeResult({
      outcome: makeOutcome({
        runsOffBat: 4,
        totalRuns: 4,
        headline: 'FOUR',
        distanceClass: 'boundary',
      }),
      match: makeState({
        expectedSequence: 2,
        innings: {
          ...makeState().innings,
          runs: 4,
          legalBalls: 1,
          oversText: '0.1',
          ballsRemaining: 11,
        },
      }),
    });
    reply.resolve(result);
    await Promise.resolve();
    await Promise.resolve();
    // authoritative moves immediately, the HUD does not until the ball reaches the bat
    expect(controller.getSnapshot().authoritative!.innings.runs).toBe(4);
    expect(controller.getSnapshot().display!.innings.runs).toBe(0);
    expect(release(controller)).toBe(true);
    expect(calls).toContain('beginFlight');
    expect(controller.getSnapshot().bowlingState).toBe('BALL_IN_FLIGHT');
    run(controller, 'BALL_PITCH');
    expect(controller.getSnapshot().bowlingState).toBe('PITCHED');
    run(controller, 'BALL_NEAR_BATTER');
    expect(controller.getSnapshot().bowlingState).toBe('BATTER_ACTION');
    run(controller, 'RESULT');
    expect(controller.getSnapshot().banner?.headline).toBe('FOUR');
    expect(controller.getSnapshot().display!.innings.runs).toBe(0);
    run(controller, 'SCORE_UPDATE');
    expect(controller.getSnapshot().display!.innings.runs).toBe(4);
    run(controller, 'SEQUENCE_COMPLETE');
    const snap = controller.getSnapshot();
    expect(snap.bowlingState).toBe('TARGETING');
    expect(snap.input.inputOpen).toBe(true);
    expect(snap.last?.variation).toBe('Fast Outswing');
    // the next ball uses the next sequence number
    api.deliver.mockReturnValue(new Promise(() => undefined));
    controller.bowl();
    expect(api.deliver.mock.calls[1]![1].expectedSequence).toBe(2);
    expect(api.deliver.mock.calls[1]![1].actionId).not.toBe(
      api.deliver.mock.calls[0]![1].actionId,
    );
  });

  it('a network failure before release aborts the run-up, shows nothing, and retries with the SAME action id', async () => {
    const { controller, api, calls } = setup();
    await controller.load();
    api.deliver.mockRejectedValueOnce(new NetworkError('offline'));
    controller.bowl();
    await Promise.resolve();
    await Promise.resolve();
    const failed = controller.getSnapshot();
    expect(calls).toContain('cancelRunUp');
    expect(calls).not.toContain('beginFlight');
    expect(failed.bowlingState).toBe('TARGETING');
    expect(failed.error?.retryable).toBe(true);
    expect(failed.display!.innings.runs).toBe(0);
    expect(failed.banner).toBeNull();
    const firstId = api.deliver.mock.calls[0]![1].actionId;
    api.deliver.mockResolvedValueOnce(makeResult());
    expect(controller.retry()).toBe(true);
    expect(api.deliver.mock.calls[1]![1].actionId).toBe(firstId);
    expect(controller.getSnapshot().error).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    expect(release(controller)).toBe(true);
  });

  it('a stale sequence resyncs from the server instead of showing a fake result', async () => {
    const { controller, api, calls } = setup();
    await controller.load();
    const fresh = makeState({ expectedSequence: 5 });
    api.getState.mockResolvedValue(fresh);
    api.deliver.mockRejectedValueOnce(
      new CodedError('STALE_SEQUENCE', 'The match has moved on'),
    );
    controller.bowl();
    await vi.waitFor(() => expect(api.getState).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(controller.getSnapshot().authoritative?.expectedSequence).toBe(5),
    );
    const snap = controller.getSnapshot();
    expect(calls).toContain('cancelRunUp');
    expect(snap.bowlingState).toBe('TARGETING');
    expect(snap.notice).toMatch(/reloaded/);
    expect(snap.banner).toBeNull();
    // and the next action carries the new sequence
    api.deliver.mockReturnValue(new Promise(() => undefined));
    controller.bowl();
    expect(api.deliver.mock.calls.at(-1)![1].expectedSequence).toBe(5);
  });

  it('a rejected delivery is not retryable: the match is reloaded and the server\u2019s reason is shown', async () => {
    const { controller, api } = setup();
    await controller.load();
    api.deliver.mockRejectedValueOnce(
      new CodedError('INVALID_DELIVERY', 'That delivery is not available'),
    );
    controller.bowl();
    await vi.waitFor(() => expect(api.getState).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(controller.getSnapshot().notice).toMatch(
        /not available.*reloaded/,
      ),
    );
    expect(controller.getSnapshot().bowlingState).toBe('TARGETING');
    expect(controller.retry()).toBe(false);
    // the player can bowl again with a fresh action
    api.deliver.mockReturnValue(new Promise(() => undefined));
    expect(controller.bowl()).toBe(true);
  });

  it('giving up on a failed delivery drops it so the player can bowl a different one', async () => {
    const { controller, api } = setup();
    await controller.load();
    api.deliver.mockRejectedValueOnce(new NetworkError('offline'));
    controller.bowl();
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.bowl()).toBe(false);
    controller.dismissError();
    api.deliver.mockReturnValue(new Promise(() => undefined));
    expect(controller.bowl()).toBe(true);
    expect(api.deliver.mock.calls[1]![1].actionId).not.toBe(
      api.deliver.mock.calls[0]![1].actionId,
    );
  });

  it('ignores a server reply that arrives after the controller was destroyed', async () => {
    const { controller, api, calls } = setup();
    await controller.load();
    const reply = deferred<DeliveryResultDto>();
    api.deliver.mockReturnValue(reply.promise);
    controller.bowl();
    controller.destroy();
    reply.resolve(makeResult());
    await Promise.resolve();
    expect(release(controller)).toBe(true);
    expect(calls).not.toContain('beginFlight');
  });

  it('skip asks the scene to finish and the sequence completes exactly once even if it is called repeatedly', async () => {
    const { controller, api, calls } = setup();
    await controller.load();
    api.deliver.mockResolvedValue(makeResult());
    controller.bowl();
    await Promise.resolve();
    await Promise.resolve();
    release(controller);
    controller.skip();
    controller.skip();
    expect(calls.filter((c) => c === 'skip')).toHaveLength(2);
    run(
      controller,
      'RESULT',
      'SCORE_UPDATE',
      'SEQUENCE_COMPLETE',
      'SEQUENCE_COMPLETE',
    );
    expect(controller.getSnapshot().bowlingState).toBe('TARGETING');
    expect(controller.getSnapshot().authoritative!.expectedSequence).toBe(2);
    controller.skip();
    expect(calls.filter((c) => c === 'skip')).toHaveLength(2);
  });

  it('after the sixth ball it summarises the over and asks for the next bowler', async () => {
    const { controller, api } = setup();
    await controller.load();
    const after = makeState({
      phase: 'bowler_select',
      currentBowler: null,
      expectedSequence: 7,
      thisOver: ['1', '•', '4', 'W', '2', '1'].map((label) => ({
        label,
        legal: true,
        runs: 0,
        wicket: label === 'W',
      })),
      eligibleBowlers: [],
    });
    api.deliver.mockResolvedValue(
      makeResult({
        overNumber: 1,
        events: [{ type: 'OVER_COMPLETED', inningsNumber: 1 }],
        match: after,
      }),
    );
    controller.bowl();
    await Promise.resolve();
    await Promise.resolve();
    release(controller);
    run(controller, 'RESULT', 'SCORE_UPDATE');
    expect(controller.getSnapshot().over).toEqual({
      title: 'Over 1 complete',
      line: '1 · • · 4 · W · 2 · 1',
    });
    run(controller, 'SEQUENCE_COMPLETE');
    expect(controller.getSnapshot().bowlingState).toBe('PREPARING');
    expect(controller.getSnapshot().authoritative!.phase).toBe('bowler_select');
  });

  it('navigates to the result when the final ball completes the match', async () => {
    const { controller, api, completed } = setup();
    await controller.load();
    api.deliver.mockResolvedValue(
      makeResult({
        match: makeState({
          phase: 'completed',
          status: 'completed',
          currentBowler: null,
          result: {
            type: 'win',
            text: 'Them won by 3 runs',
            winnerTeamName: 'Them',
            youWon: false,
            superOver: false,
          },
        }),
      }),
    );
    controller.bowl();
    await Promise.resolve();
    await Promise.resolve();
    release(controller);
    run(controller, 'RESULT', 'SCORE_UPDATE', 'SEQUENCE_COMPLETE');
    expect(completed).toHaveLength(1);
  });

  it('simulates the innings the player does not control and applies the server state', async () => {
    const batting = makeState({
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
    const { controller, api } = setup(batting);
    await controller.load();
    expect(controller.bowl()).toBe(false);
    api.simulate.mockResolvedValue({
      simulated: [
        { sequence: 1, inningsNumber: 1, label: '1', headline: '1 RUN' },
      ],
      match: makeState({ phase: 'ready_to_bowl', expectedSequence: 13 }),
    });
    await controller.simulate('until_my_turn');
    expect(api.simulate).toHaveBeenCalledWith(batting.matchId, {
      mode: 'until_my_turn',
    });
    expect(controller.getSnapshot().authoritative!.expectedSequence).toBe(13);
    expect(controller.getSnapshot().bowlingState).toBe('TARGETING');
    expect(controller.getSnapshot().notice).toMatch(/Played 1 ball/);
  });

  it('pausing the scene never touches the match', async () => {
    const { controller, api, calls } = setup();
    await controller.load();
    controller.setPaused(true);
    controller.setPaused(true);
    controller.setPaused(false);
    expect(calls.filter((c) => c === 'pause')).toHaveLength(1);
    expect(calls.filter((c) => c === 'resume')).toHaveLength(1);
    expect(api.deliver).not.toHaveBeenCalled();
  });

  it('surfaces a load failure as a retryable error', async () => {
    const { controller, api } = setup();
    api.getState.mockRejectedValueOnce(new NetworkError('offline'));
    await controller.load();
    expect(controller.getSnapshot().status).toBe('error');
    await controller.load();
    expect(controller.getSnapshot().status).toBe('ready');
  });
});
