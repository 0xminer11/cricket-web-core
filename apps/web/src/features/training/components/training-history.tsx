'use client';

import Link from 'next/link';
import { EmptyState, SectionHeader } from '@the-cricketer/ui';
import { usePaged } from '../../career/hooks/use-paged';
import {
  LoadError,
  PageSkeleton,
  RequirePlayer,
} from '../../career/components/primitives';
import { trainingClient } from '../api/training-client';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

function Content() {
  const paged = usePaged('training-history', (cursor) =>
    trainingClient.getHistory(cursor),
  );
  return (
    <div className="stack career-page">
      <h1 className="page-title">Training history</h1>
      {paged.status === 'loading' ? <PageSkeleton /> : null}
      {paged.status === 'error' ? (
        <LoadError onRetry={paged.retry} what="your history" />
      ) : null}
      {paged.status === 'ready' && !paged.items.length ? (
        <EmptyState
          title="No training yet."
          action={
            <Link className="button button-primary" href="/training">
              Start training
            </Link>
          }
        >
          Your completed sessions will appear here.
        </EmptyState>
      ) : null}
      {paged.items.length ? (
        <section className="panel" aria-label="Completed sessions">
          <SectionHeader>Recent sessions</SectionHeader>
          <ul className="list-plain">
            {paged.items.map((s) => (
              <li key={s.sessionId} className="fixture-row">
                <strong>{s.name}</strong>
                <small>
                  {s.kind === 'recovery'
                    ? `Fatigue ${s.fatigue.before} → ${s.fatigue.after}`
                    : s.skills
                        .map((k) =>
                          k.valueAfter > k.valueBefore
                            ? `${k.label} XP +${k.xpGained} (${k.valueBefore} → ${k.valueAfter})`
                            : `${k.label} XP +${k.xpGained}`,
                        )
                        .join(' · ')}
                </small>
                <small>
                  {day(s.completedAt)}
                  {s.playerXpGained ? ` · Player XP +${s.playerXpGained}` : ''}
                  {s.levelUps ? ` · Level up!` : ''}
                  {s.coinsSpent ? ` · ${s.coinsSpent} coins` : ''}
                </small>
              </li>
            ))}
          </ul>
          {paged.hasMore ? (
            <div className="actions" style={{ marginTop: 'var(--space-3)' }}>
              <button
                type="button"
                className="button"
                onClick={() => void paged.loadMore()}
                disabled={paged.loadingMore}
              >
                {paged.loadingMore ? 'Loading…' : 'Show older'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      <Link href="/training">Back to training</Link>
    </div>
  );
}

export const TrainingHistory = () => (
  <RequirePlayer>
    <Content />
  </RequirePlayer>
);
