'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { EmptyState, SectionHeader, StatCard } from '@the-cricketer/ui';
import type { TrainingHubDto } from '@the-cricketer/shared-types';
import { useCareerData } from '../../career/hooks/use-career-data';
import {
  LoadError,
  PageSkeleton,
  RedirectToCreation,
  RequirePlayer,
} from '../../career/components/primitives';
import { trainingClient } from '../api/training-client';
import { FatigueMeter } from './parts';
import { TrainingCard } from './training-card';
import { xpText } from '../utils/format';

type Category = TrainingHubDto['categories'][number]['category'];

function Hub({ hub }: { hub: TrainingHubDto }) {
  const startCategory: Category =
    hub.categories.find((c) => c.drills.some((d) => d.recommended))?.category ??
    'batting';
  const [tab, setTab] = useState<Category>(startCategory);
  const current =
    hub.categories.find((c) => c.category === tab) ?? hub.categories[0]!;
  const r = hub.readiness;
  const rec = hub.recommendation;
  const { development: dev } = hub;
  return (
    <div className="stack career-page">
      <h1 className="page-title">Training</h1>
      <div className="career-grid">
        <div className="career-col">
          <section className="panel" aria-labelledby="ready-h">
            <SectionHeader id="ready-h">Player readiness</SectionHeader>
            <FatigueMeter fatigue={r.fatigue} state={r.state} />
            <dl className="stat-grid" style={{ marginTop: 'var(--space-3)' }}>
              <StatCard
                label="Effectiveness"
                value={`${r.efficiencyPercent}%`}
                hint={r.blocked ? 'Drills blocked' : 'Right now'}
              />
              <StatCard label="Drills today" value={r.drillsToday} />
              <StatCard
                label="Coins"
                value={hub.player.coins.toLocaleString('en-US')}
              />
              <StatCard
                label="Level"
                value={hub.player.level}
                hint={
                  hub.player.isMaxLevel
                    ? 'MAX'
                    : xpText(hub.player.xp, hub.player.xpToNext)
                }
              />
            </dl>
            {r.message ? (
              <p
                className={r.blocked ? 'alert' : 'notice'}
                role="status"
                style={{ marginTop: 'var(--space-3)' }}
              >
                {r.message}
              </p>
            ) : null}
          </section>
          {rec ? (
            <section className="panel next-match" aria-labelledby="rec-h">
              <SectionHeader id="rec-h">Recommended training</SectionHeader>
              <strong style={{ fontSize: '1.3rem' }}>{rec.name}</strong>
              <p className="hint">{rec.explanation}</p>
              <div className="actions">
                <Link
                  className="button button-primary button-large"
                  href={`/training/${rec.trainingId}`}
                  onClick={() =>
                    trainingClient.track({
                      event: 'training_selected',
                      trainingId: rec.trainingId,
                    })
                  }
                >
                  {rec.reason === 'recover_first' ? 'REST' : 'TRAIN'}
                </Link>
              </div>
            </section>
          ) : null}
        </div>
        <div className="career-col">
          <section className="panel" aria-labelledby="dev-h">
            <SectionHeader
              id="dev-h"
              action={<Link href="/training/history">History</Link>}
            >
              Development
            </SectionHeader>
            <dl className="stat-grid">
              <StatCard
                label="Batting"
                value={dev.overall.batting}
                hint="Overall"
              />
              <StatCard
                label="Bowling"
                value={dev.overall.bowling || '—'}
                hint="Overall"
              />
              <StatCard
                label="Physical"
                value={dev.overall.physical}
                hint="Overall"
              />
            </dl>
            <p className="hint" style={{ marginTop: 'var(--space-2)' }}>
              This week: {dev.week.sessions}{' '}
              {dev.week.sessions === 1 ? 'session' : 'sessions'}
              {dev.week.rests ? `, ${dev.week.rests} rest` : ''}
              {dev.week.improvements.length
                ? ` · ${dev.week.improvements.map((i) => `${i.label} +${i.points}`).join(', ')}`
                : ''}
            </p>
            {hub.lastSession ? (
              <p className="hint">Last: {hub.lastSession.name}</p>
            ) : null}
          </section>
          <section className="panel" aria-labelledby="rest-h">
            <SectionHeader id="rest-h">Recovery</SectionHeader>
            <p className="hint">{hub.recovery.description}</p>
            <Link
              className={
                hub.recovery.available ? 'button' : 'button is-disabled'
              }
              href={`/training/${hub.recovery.id}`}
              onClick={() =>
                trainingClient.track({
                  event: 'training_selected',
                  trainingId: hub.recovery.id,
                })
              }
            >
              {hub.recovery.available
                ? `REST · recovers about ${hub.recovery.expected.fatigueRecovered} fatigue`
                : 'You are fully rested'}
            </Link>
          </section>
        </div>
      </div>

      <section aria-labelledby="drills-h" className="stack">
        <h2 id="drills-h" className="sr-only">
          Drills
        </h2>
        <div
          role="tablist"
          aria-label="Training categories"
          className="slot-tabs"
        >
          {hub.categories.map((c) => (
            <button
              key={c.category}
              type="button"
              role="tab"
              id={`tab-${c.category}`}
              aria-selected={tab === c.category}
              aria-controls="drill-panel"
              className={
                tab === c.category
                  ? 'button slot-tab is-active'
                  : 'button slot-tab'
              }
              onClick={() => setTab(c.category)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div id="drill-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {current.drills.length ? (
            <ul className="drill-grid list-plain">
              {current.drills.map((d) => (
                <TrainingCard key={d.id} drill={d} />
              ))}
            </ul>
          ) : (
            <EmptyState title="No drills here yet." />
          )}
        </div>
      </section>
    </div>
  );
}

function Content() {
  const { state, retry } = useCareerData(() => trainingClient.getHub());
  const viewed = useRef(false);
  useEffect(() => {
    if (state.status === 'ready' && !viewed.current) {
      viewed.current = true;
      trainingClient.track({ event: 'training_hub_viewed' });
    }
  }, [state.status]);
  if (state.status === 'loading') return <PageSkeleton />;
  if (state.status === 'missing') return <RedirectToCreation />;
  if (state.status === 'error')
    return <LoadError onRetry={retry} what="training" />;
  return <Hub hub={state.data} />;
}

/** /training: choose what to work on. One request renders the whole hub. */
export const TrainingHub = () => (
  <RequirePlayer>
    <Content />
  </RequirePlayer>
);
