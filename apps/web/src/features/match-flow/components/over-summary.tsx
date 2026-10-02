'use client';

import { useEffect, useRef } from 'react';
import type { OverSummaryDto } from '@the-cricketer/shared-types';

/** The short end-of-over card: the score, the over ball by ball, the bowler's figures and who is in. Dismissed at once with Continue. */
export function OverSummaryCard({
  summary,
  onContinue,
}: {
  summary: OverSummaryDto;
  onContinue: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <section
      className="over-summary-card"
      role="dialog"
      aria-modal="false"
      aria-label={`End of over ${summary.overNumber}`}
      data-testid="over-summary-card"
    >
      <p className="eyebrow">END OF OVER {summary.overNumber}</p>
      <p className="os-score">{summary.score}</p>
      <p className="hint">This over</p>
      <ol className="hud-over" aria-label="This over">
        {summary.balls.map((b, i) => (
          <li
            key={i}
            className={
              b.wicket ? 'is-wicket' : b.runs >= 4 ? 'is-boundary' : ''
            }
            aria-label={b.label === '•' ? 'dot ball' : b.label}
          >
            {b.label}
          </li>
        ))}
      </ol>
      <p>
        <strong>{summary.bowlerName}</strong>{' '}
        <span className="hud-muted">{summary.bowlerFigures}</span>
      </p>
      <p className="hint">
        {[summary.striker, summary.nonStriker].filter(Boolean).join(' · ')}
      </p>
      {summary.chase ? (
        <p>
          <strong>{summary.chase}</strong>
        </p>
      ) : null}
      <button
        ref={button}
        type="button"
        className="button button-primary"
        onClick={onContinue}
        data-testid="over-summary-continue"
      >
        Continue
      </button>
    </section>
  );
}
