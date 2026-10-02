'use client';

import type {
  BowlerOptionDto,
  MatchPlayStateDto,
} from '@the-cricketer/shared-types';
import type { MatchGameplayController } from '../core/gameplay-controller';
import type { ControllerSnapshot } from '../core/gameplay-controller';

export function BowlerSelect({
  controller,
  match,
  chosen,
  busy = false,
}: {
  controller: MatchGameplayController;
  match: MatchPlayStateDto;
  chosen: string | null;
  busy?: boolean;
}) {
  return (
    <section
      className="phase-panel"
      aria-labelledby="bowler-select-h"
      data-testid="bowler-select"
    >
      <h2 id="bowler-select-h">
        {match.overNumber
          ? `Over ${match.overNumber + 1}: choose your bowler`
          : 'Choose your opening bowler'}
      </h2>
      <ul className="bowler-list">
        {match.eligibleBowlers.map((b) => (
          <li key={b.playerId}>
            <button
              type="button"
              className={`bowler-card${chosen === b.playerId ? ' is-selected' : ''}`}
              disabled={!b.eligible}
              aria-pressed={chosen === b.playerId}
              onClick={() => controller.selectBowler(b.playerId)}
              data-bowler={b.playerId}
            >
              <BowlerCardBody b={b} />
            </button>
          </li>
        ))}
      </ul>
      <div className="preset-row">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void controller.simulate('over', chosen ?? undefined)}
          data-testid="simulate-over"
        >
          {chosen ? 'Simulate this over' : 'Simulate this over for me'}
        </button>
      </div>
    </section>
  );
}

function BowlerCardBody({ b }: { b: BowlerOptionDto }) {
  return (
    <>
      <span className="bc-name">
        {b.name}
        {b.isYou ? <span className="you-tag">You</span> : null}
      </span>
      <span className="bc-meta">
        {b.styleName} ·{' '}
        {b.kind === 'spin' ? `Spin ${b.skills.spin}` : `Pace ${b.skills.pace}`}{' '}
        · Accuracy {b.skills.accuracy}
      </span>
      <span className="bc-meta">
        {b.oversBowled}
        {b.maxOvers !== null ? `/${b.maxOvers}` : ''} overs · Fatigue{' '}
        {b.fatigue}%
      </span>
      {!b.eligible && b.reason ? (
        <span className="bc-reason">{b.reason}</span>
      ) : null}
    </>
  );
}

export function ErrorBanner({
  controller,
  snapshot,
}: {
  controller: MatchGameplayController;
  snapshot: ControllerSnapshot;
}) {
  const { error, notice } = snapshot;
  if (!error && !notice) return null;
  return (
    <div
      className={error ? 'match-alert is-error' : 'match-alert'}
      role={error ? 'alert' : 'status'}
    >
      <p>{error ? error.message : notice}</p>
      {error?.retryable ? (
        <button
          type="button"
          className="button"
          onClick={() =>
            controller.getSnapshot().mode === 'batting'
              ? controller.retryShot()
              : controller.retry()
          }
          data-testid="retry"
        >
          Try the same{' '}
          {controller.getSnapshot().mode === 'batting' ? 'shot' : 'delivery'}{' '}
          again
        </button>
      ) : null}
      {error ? (
        <button
          type="button"
          className="button"
          onClick={() => controller.dismissError()}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
