'use client';

import Link from 'next/link';
import type { MatchResultDto, ScorecardDto } from '@the-cricketer/shared-types';
import { useCareerData } from '../../career/hooks/use-career-data';
import {
  LoadError,
  PageSkeleton,
  RedirectToCreation,
  RequirePlayer,
} from '../../career/components/primitives';
import { ApiClientError } from '../../../services/api';
import { matchClient } from '../../match/api';
import { matchFlowClient } from '../api';
import { MatchResultScreen } from './match-result-screen';
import { ScorecardView } from './scorecard-view';

/** `null` = the match has not finished yet (there is no result to show). */
async function loadResult(matchId: string): Promise<MatchResultDto | null> {
  try {
    return await matchFlowClient.result(matchId);
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'INVALID_MATCH_STAGE')
      return null;
    throw error;
  }
}

function Result({ matchId }: { matchId: string }) {
  const data = useCareerData(() => loadResult(matchId), {
    refetchOnFocus: false,
  });
  if (data.state.status === 'loading') return <PageSkeleton />;
  if (data.state.status === 'missing') return <RedirectToCreation />;
  if (data.state.status === 'error')
    return <LoadError what="the match result" onRetry={data.retry} />;
  const result = data.state.data;
  if (!result)
    return (
      <div className="stack" data-testid="match-result">
        <section className="panel" aria-labelledby="not-done-h">
          <h1 id="not-done-h">This match is still in progress</h1>
          <Link
            className="button button-primary"
            href={`/match/${matchId}`}
            data-testid="resume-match"
          >
            Resume match
          </Link>
        </section>
      </div>
    );
  return <MatchResultScreen result={result} />;
}

export function MatchResultPage({ matchId }: { matchId: string }) {
  return (
    <RequirePlayer>
      <Result matchId={matchId} />
    </RequirePlayer>
  );
}

function Scorecard({ matchId }: { matchId: string }) {
  const data = useCareerData<ScorecardDto>(
    async () => {
      const card = await matchFlowClient.scorecard(matchId, true);
      matchClient.track('scorecard_viewed', 'result');
      return card;
    },
    { refetchOnFocus: false },
  );
  if (data.state.status === 'loading') return <PageSkeleton />;
  if (data.state.status === 'missing') return <RedirectToCreation />;
  if (data.state.status === 'error')
    return <LoadError what="the scorecard" onRetry={data.retry} />;
  return (
    <div className="stack" data-testid="scorecard-page">
      <h1>Scorecard</h1>
      <ScorecardView scorecard={data.state.data} />
      <div className="actions">
        <Link
          className="button"
          href={`/match/${matchId}/result`}
          data-testid="back-to-result"
        >
          Back to result
        </Link>
        <Link className="button button-primary" href="/career">
          CONTINUE
        </Link>
      </div>
    </div>
  );
}

export function MatchScorecardPage({ matchId }: { matchId: string }) {
  return (
    <RequirePlayer>
      <Scorecard matchId={matchId} />
    </RequirePlayer>
  );
}
