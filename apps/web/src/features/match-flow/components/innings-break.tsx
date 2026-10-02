'use client';

import type { MatchPlayStateDto } from '@the-cricketer/shared-types';

/**
 * The innings is over: its score, the target, and what the other side needs. A tie shows "scores level" and goes to
 * a Super Over. All of it is read from the match state.
 */
export function InningsBreakScreen({
  match,
  busy,
  onContinue,
  onScorecard,
}: {
  match: MatchPlayStateDto;
  busy: boolean;
  onContinue: () => void;
  onScorecard: () => void;
}) {
  const done = match.innings;
  // an even-numbered innings that ends here can only be a chase that finished level: the Super Over decides it
  const level = done.number % 2 === 0;
  const target = done.runs + 1;
  const chasing = match.bowlingTeam;
  const label = done.isSuperOver ? 'Super Over' : 'Innings';
  return (
    <section
      className="phase-panel innings-break"
      aria-labelledby="break-h"
      data-testid="innings-break"
    >
      <p className="eyebrow">
        {level ? 'SCORES LEVEL' : `${label.toUpperCase()} COMPLETE`}
      </p>
      <h2 id="break-h">
        {match.battingTeam.name}{' '}
        <span data-testid="break-score">
          {done.runs}/{done.wickets}
        </span>
      </h2>
      <p className="hud-muted">{done.oversText} overs</p>
      {level ? (
        <p>
          <strong>It is a tie: a Super Over decides it.</strong>
        </p>
      ) : (
        <>
          <p className="break-target" data-testid="break-target">
            Target <strong>{target}</strong> runs
          </p>
          <p data-testid="break-need">
            {chasing.name} need {target} from {done.maxBalls} balls to win
          </p>
        </>
      )}
      <div className="preset-row">
        <button
          type="button"
          className="button"
          onClick={onScorecard}
          data-testid="break-scorecard"
        >
          VIEW SCORECARD
        </button>
        <button
          type="button"
          className="button button-primary button-large"
          disabled={busy}
          onClick={onContinue}
          data-testid="next-innings"
        >
          {busy
            ? 'Starting…'
            : level
              ? 'START THE SUPER OVER'
              : 'START THE CHASE'}
        </button>
      </div>
    </section>
  );
}
