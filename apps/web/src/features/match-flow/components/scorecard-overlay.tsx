'use client';

import { useEffect, useRef, useState } from 'react';
import type { ScorecardDto } from '@the-cricketer/shared-types';
import { matchFlowClient } from '../api';
import { ScorecardView } from './scorecard-view';

/** The live scorecard, opened over the match. The match is paused by the caller while it is open. */
export function ScorecardOverlay({
  matchId,
  onClose,
}: {
  matchId: string;
  onClose: () => void;
}) {
  const [card, setCard] = useState<ScorecardDto | null>(null);
  const [error, setError] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let cancelled = false;
    matchFlowClient
      .scorecard(matchId)
      .then((c) => !cancelled && setCard(c))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [matchId]);
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Scorecard"
      data-testid="scorecard-overlay"
    >
      <div className="overlay-card">
        <div className="overlay-bar">
          <h2>Scorecard</h2>
          <button
            ref={close}
            type="button"
            className="button"
            onClick={onClose}
            data-testid="scorecard-close"
          >
            Close
          </button>
        </div>
        {error ? (
          <p className="alert" role="alert">
            The scorecard could not be loaded.
          </p>
        ) : card ? (
          <ScorecardView scorecard={card} />
        ) : (
          <p role="status">Loading the scorecard…</p>
        )}
      </div>
    </div>
  );
}
