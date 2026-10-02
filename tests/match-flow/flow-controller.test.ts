import { describe, expect, it, vi } from 'vitest';
import { MatchFlowController } from '../../apps/web/src/features/match-flow/controllers/match-flow-controller';
import type { MatchFlowApi } from '../../apps/web/src/features/match-flow/api/match-flow-client';
import type { MatchFlowDto } from '../../packages/shared-types/src/index';

const sheet = (isYours: boolean) => ({
  teamId: isYours ? 't-mine' : 't-theirs',
  name: isYours ? 'Mine' : 'Theirs',
  isYours,
  players: [],
});

function makeFlow(overrides: Partial<MatchFlowDto> = {}): MatchFlowDto {
  return {
    matchId: '11111111-1111-4111-8111-111111111111',
    stage: 'toss',
    started: false,
    firstMatch: false,
    format: { id: 'format.2_over', name: '2 Over', overs: 2 },
    pitch: { id: 'pitch.hard', name: 'Hard', hint: 'True bounce.' },
    venueName: 'Ground',
    competitionName: 'Academy',
    you: { playerId: 'p', name: 'Me', roleName: 'Opener' },
    yourTeam: sheet(true),
    opponentTeam: sheet(false),
    toss: {
      callerName: 'Mine',
      youCall: true,
      call: null,
      coin: null,
      winnerName: null,
      youWon: null,
      decision: null,
      decidedBy: null,
    },
    ...overrides,
  } as unknown as MatchFlowDto;
}

function setup(first: MatchFlowDto = makeFlow()) {
  const api = {
    flow: vi.fn(async () => first),
    callToss: vi.fn(),
    decide: vi.fn(),
    scorecard: vi.fn(),
    result: vi.fn(),
  } satisfies MatchFlowApi;
  const events: string[] = [];
  const completed: string[] = [];
  let exited = 0;
  const controller = new MatchFlowController({
    api,
    matchId: first.matchId,
    track: (e) => events.push(e),
    onCompleted: (id) => completed.push(id),
    onExit: () => exited++,
  });
  return { api, controller, events, completed, exited: () => exited };
}

