import { canFlowTransition, flowStateFor } from '@the-cricketer/game-core';
import type { MatchFlowState } from '@the-cricketer/game-core';
import type { MatchFlowDto } from '@the-cricketer/shared-types';
import type { MatchFlowApi } from '../api/match-flow-client';

export interface FlowError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface MatchFlowSnapshot {
  readonly version: number;
  readonly state: MatchFlowState;
  readonly status: 'loading' | 'ready' | 'error';
  readonly flow: MatchFlowDto | null;
  readonly error: FlowError | null;
  /** A toss request is in flight. */
  readonly busy: boolean;
  readonly teamSheetSeen: boolean;
}

export interface MatchFlowDeps {
  readonly api: MatchFlowApi;
  readonly matchId: string;
  /** Fire-and-forget funnel events (never throws). */
  readonly track?: (event: string, detail?: string) => void;
  /** The match is complete: go to the result. */
  readonly onCompleted?: (matchId: string) => void;
  /** The player leaves (Save & Exit): go to the career. */
  readonly onExit?: () => void;
}

const RETRYABLE = new Set(['NETWORK_ERROR', 'INVALID_RESPONSE']);

function toError(error: unknown): FlowError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'UNKNOWN_ERROR';
  const message =
    code === 'NETWORK_ERROR'
      ? 'The connection dropped. Nothing was lost; try again.'
      : error instanceof Error && error.message
        ? error.message
        : 'Something went wrong.';
  return { code, message, retryable: RETRYABLE.has(code) };
}

/**
 * Drives one match through its stages (Module 11 section 4). It is the only place that decides which screen the
 * match is on: the SERVER's stage (toss, toss decision, in progress, innings break, completed) plus the one thing
 * only the browser knows (whether the team sheet has been looked at) map to an explicit state, and only the legal
 * moves in `canFlowTransition` are taken. It contains no cricket and no Phaser: the live match is played by
 * MatchGameplayController and reports back through `onLiveState`.
 */
export class MatchFlowController {
  private state: MatchFlowState = 'RESUMING';
  private status: MatchFlowSnapshot['status'] = 'loading';
  private flow: MatchFlowDto | null = null;
  private error: FlowError | null = null;
  private busy = false;
  private teamSheetSeen = false;
  private version = 0;
  private disposed = false;
  private cached: MatchFlowSnapshot | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: MatchFlowDeps) {}

  // ---- state access ------------------------------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private touch(): void {
    this.version++;
    this.cached = null;
    for (const listener of [...this.listeners]) listener();
  }
  getSnapshot = (): MatchFlowSnapshot => {
    this.cached ??= {
      version: this.version,
      state: this.state,
      status: this.status,
      flow: this.flow,
      error: this.error,
      busy: this.busy,
      teamSheetSeen: this.teamSheetSeen,
    };
    return this.cached;
  };

  // ---- transitions ---------------------------------------------------------------------------------

  /** Move to `next` if the flow allows it from here; anything else is ignored (a stale event can never skip a stage). */
  private go(next: MatchFlowState): boolean {
    if (next === this.state) return true;
    if (!canFlowTransition(this.state, next)) return false;
    this.state = next;
    return true;
  }

  /** Map the server's view of the match to a flow state, passing through the legal route to it. */
  private settle(flow: MatchFlowDto, inningsNumber: number | null): void {
    this.flow = flow;
    const target = flowStateFor({
      stage: flow.stage,
      inningsNumber,
      teamSheetSeen: this.teamSheetSeen,
    });
    // a load or a refresh may land anywhere; later moves must be legal
    if (this.state === 'RESUMING' || !this.go(target)) this.state = target;
    if (this.state === 'MATCH_COMPLETE')
      this.deps.onCompleted?.(this.deps.matchId);
  }

  async load(): Promise<void> {
    this.status = 'loading';
    this.touch();
    try {
      const flow = await this.deps.api.flow(this.deps.matchId);
      if (this.disposed) return;
      this.error = null;
      this.status = 'ready';
      this.settle(flow, flow.stage === 'in_progress' ? 1 : null);
      if (this.state === 'TEAM_SHEET') this.deps.track?.('team_sheet_viewed');
    } catch (error) {
      if (this.disposed) return;
      this.status = 'error';
      this.error = toError(error);
    }
    this.touch();
  }

  /** TEAM_SHEET -> TOSS: the player has seen both sides. */
  acknowledgeTeamSheet(): void {
    if (this.state !== 'TEAM_SHEET') return;
    this.teamSheetSeen = true;
    this.go('TOSS');
    this.touch();
  }

  /** Make the toss. Idempotent on the server, so a retry after a dropped connection is always safe. */
  async callToss(call?: 'heads' | 'tails'): Promise<boolean> {
    if (this.busy || !this.flow || this.state !== 'TOSS') return false;
    return this.run(async () => {
      const flow = await this.deps.api.callToss(this.deps.matchId, {
        ...(call ? { call } : {}),
      });
      // the toss result stays on screen (the TOSS state) until the player continues from it
      this.flow = flow;
    });
  }

  /** TOSS -> TOSS_DECISION (you won) or the first innings (the AI won and has chosen). */
  continueFromToss(): void {
    if (this.state !== 'TOSS' || !this.flow?.toss.call) return;
    if (this.flow.started) {
      this.go('INNINGS_1_SETUP');
      this.settle(this.flow, 1);
    } else this.go('TOSS_DECISION');
    this.touch();
  }

  async decide(decision: 'bat' | 'bowl'): Promise<boolean> {
    if (this.busy || !this.flow || this.state !== 'TOSS_DECISION') return false;
    return this.run(async () => {
      const flow = await this.deps.api.decide(this.deps.matchId, { decision });
      this.flow = flow;
      this.go('INNINGS_1_SETUP');
      this.settle(flow, 1);
    });
  }

  private async run(work: () => Promise<void>): Promise<boolean> {
    this.busy = true;
    this.error = null;
    this.touch();
    try {
      await work();
      return true;
    } catch (error) {
      if (!this.disposed) this.error = toError(error);
      return false;
    } finally {
      this.busy = false;
      if (!this.disposed) this.touch();
    }
  }

  /**
   * The live match reports where it is: which innings is on, whether it is at the break or over. This only moves the
   * flow along the legal route, so a stale report cannot take it backwards.
   */
  onLiveState(live: {
    readonly phase: string;
    readonly inningsNumber: number;
  }): void {
    const next: MatchFlowState =
      live.phase === 'completed'
        ? 'MATCH_COMPLETE'
        : live.phase === 'innings_break'
          ? 'INNINGS_BREAK'
          : live.inningsNumber <= 1
            ? 'INNINGS_1'
            : 'INNINGS_2';
    if (next === this.state) return;
    if (!this.go(next)) {
      // starting the second innings goes through its setup
      if (next === 'INNINGS_2' && this.go('INNINGS_2_SETUP'))
        this.go('INNINGS_2');
      else return;
    }
    if (this.state === 'MATCH_COMPLETE')
      this.deps.onCompleted?.(this.deps.matchId);
    this.touch();
  }

  /** MATCH_COMPLETE -> RESULTS: the result screen is showing. */
  showResults(): void {
    if (this.go('RESULTS')) this.touch();
  }

  /** Save & Exit: the match is already saved between balls; this only leaves the screen. */
  exit(): void {
    if (this.go('EXITING')) {
      this.deps.track?.('match_exited');
      this.deps.onExit?.();
      this.touch();
    }
  }

  activate(): void {
    this.disposed = false;
  }
  destroy(): void {
    this.disposed = true;
  }
}
