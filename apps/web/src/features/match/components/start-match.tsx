'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClientError, matchClient } from '../api';

const MESSAGES: Record<string, string> = {
  FIXTURE_NOT_READY: 'This fixture is not ready to play.',
  MATCH_NOT_FOUND: 'That fixture could not be found.',
  NETWORK_ERROR: 'Could not reach the server. Try again.',
};

/**
 * Creates (or resumes) the match for a fixture on the server, then opens it. The server builds the
 * team snapshots from your latest attributes, equipment and fatigue; the browser sends only the
 * fixture it is looking at.
 */
export function StartMatch({
  fixtureId,
  resume,
}: {
  fixtureId: string;
  resume: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { matchId } = await matchClient.start(fixtureId);
      router.push(`/match/${matchId}`);
    } catch (e) {
      const code = e instanceof ApiClientError ? e.code : 'UNKNOWN';
      setError(MESSAGES[code] ?? 'The match could not be started. Try again.');
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <button
        type="button"
        className="button button-primary button-large"
        disabled={busy}
        onClick={() => void start()}
        data-testid="start-match"
      >
        {busy
          ? 'Opening…'
          : resume
            ? 'RESUME MATCH'
            : 'CONTINUE TO TEAM SHEETS'}
      </button>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