describe('MatchFlowController', () => {
  it('a fresh match opens on the team sheet, then the toss, and records the funnel event once', async () => {
    const { controller, events } = setup();
    await controller.load();
    expect(controller.getSnapshot().state).toBe('TEAM_SHEET');
    expect(events).toEqual(['team_sheet_viewed']);
    controller.acknowledgeTeamSheet();
    expect(controller.getSnapshot().state).toBe('TOSS');
    controller.acknowledgeTeamSheet(); // a second press does nothing
    expect(controller.getSnapshot().state).toBe('TOSS');
  });

  it('the toss result stays on screen until continued; winning leads to the decision', async () => {
    const { controller, api } = setup();
    await controller.load();
    controller.acknowledgeTeamSheet();
    const won = makeFlow({
      stage: 'toss_decision',
      toss: {
        ...makeFlow().toss,
        call: 'heads',
        coin: 'heads',
        youWon: true,
        winnerName: 'Mine',
      },
    });
    api.callToss.mockResolvedValue(won);
    expect(await controller.callToss('heads')).toBe(true);
    expect(controller.getSnapshot().state).toBe('TOSS');
    expect(controller.getSnapshot().flow?.toss.coin).toBe('heads');
    controller.continueFromToss();
    expect(controller.getSnapshot().state).toBe('TOSS_DECISION');
  });

  it('an AI winner has already decided: continuing goes straight to the first innings', async () => {
    const { controller, api } = setup();
    await controller.load();
    controller.acknowledgeTeamSheet();
    api.callToss.mockResolvedValue(
      makeFlow({
        stage: 'in_progress',
        started: true,
        toss: {
          ...makeFlow().toss,
          call: 'heads',
          coin: 'tails',
          youWon: false,
          winnerName: 'Theirs',
          decision: 'bat',
          decidedBy: 'ai',
        },
      }),
    );
    await controller.callToss('heads');
    controller.continueFromToss();
    expect(['INNINGS_1_SETUP', 'INNINGS_1']).toContain(
      controller.getSnapshot().state,
    );
  });

  it('cannot decide before winning, or call twice at the same time', async () => {
    const { controller, api } = setup();
    await controller.load();
    expect(await controller.decide('bat')).toBe(false); // not on the decision screen
    expect(api.decide).not.toHaveBeenCalled();
    controller.acknowledgeTeamSheet();
    let release!: (f: MatchFlowDto) => void;
    api.callToss.mockImplementation(
      () => new Promise<MatchFlowDto>((r) => (release = r)),
    );
    const first = controller.callToss('heads');
    expect(await controller.callToss('tails')).toBe(false); // busy
    release(makeFlow({ toss: { ...makeFlow().toss, call: 'heads' } as never }));
    await first;
    expect(api.callToss).toHaveBeenCalledTimes(1);
  });

  it('a failed toss call keeps the screen, shows a retryable error and allows trying again', async () => {
    const { controller, api } = setup();
    await controller.load();
    controller.acknowledgeTeamSheet();
    const failure = Object.assign(new Error('x'), { code: 'NETWORK_ERROR' });
    api.callToss.mockRejectedValueOnce(failure);
    expect(await controller.callToss('heads')).toBe(false);
    const snap = controller.getSnapshot();
    expect(snap.state).toBe('TOSS');
    expect(snap.error?.retryable).toBe(true);
    expect(snap.busy).toBe(false);
    api.callToss.mockResolvedValueOnce(
      makeFlow({ toss: { ...makeFlow().toss, call: 'heads' } as never }),
    );
    expect(await controller.callToss('heads')).toBe(true);
    expect(controller.getSnapshot().error).toBeNull();
  });

  it('a refresh lands on the stage the server reports, whatever the browser had seen', async () => {
    const decision = setup(makeFlow({ stage: 'toss_decision' }));
    await decision.controller.load();
    expect(decision.controller.getSnapshot().state).toBe('TOSS_DECISION');
    const live = setup(makeFlow({ stage: 'in_progress', started: true }));
    await live.controller.load();
    expect(live.controller.getSnapshot().state).toBe('INNINGS_1');
    const brk = setup(makeFlow({ stage: 'innings_break', started: true }));
    await brk.controller.load();
    expect(brk.controller.getSnapshot().state).toBe('INNINGS_BREAK');
  });

  it('a finished match hands over to the result exactly as the server says', async () => {
    const { controller, completed } = setup(
      makeFlow({ stage: 'completed', started: true }),
    );
    await controller.load();
    expect(controller.getSnapshot().state).toBe('MATCH_COMPLETE');
    expect(completed).toHaveLength(1);
  });

  it('follows the live match through the break and the chase, and ignores stale reports', async () => {
    const { controller, completed } = setup(
      makeFlow({ stage: 'in_progress', started: true }),
    );
    await controller.load();
    controller.onLiveState({ phase: 'innings_break', inningsNumber: 1 });
    expect(controller.getSnapshot().state).toBe('INNINGS_BREAK');
    controller.onLiveState({ phase: 'ready_to_bowl', inningsNumber: 2 });
    expect(controller.getSnapshot().state).toBe('INNINGS_2');
    controller.onLiveState({ phase: 'ready_to_bowl', inningsNumber: 1 }); // stale
    expect(controller.getSnapshot().state).toBe('INNINGS_2');
    controller.onLiveState({ phase: 'completed', inningsNumber: 2 });
    expect(controller.getSnapshot().state).toBe('MATCH_COMPLETE');
    expect(completed).toHaveLength(1);
    controller.showResults();
    expect(controller.getSnapshot().state).toBe('RESULTS');
  });

  it('Save & exit leaves once and records it; a destroyed controller ignores late replies', async () => {
    const { controller, events, exited, api } = setup(
      makeFlow({ stage: 'in_progress', started: true }),
    );
    await controller.load();
    controller.exit();
    expect(controller.getSnapshot().state).toBe('EXITING');
    expect(exited()).toBe(1);
    expect(events).toContain('match_exited');

    const late = setup();
    let release!: (f: MatchFlowDto) => void;
    late.api.flow.mockImplementation(
      () => new Promise<MatchFlowDto>((r) => (release = r)),
    );
    const loading = late.controller.load();
    late.controller.destroy();
    release(makeFlow());
    await loading;
    expect(late.controller.getSnapshot().flow).toBeNull();
    void api;
  });

  it('survives React StrictMode (destroy then activate) and loads again', async () => {
    const { controller, api } = setup();
    controller.activate();
    controller.destroy();
    controller.activate();
    await controller.load();
    expect(controller.getSnapshot().status).toBe('ready');
    expect(api.flow).toHaveBeenCalled();
  });
});
