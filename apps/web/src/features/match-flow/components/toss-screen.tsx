'use client';

import type { MatchFlowDto } from '@the-cricketer/shared-types';
import type { FlowError } from '../controllers/match-flow-controller';

/** A coin that lands on the engine's result: the flip is decoration, the outcome was decided on the server. */
function Coin({
  face,
  flipping,
}: {
  face: 'heads' | 'tails' | null;
  flipping: boolean;
}) {
  return (
    <div
      className={`coin${flipping ? ' is-flipping' : ''}${face ? ` is-${face}` : ''}`}
      role="img"
      aria-label={face ? `The coin landed ${face}` : 'A coin, not yet tossed'}
      data-testid="coin"
      data-face={face ?? 'none'}
    >
      <span className="coin-face coin-heads">H</span>
      <span className="coin-face coin-tails">T</span>
    </div>
  );
}

export function TossScreen({
  flow,
  busy,
  error,
  reducedMotion,
  onCall,
  onContinue,
  onRetry,
}: {
  flow: MatchFlowDto;
  busy: boolean;
  error: FlowError | null;
  reducedMotion: boolean;
  onCall: (call?: 'heads' | 'tails') => void;
  onContinue: () => void;
  onRetry: () => void;
}) {
  const toss = flow.toss;
  const called = toss.call !== null;
  return (
    <div className="flow-screen stack" data-testid="toss">
      <header className="flow-head">
        <p className="eyebrow">TOSS</p>
        <h1>
          {called
            ? toss.youWon
              ? 'You won the toss'
              : `${toss.winnerName} won the toss`
            : 'The toss'}
        </h1>
        <p className="hint">
          {flow.format.name} · {flow.pitch.name} pitch
        </p>
      </header>
      <section className="panel toss-panel" aria-live="polite">
        <Coin face={toss.coin} flipping={called && !reducedMotion} />
        {!called ? (
          toss.youCall ? (
            <>
              <p className="toss-line">
                <strong>{toss.callerName}</strong> call. Heads or tails?
              </p>
              <div
                className="actions toss-actions"
                role="group"
                aria-label="Call the toss"
              >
                <button
                  type="button"
                  className="button button-primary button-large"
                  disabled={busy}
                  onClick={() => onCall('heads')}
                  data-testid="toss-heads"
                >
                  HEADS
                </button>
                <button
                  type="button"
                  className="button button-primary button-large"
                  disabled={busy}
                  onClick={() => onCall('tails')}
                  data-testid="toss-tails"
                >
                  TAILS
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="toss-line">
                <strong>{toss.callerName}</strong> will call. Flip the coin.
              </p>
              <div className="actions toss-actions">
                <button
                  type="button"
                  className="button button-primary button-large"
                  disabled={busy}
                  onClick={() => onCall()}
                  data-testid="toss-flip"
                >
                  {busy ? 'Flipping…' : 'FLIP THE COIN'}
                </button>
              </div>
            </>
          )
        ) : (
          <>
            <p className="toss-line" data-testid="toss-result">
              {toss.youWon ? (
                <strong>YOU WON THE TOSS</strong>
              ) : (
                <strong>{toss.winnerName?.toUpperCase()} WON THE TOSS</strong>
              )}
            </p>
            <p className="hint">
              {toss.callerName} called {toss.call}; it landed {toss.coin}.
              {toss.decision && toss.decidedBy === 'ai'
                ? ` ${toss.winnerName} chose to ${toss.decision} first.`
                : ''}
            </p>
            <div className="actions toss-actions">
              <button
                type="button"
                className="button button-primary button-large"
                onClick={onContinue}
                data-testid="toss-continue"
              >
                {toss.youWon ? 'CHOOSE BAT OR BOWL' : 'START THE MATCH'}
              </button>
            </div>
          </>
        )}
        {error ? (
          <div className="alert" role="alert">
            <p>{error.message}</p>
            {error.retryable ? (
              <button type="button" className="button" onClick={onRetry}>
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function TossDecisionScreen({
  flow,
  busy,
  error,
  onDecide,
}: {
  flow: MatchFlowDto;
  busy: boolean;
  error: FlowError | null;
  onDecide: (decision: 'bat' | 'bowl') => void;
}) {
  return (
    <div className="flow-screen stack" data-testid="toss-decision">
      <header className="flow-head">
        <p className="eyebrow">TOSS</p>
        <h1>You won the toss</h1>
        <p className="hint">
          Choose how to start. This cannot be changed once the match begins.
        </p>
      </header>
      <section className="panel toss-panel">
        <p className="toss-line">
          <strong>{flow.pitch.name.toUpperCase()} PITCH</strong>
        </p>
        <p className="hint">{flow.pitch.hint}</p>
        <div
          className="actions toss-actions"
          role="group"
          aria-label="Bat or bowl first"
        >
          <button
            type="button"
            className="button button-primary button-large"
            disabled={busy}
            onClick={() => onDecide('bat')}
            data-testid="bat-first"
          >
            BAT FIRST
          </button>
          <button
            type="button"
            className="button button-primary button-large"
            disabled={busy}
            onClick={() => onDecide('bowl')}
            data-testid="bowl-first"
          >
            BOWL FIRST
          </button>
        </div>
        {error ? (
          <p className="alert" role="alert">
            {error.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
