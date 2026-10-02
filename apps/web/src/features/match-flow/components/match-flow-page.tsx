'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { RequirePlayer } from '../../career/components/primitives';
import { MatchView } from '../../match/components/match-view';
import { usePrefersReducedMotion } from '../../match/hooks/use-match-controller';
import { useMatchFlow } from '../hooks/use-match-flow';
import { useMatchSettings } from '../state/settings';
import { TeamSheetScreen } from './team-sheet';
import { TossDecisionScreen, TossScreen } from './toss-screen';

/**
 * `/match/[matchId]`: the one screen a match lives on. The MatchFlowController decides the stage (team sheets, toss,
 * toss decision, then the live match) from the server's state; this only draws it. Refreshing at any stage lands on
 * the same stage, because the stage comes from the server.
 */
function MatchFlow({ matchId }: { matchId: string }) {
  const { controller, snapshot } = useMatchFlow(matchId);
  const { settings } = useMatchSettings();
  const systemReduced = usePrefersReducedMotion();
  const reduced =
    settings.reducedMotion === 'system'
      ? systemReduced
      : settings.reducedMotion === 'on';
  const onLive = useCallback(
    (live: { phase: string; inningsNumber: number }) =>
      controller.onLiveState(live),
    [controller],
  );
  const onExit = useCallback(() => controller.exit(), [controller]);

  const { state, flow } = snapshot;
  if (snapshot.status === 'error' && !flow)
    return (
      <div className="stack flow-screen" role="alert">
        <p className="alert">
          {snapshot.error?.message ?? 'The match could not be loaded.'}
        </p>
        <button
          type="button"
          className="button"
          onClick={() => void controller.load()}
        >
          Try again
        </button>
        <Link className="button" href="/career">
          Back to career
        </Link>
      </div>
    );
  if (!flow)
    return (
      <p className="flow-screen" role="status" data-testid="match-loading">
        Loading the match…
      </p>
    );

  if (state === 'TEAM_SHEET')
    return (
      <TeamSheetScreen
        flow={flow}
        onContinue={() => controller.acknowledgeTeamSheet()}
      />
    );
  if (state === 'TOSS')
    return (
      <TossScreen
        flow={flow}
        busy={snapshot.busy}
        error={snapshot.error}
        reducedMotion={reduced}
        onCall={(call) => void controller.callToss(call)}
        onContinue={() => controller.continueFromToss()}
        onRetry={() => void controller.callToss()}
      />
    );
  if (state === 'TOSS_DECISION')
    return (
      <TossDecisionScreen
        flow={flow}
        busy={snapshot.busy}
        error={snapshot.error}
        onDecide={(decision) => void controller.decide(decision)}
      />
    );
  if (state === 'MATCH_COMPLETE' || state === 'RESULTS')
    return (
      <p className="flow-screen" role="status" data-testid="match-finishing">
        The match is over. Opening the result…
      </p>
    );
  // the live match (innings, break): the existing scene and controls
  return (
    <MatchView
      matchId={matchId}
      firstMatch={flow.firstMatch}
      onLiveState={onLive}
      onExit={onExit}
    />
  );
}

export function MatchFlowPage({ matchId }: { matchId: string }) {
  return (
    <RequirePlayer>
      <MatchFlow matchId={matchId} />
    </RequirePlayer>
  );
}
