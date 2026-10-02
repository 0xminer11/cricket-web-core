import { describe, expect, it, vi } from 'vitest';
import { MatchGameplayController } from '../../apps/web/src/features/match/core/gameplay-controller';
import type { MatchApi } from '../../apps/web/src/features/match/api/match-client';
import type {
  SceneEvent,
  ScenePort,
} from '../../apps/web/src/features/match/core/scene-port';
import type {
  DeliveryPreviewDto,
  DeliveryResultDto,
  MatchPlayStateDto,
  ShotRequest,
} from '../../packages/shared-types/src/index';
import {
  makeOutcome,
  makeResult,
  makeShot,
  makeState,
} from '../match-visual/support';

class NetworkError extends Error {
  readonly code = 'NETWORK_ERROR';
}
class CodedError extends Error {
  constructor(readonly code: string) {
    super(code);
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

const battingState = (overrides: Partial<MatchPlayStateDto> = {}) =>
  makeState({
    phase: 'ready_to_bat',
    you: {
      playerId: 'b1',
      teamId: 't2',
      teamName: 'Mine',
      side: 'batting',
      status: 'on_strike',
    },
    battingTeam: { id: 't2', name: 'Mine' },
    bowlingTeam: { id: 't1', name: 'Them' },
    striker: { playerId: 'b1', name: 'Me', runs: 0, balls: 0, hand: 'right' },
    currentBowler: null,
    ...overrides,
  });

const previewFor = (state: MatchPlayStateDto): DeliveryPreviewDto => ({
  sequence: state.expectedSequence,
  inningsNumber: 1,
  overNumber: 1,
  ballInOver: 1,
  bowler: {
    playerId: 'p-bowl',
    name: 'Aditya',
    style: 'right_arm_fast',
    styleName: 'Right-arm fast',
    arm: 'right',
    kind: 'fast',
  },
  delivery: {
    variationId: 'delivery.fast.stock',
    name: 'Stock',
    target: { x: 0.5, y: 0.4 },
    line: 'middle',
    length: 'good',
    lineLabel: 'Middle',
    lengthLabel: 'Good length',
    speedMs: 36,
    speedKmh: 129.6,
    movement: { swing: 0, seam: 0, spin: 0 },
    bounce: 0.5,
    bowlingArm: 'right',
    battingHand: 'right',
  },
  match: state,
});

function fakeScene() {
  const calls: string[] = [];
  const log = {
    replays: [] as unknown[],
    shotIds: [] as string[],
    results: [] as DeliveryResultDto[],
    modes: [] as (string | undefined)[],
  };
  let clock: number | null = 0;
  const scene: ScenePort = {
    prepare: (info) => {
      calls.push('prepare');
      log.modes.push(info.mode);
    },
    setTarget: () => void calls.push('setTarget'),
    startRunUp: () => void calls.push('startRunUp'),
    cancelRunUp: () => void calls.push('cancelRunUp'),
    beginFlight: () => void calls.push('beginFlight'),
    skip: () => void calls.push('skip'),
    reset: () => void calls.push('reset'),
    setPaused: (p) => void calls.push(p ? 'pause' : 'resume'),
    startDelivery: (_preview, replay) => {
      calls.push('startDelivery');
      log.replays.push(replay ?? null);
    },
    startSwing: (id) => {
      calls.push('startSwing');
      log.shotIds.push(id);
    },
    applyShotResult: (r) => {
      calls.push('applyShotResult');
      log.results.push(r);
    },
    presentationTime: () => clock,
    setFast: () => undefined,
    setTimeScale: () => undefined,
    step: () => undefined,
  };
  return { scene, calls, log, setClock: (t: number | null) => (clock = t) };
}

function setup(state: MatchPlayStateDto = battingState()) {
  const api = {
    getState: vi.fn(async () => state),
    advance: vi.fn(),
    simulate: vi.fn(),
    deliver: vi.fn(),
    start: vi.fn(),
    lab: vi.fn(),
    nextBall: vi.fn(async () => previewFor(state)),
    shoot: vi.fn<MatchApi['shoot']>(),
    battingLab: vi.fn(),
    track: vi.fn(),
  } satisfies MatchApi;
  let id = 0;
  const completed: string[] = [];
  const controller = new MatchGameplayController({
    api,
    matchId: state.matchId,
    now: () => 1000,
    newActionId: () => `action-${++id}-abcdefgh`,
    onCompleted: (m) => completed.push(m),
  });
  const fake = fakeScene();
  controller.attachScene(fake.scene);
  return { api, controller, completed, ...fake, state };
}

const fire = (c: MatchGameplayController, ...events: SceneEvent[]) => {
  for (const event of events) c.handleSceneEvent(event);
};
const release = (c: MatchGameplayController) => {
  fire(
    c,
    { type: 'BALL_RELEASE', hand: { u: 0.1, v: 0.3, z: 2.1 } },
    {
      type: 'BALL_TIMELINE',
      pitchTime: 0.9,
      contactTime: 1.4,
      speedKmh: 129.6,
    },
  );
};
async function faceAndRelease(s: ReturnType<typeof setup>) {
  await s.controller.load();
  await s.controller.faceNextBall();
  release(s.controller);
}
const nextState = (overrides: Partial<MatchPlayStateDto> = {}) =>
  battingState({
    expectedSequence: 2,
    innings: { ...battingState().innings, runs: 4 },
    ...overrides,
  });

describe('batting controller: the player bats, the server decides', () => {
  it('loads a batting turn: mode, scene mode, hand, and a button to face the ball', async () => {
    const s = setup();
    await s.controller.load();
    const snap = s.controller.getSnapshot();
    expect(snap.mode).toBe('batting');
    expect(snap.batting.canFace).toBe(true);
    expect(snap.batting.state).toBe('WAITING');
    expect(s.log.modes.at(-1)).toBe('batting');
  });

  it('faces one ball per request, however many times it is asked', async () => {
    const s = setup();
    await s.controller.load();
    await Promise.all([
      s.controller.faceNextBall(),
      s.controller.faceNextBall(),
    ]);
    expect(s.api.nextBall).toHaveBeenCalledTimes(1);
    expect(s.calls.filter((c) => c === 'startDelivery')).toHaveLength(1);
    expect(s.controller.getSnapshot().batting.state).toBe('BOWLER_APPROACH');
    expect(s.controller.getSnapshot().batting.canFace).toBe(false);
  });

  it('opens shot input when the ball is released, and not before', async () => {
    const s = setup();
    await s.controller.load();
    await s.controller.faceNextBall();
    expect(s.controller.getSnapshot().batting.input.canSwing).toBe(false);
    release(s.controller);
    const snap = s.controller.getSnapshot();
    expect(snap.batting.state).toBe('READING_DELIVERY');
    expect(snap.batting.input.canSwing).toBe(true);
    expect(snap.batting.ball?.speedKmh).toBe(129.6);
  });

  it('starts the swing at once (before the server answers) and sends only a shot, a direction and a timing', async () => {
    const s = setup();
    const answer = deferred<DeliveryResultDto>();
    s.api.shoot.mockReturnValue(answer.promise);
    await faceAndRelease(s);
    s.controller.setBattingAction('drive');
    s.controller.setBattingDirection(0.5);
    s.setClock(1.0);
    expect(s.controller.swing()).toBe(true);
    expect(s.calls.at(-1)).not.toBe('applyShotResult');
    expect(s.log.shotIds).toHaveLength(1);
    expect(s.api.shoot).toHaveBeenCalledTimes(1);
    const request = s.api.shoot.mock.calls[0]![1] as ShotRequest;
    expect(Object.keys(request).sort()).toEqual([
      'actionId',
      'battingIntent',
      'expectedSequence',
    ]);
    expect(Object.keys(request.battingIntent).sort()).toEqual([
      'assist',
      'direction',
      'shotId',
      'timingInput',
    ]);
    expect(request.battingIntent.timingInput).toBeGreaterThanOrEqual(-1);
    expect(request.battingIntent.timingInput).toBeLessThanOrEqual(1);
    expect(request.battingIntent.direction).toBe(0.5);
    // a second tap while the swing is under way does nothing
    expect(s.controller.swing()).toBe(false);
    expect(s.api.shoot).toHaveBeenCalledTimes(1);
    answer.resolve(makeResult({ match: nextState() }));
  });

  it('shows nothing of the result before the animation reaches it, then applies it exactly once', async () => {
    const s = setup();
    const result = makeResult({
      shot: makeShot({ shotId: 'shot.straight_drive', contactQuality: 'good' }),
      outcome: makeOutcome({
        runsOffBat: 4,
        totalRuns: 4,
        headline: 'FOUR',
        distanceClass: 'boundary',
      }),
      batting: {
        timing: 'perfect',
        timingInput: 0.02,
        assist: 'normal',
        contact: 'GOOD',
      },
      match: nextState(),
    });
    s.api.shoot.mockResolvedValue(result);
    await faceAndRelease(s);
    s.setClock(1.1);
    s.controller.swing();
    await Promise.resolve();
    await Promise.resolve();
    const early = s.controller.getSnapshot();
    expect(s.log.results).toHaveLength(1);
    expect(early.display?.innings.runs).toBe(0); // the HUD still shows the old score
    expect(early.authoritative?.innings.runs).toBe(4);
    expect(early.banner).toBeNull();
    expect(early.batting.feedback).toBeNull();
    fire(
      s.controller,
      { type: 'CONTACT_WINDOW' },
      { type: 'BAT_CONTACT', made: true, quality: 'good' },
      { type: 'RESULT' },
    );
    const shown = s.controller.getSnapshot();
    expect(shown.banner?.headline).toBe('FOUR');
    expect(shown.batting.feedback?.contact).toBe('GOOD');
    expect(shown.display?.innings.runs).toBe(0);
    fire(s.controller, { type: 'SCORE_UPDATE' });
    expect(s.controller.getSnapshot().display?.innings.runs).toBe(4);
    fire(
      s.controller,
      { type: 'SEQUENCE_COMPLETE' },
      { type: 'SEQUENCE_COMPLETE' },
    );
    const done = s.controller.getSnapshot();
    expect(done.batting.state).toBe('WAITING');
    expect(done.batting.canFace).toBe(true);
    expect(s.calls.filter((c) => c === 'reset')).toHaveLength(1);
  });

  it('remembers a tap just before the release and honours it, but ignores taps on a replayed ball', async () => {
    const s = setup();
    s.api.shoot.mockResolvedValue(makeResult({ match: nextState() }));
    await s.controller.load();
    await s.controller.faceNextBall();
    s.setClock(-0.05);
    fire(s.controller, { type: 'SWING_INPUT', at: -0.05 });
    expect(s.api.shoot).not.toHaveBeenCalled();
    release(s.controller);
    expect(s.api.shoot).toHaveBeenCalledTimes(1);
  });

  it('plays a ball you never swung at as a swing that comes far too late', async () => {
    const s = setup();
    s.api.shoot.mockResolvedValue(makeResult({ match: nextState() }));
    await faceAndRelease(s);
    fire(s.controller, { type: 'LATE_CUTOFF' });
    expect(s.api.shoot).toHaveBeenCalledTimes(1);
    expect(
      (s.api.shoot.mock.calls[0]![1] as ShotRequest).battingIntent.timingInput,
    ).toBe(1);
  });

  it('a dropped connection abandons the swing, shows nothing, and the same shot can be sent again without being played twice', async () => {
    const s = setup();
    s.api.shoot.mockRejectedValueOnce(new NetworkError('x'));
    await faceAndRelease(s);
    s.setClock(1.0);
    s.controller.swing();
    await new Promise((r) => setTimeout(r, 0));
    const snap = s.controller.getSnapshot();
    expect(snap.error?.retryable).toBe(true);
    expect(snap.batting.state).toBe('WAITING');
    expect(snap.display?.innings.runs).toBe(0);
    expect(s.calls).toContain('reset');
    const firstAction = (s.api.shoot.mock.calls[0]![1] as ShotRequest).actionId;
    const result = makeResult({ match: nextState() });
    s.api.shoot.mockResolvedValueOnce(result);
    expect(s.controller.retryShot()).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect((s.api.shoot.mock.calls[1]![1] as ShotRequest).actionId).toBe(
      firstAction,
    );
    // the ball is shown again with the swing replayed automatically
    expect(s.log.replays.at(-1)).toMatchObject({ shotId: expect.any(String) });
    // and a tap during the replay is not a second swing
    release(s.controller);
    expect(s.controller.swing()).toBe(false);
    expect(s.api.shoot).toHaveBeenCalledTimes(2);
  });

  it('a stale sequence reloads the match instead of guessing', async () => {
    const s = setup();
    s.api.shoot.mockRejectedValueOnce(new CodedError('STALE_SEQUENCE'));
    await faceAndRelease(s);
    s.controller.swing();
    await new Promise((r) => setTimeout(r, 5));
    expect(s.api.getState.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(s.controller.getSnapshot().batting.state).toBe('WAITING');
    expect(s.controller.getSnapshot().notice).toMatch(/reloaded/i);
  });

  it('after your wicket the match goes back to the simulation panels, and the batting controls close', async () => {
    const s = setup();
    const out = makeResult({
      outcome: makeOutcome({
        wicketType: 'bowled',
        headline: 'WICKET',
        runsOffBat: 0,
        totalRuns: 0,
      }),
      match: makeState({
        phase: 'simulate_required',
        expectedSequence: 2,
        you: {
          playerId: 'b1',
          teamId: 't2',
          teamName: 'Mine',
          side: 'batting',
          status: 'dismissed',
        },
      }),
    });
    s.api.shoot.mockResolvedValue(out);
    await faceAndRelease(s);
    s.controller.swing();
    await Promise.resolve();
    await Promise.resolve();
    fire(
      s.controller,
      { type: 'RESULT' },
      { type: 'SCORE_UPDATE' },
      { type: 'SEQUENCE_COMPLETE' },
    );
    const snap = s.controller.getSnapshot();
    expect(snap.mode).toBe('bowling');
    expect(snap.authoritative?.phase).toBe('simulate_required');
    expect(s.log.modes.at(-1)).toBe('bowling');
  });

  it('a finished match leaves for the result page', async () => {
    const s = setup();
    s.api.shoot.mockResolvedValue(
      makeResult({
        match: makeState({ phase: 'completed', status: 'completed' }),
      }),
    );
    await faceAndRelease(s);
    s.controller.swing();
    await Promise.resolve();
    await Promise.resolve();
    fire(
      s.controller,
      { type: 'RESULT' },
      { type: 'SCORE_UPDATE' },
      { type: 'SEQUENCE_COMPLETE' },
    );
    expect(s.completed).toEqual([s.state.matchId]);
  });

  it('keeps its choices from ball to ball but treats every swing as a fresh decision', async () => {
    const s = setup();
    s.api.shoot.mockResolvedValue(makeResult({ match: nextState() }));
    await faceAndRelease(s);
    s.controller.setBattingAction('loft');
    s.controller.setBattingDirection(-1);
    s.controller.swing();
    await Promise.resolve();
    await Promise.resolve();
    fire(
      s.controller,
      { type: 'RESULT' },
      { type: 'SCORE_UPDATE' },
      { type: 'SEQUENCE_COMPLETE' },
    );
    const snap = s.controller.getSnapshot();
    expect(snap.batting.input.action).toBe('loft');
    expect(snap.batting.input.direction).toBe(-1);
    expect(snap.batting.state).toBe('WAITING');
  });
});

describe('batting controller: pause, fast presentation and shot info', () => {
  it('does not face or swing while the match is paused', async () => {
    const s = setup();
    await s.controller.load();
    s.controller.setPaused(true);
    expect(await s.controller.faceNextBall()).toBe(false);
    expect(s.api.nextBall).not.toHaveBeenCalled();
    s.controller.setPaused(false);
    await s.controller.faceNextBall();
    release(s.controller);
    s.api.shoot.mockResolvedValue(makeResult({ match: nextState() }));
    s.controller.setPaused(true);
    expect(s.controller.swing()).toBe(false);
    s.controller.setPaused(false);
    expect(s.controller.swing()).toBe(true);
  });

  it('names the shot the engine played only when the result is on screen', async () => {
    const s = setup();
    s.api.shoot.mockResolvedValue(
      makeResult({
        shot: makeShot({ name: 'Cover Drive', contactQuality: 'good' }),
        batting: {
          timing: 'perfect',
          timingInput: 0,
          assist: 'normal',
          contact: 'GOOD',
        },
        match: nextState(),
      }),
    );
    await faceAndRelease(s);
    s.controller.swing();
    await Promise.resolve();
    await Promise.resolve();
    expect(s.controller.getSnapshot().batting.shotName).toBeNull();
    fire(s.controller, { type: 'RESULT' });
    expect(s.controller.getSnapshot().batting.shotName).toBe('Cover Drive');
    expect(s.controller.resultInPlay()?.shot.name).toBe('Cover Drive');
  });

  it('passes fast presentation to the scene, and keeps it for the next ball', async () => {
    const s = setup();
    const fast: boolean[] = [];
    s.scene.setFast = (on) => void fast.push(on);
    await s.controller.load();
    s.controller.setFastPresentation(true);
    expect(s.controller.getSnapshot().batting.fast).toBe(true);
    expect(fast.at(-1)).toBe(true);
    // the scene is prepared again between balls and told again
    s.controller.attachScene(s.scene);
    expect(fast.at(-1)).toBe(true);
  });
});
