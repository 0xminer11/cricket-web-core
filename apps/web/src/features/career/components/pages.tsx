'use client';

import { matchClient } from '../../match/api';
import { StartMatch } from '../../match/components/start-match';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { EmptyState, ProgressBar, SectionHeader } from '@the-cricketer/ui';
import { careerClient } from '../api/career-client';
import type { FixtureFilter } from '../api/career-client';
import { useCareerData } from '../hooks/use-career-data';
import { usePaged } from '../hooks/use-paged';
import { FixtureRow } from './fixture-row';
import { TierPath } from './home-cards';
import {
  CareerSubNav,
  LoadError,
  PageSkeleton,
  RedirectToCreation,
  RequirePlayer,
} from './primitives';
import {
  formatCount,
  formatDate,
  formatDateTime,
  percent,
  relativeDay,
  roleName,
} from '../utils/format';

/** Wrapper for the data pages: guard + loading / error / missing handling in one place. */
export function DataPage<T>({
  title,
  what,
  load,
  subnav = true,
  children,
}: {
  title: string;
  what: string;
  load: () => Promise<T>;
  subnav?: boolean;
  children: (data: T) => ReactNode;
}) {
  const { state, retry } = useCareerData(load);
  return (
    <div className="stack career-page">
      <h1 className="page-title">{title}</h1>
      {subnav ? <CareerSubNav /> : null}
      {state.status === 'loading' ? <PageSkeleton /> : null}
      {state.status === 'missing' ? <RedirectToCreation /> : null}
      {state.status === 'error' ? (
        <LoadError onRetry={retry} what={what} />
      ) : null}
      {state.status === 'ready' ? children(state.data) : null}
    </div>
  );
}

// ---- fixtures ---------------------------------------------------------------------------------

function FixturesContent() {
  const [filter, setFilter] = useState<FixtureFilter>('upcoming');
  const paged = usePaged(filter, (cursor) =>
    careerClient.getFixtures(filter, cursor),
  );
  const tracked = useRef(false);
  useEffect(() => {
    if (!tracked.current) {
      tracked.current = true;
      careerClient.track('fixture_list_opened');
    }
  }, []);
  return (
    <div className="stack career-page">
      <h1 className="page-title">Fixtures</h1>
      <CareerSubNav />
      <div className="actions" role="group" aria-label="Fixture filter">
        {(['upcoming', 'completed'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'button button-primary' : 'button'}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'upcoming' ? 'Upcoming' : 'Completed'}
          </button>
        ))}
      </div>
      {paged.status === 'loading' ? <PageSkeleton /> : null}
      {paged.status === 'error' ? (
        <LoadError onRetry={paged.retry} what="your fixtures" />
      ) : null}
      {paged.status === 'ready' ? (
        paged.items.length ? (
          <section className="panel" aria-label={`${filter} fixtures`}>
            <ul className="list-plain">
              {paged.items.map((f) => (
                <FixtureRow key={f.id} fixture={f} showResult />
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
                  {paged.loadingMore ? 'Loading…' : 'Show more'}
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <EmptyState
            title={
              filter === 'upcoming'
                ? 'No upcoming matches.'
                : 'No completed matches yet.'
            }
          >
            {filter === 'upcoming'
              ? 'Your next fixture will appear here when the schedule is generated.'
              : 'Matches you play will be listed here.'}
          </EmptyState>
        )
      ) : null}
    </div>
  );
}
export const FixturesPage = () => (
  <RequirePlayer>
    <FixturesContent />
  </RequirePlayer>
);

// ---- history ----------------------------------------------------------------------------------

function HistoryContent() {
  const paged = usePaged('history', (cursor) =>
    careerClient.getHistory(cursor),
  );
  const groups = new Map<string, typeof paged.items>();
  for (const e of paged.items) {
    const key = e.season ? `Season ${e.season}` : 'Career';
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return (
    <div className="stack career-page">
      <h1 className="page-title">Career history</h1>
      <CareerSubNav />
      {paged.status === 'loading' ? <PageSkeleton /> : null}
      {paged.status === 'error' ? (
        <LoadError onRetry={paged.retry} what="your history" />
      ) : null}
      {paged.status === 'ready' && !paged.items.length ? (
        <EmptyState title="Nothing here yet.">
          Milestones from your career will be recorded here.
        </EmptyState>
      ) : null}
      {[...groups].map(([label, entries]) => (
        <section key={label} className="panel" aria-label={label}>
          <SectionHeader>{label}</SectionHeader>
          <ol className="timeline">
            {entries.map((e) => (
              <li key={e.id}>
                <strong>{e.title}</strong>
                <br />
                <small className="hint">{formatDate(e.occurredAt)}</small>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {paged.hasMore ? (
        <button
          type="button"
          className="button"
          onClick={() => void paged.loadMore()}
          disabled={paged.loadingMore}
        >
          {paged.loadingMore ? 'Loading…' : 'Show older'}
        </button>
      ) : null}
    </div>
  );
}
export const HistoryPage = () => (
  <RequirePlayer>
    <HistoryContent />
  </RequirePlayer>
);

// ---- progression ------------------------------------------------------------------------------

export const ProgressionPage = () => (
  <RequirePlayer>
    <DataPage
      title="Career progression"
      what="your progression"
      load={() => careerClient.getProgression()}
    >
      {({ career: c, progression: p, guidance }) => (
        <div className="career-grid">
          <div className="career-col">
            <section className="panel" aria-labelledby="path-h">
              <SectionHeader id="path-h">Career path</SectionHeader>
              <TierPath tiers={c.tiers} />
              <p className="hint">
                You are in the <strong>{c.tierName}</strong> level
                {c.teamName ? ` with ${c.teamName}` : ''}. Season {c.season}.
              </p>
              <p>{guidance}</p>
            </section>
            <section className="panel" aria-labelledby="rep-h">
              <SectionHeader id="rep-h">Reputation</SectionHeader>
              <p>
                <strong>{c.reputation.toLocaleString('en-US')}</strong>{' '}
                reputation
              </p>
              {c.nextTier ? (
                <>
                  <ProgressBar
                    label={`Reputation toward ${c.nextTier.name}`}
                    current={c.reputation}
                    target={c.nextTier.minReputation}
                    valueText={`${c.reputation} of ${c.nextTier.minReputation} reputation toward ${c.nextTier.name}`}
                  />
                  <p className="hint">
                    {c.nextTier.name} selectors start to look at players from{' '}
                    {c.nextTier.minReputation} reputation.
                  </p>
                </>
              ) : (
                <p className="hint">You have reached the highest level.</p>
              )}
            </section>
          </div>
          <div className="career-col">
            <section className="panel" aria-labelledby="sel-h">
              <SectionHeader id="sel-h">Selector interest</SectionHeader>
              <p>
                <strong>
                  {percent(c.selectorInterest, c.selectorInterestMax)}%
                </strong>
              </p>
              <ProgressBar
                label="Selector interest"
                current={c.selectorInterest}
                target={c.selectorInterestMax}
                valueText={`${percent(c.selectorInterest, c.selectorInterestMax)}%`}
              />
              <p className="hint">
                Perform consistently to attract higher-level selectors.
              </p>
            </section>
            <section className="panel" aria-labelledby="now-h">
              <SectionHeader id="now-h">Right now</SectionHeader>
              <p>
                Level {p.level}
                {p.isMaxLevel ? ' (max)' : ''} · Form {p.form} ({p.formLabel}) ·{' '}
                {formatCount(c.fans)} fans
              </p>
            </section>
          </div>
        </div>
      )}
    </DataPage>
  </RequirePlayer>
);

// ---- objectives -------------------------------------------------------------------------------

export const ObjectivesPage = () => (
  <RequirePlayer>
    <DataPage
      title="Objectives"
      what="your objectives"
      load={() => careerClient.getObjectives()}
    >
      {({ active, completed }) => (
        <div className="career-grid">
          <section className="panel" aria-labelledby="active-h">
            <SectionHeader id="active-h">Active</SectionHeader>
            {active.length ? (
              active.map((o) => (
                <div key={o.id} className="objective-row">
                  <div className="objective-top">
                    <strong>{o.title}</strong>
                    <span className="hint">
                      {o.progress} / {o.target}
                    </span>
                  </div>
                  <p className="hint">{o.description}</p>
                  <ProgressBar
                    label={o.title}
                    current={o.progress}
                    target={o.target}
                    valueText={`${o.progress} of ${o.target}`}
                  />
                  <p className="hint">
                    Reward: {o.reward.coins} coins · {o.reward.xp} XP
                    {o.reward.fans ? ` · ${o.reward.fans} fans` : ''}
                    {o.reward.reputation
                      ? ` · ${o.reward.reputation} reputation`
                      : ''}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState title="All goals complete." />
            )}
          </section>
          <section className="panel" aria-labelledby="done-h">
            <SectionHeader id="done-h">Completed</SectionHeader>
            {completed.length ? (
              completed.map((o) => (
                <div key={o.id} className="objective-row">
                  <strong>{o.title}</strong>
                  <p className="hint">
                    {o.rewardClaimed ? 'Reward collected' : 'Completed'}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState title="Nothing completed yet.">
                Play matches and train to make progress.
              </EmptyState>
            )}
          </section>
        </div>
      )}
    </DataPage>
  </RequirePlayer>
);

// ---- events -----------------------------------------------------------------------------------

function EventsContent() {
  const paged = usePaged('events', (cursor) => careerClient.getEvents(cursor));
  return (
    <div className="stack career-page">
      <h1 className="page-title">Career events</h1>
      <CareerSubNav />
      {paged.status === 'loading' ? <PageSkeleton /> : null}
      {paged.status === 'error' ? (
        <LoadError onRetry={paged.retry} what="your events" />
      ) : null}
      {paged.status === 'ready' && !paged.items.length ? (
        <EmptyState title="No career events right now.">
          Coaches, media and selectors will get in touch as your career
          develops.
        </EmptyState>
      ) : null}
      {paged.items.length ? (
        <section className="panel" aria-label="Career events">
          <ul className="list-plain">
            {paged.items.map((e) => (
              <li key={e.id} className="fixture-row">
                <strong>
                  <Link href={`/career/events/${e.id}`}>{e.title}</Link>
                </strong>
                <small>
                  {e.status === 'pending'
                    ? 'Needs your attention'
                    : e.status === 'resolved'
                      ? 'Resolved'
                      : 'Closed'}{' '}
                  · {formatDate(e.triggeredAt)}
                </small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
export const EventsPage = () => (
  <RequirePlayer>
    <EventsContent />
  </RequirePlayer>
);

export const EventDetailPage = ({ id }: { id: string }) => (
  <RequirePlayer>
    <DataPage
      title="Career event"
      what="this event"
      load={() => careerClient.getEvent(id)}
      subnav={false}
    >
      {(e) => (
        <section className="panel" aria-labelledby="ev-h">
          <SectionHeader id="ev-h">{e.title}</SectionHeader>
          <p>{e.description}</p>
          <p className="hint">
            {e.status === 'pending' ? 'Options' : 'Outcome'}
          </p>
          <ul>
            {e.choices.map((c) => (
              <li key={c.id}>
                {c.label}
                {e.selectedChoiceId === c.id ? ' (chosen)' : ''}
              </li>
            ))}
          </ul>
          {e.status === 'pending' ? (
            <p className="hint" role="status">
              Responding to career events arrives in an upcoming update. You can
              read the options for now.
            </p>
          ) : null}
          <Link href="/career/events">Back to events</Link>
        </section>
      )}
    </DataPage>
  </RequirePlayer>
);

// ---- match preparation (placeholder for the Match module) --------------------------------------

/** Records that the preparation screen was seen (once per visit; a funnel event only, nothing is started). */
function PreparationViewed() {
  useEffect(() => {
    matchClient.track('match_preparation_viewed');
  }, []);
  return null;
}

export const MatchPreparationPage = () => (
  <RequirePlayer>
    <DataPage
      title="Match preparation"
      what="your match"
      load={() => careerClient.getHome()}
      subnav={false}
    >
      {(home) => {
        const m = home.nextMatch;
        return (
          <div className="career-grid">
            <PreparationViewed />
            <div className="career-col">
              <section className="panel next-match" aria-labelledby="prep-h">
                <SectionHeader id="prep-h">
                  {m ? 'Upcoming match' : 'No match scheduled'}
                </SectionHeader>
                {m ? (
                  <>
                    <div className="match-teams">
                      <div className="match-team">
                        <strong>{m.yourTeam.name}</strong>
                        <small>Your team</small>
                      </div>
                      <span className="match-vs" aria-label="versus">
                        VS
                      </span>
                      <div className="match-team">
                        <strong>{m.opponent.name}</strong>
                        <small>Rating {m.opponent.rating}</small>
                      </div>
                    </div>
                    <ul className="match-meta">
                      <li>
                        <strong>{m.competition.name}</strong>
                      </li>
                      <li>
                        <strong>{m.format.name}</strong>
                      </li>
                      <li>{m.venue.name}</li>
                      <li>
                        {formatDateTime(m.scheduledAt)} ·{' '}
                        {relativeDay(m.scheduledAt)}
                      </li>
                    </ul>
                    {m.pitch ? (
                      <p>
                        <strong>Pitch: {m.pitch.name}.</strong>{' '}
                        <span className="hint">{m.pitch.hint}</span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <EmptyState title="Your next fixture will appear here when the schedule is generated." />
                )}
              </section>
              {m ? (
                <section className="panel" aria-labelledby="start-h">
                  <SectionHeader id="start-h">Take the field</SectionHeader>
                  <p>
                    {m.format.name} at {m.venue.name}. Next come the team sheets
                    and the toss. Your Cricketer joins the side with your latest
                    skills, equipment and fatigue; training you do later never
                    changes a match already started.
                  </p>
                  <StartMatch
                    fixtureId={m.id}
                    resume={m.status === 'in_progress'}
                  />
                </section>
              ) : null}
            </div>
            <div className="career-col">
              <section className="panel" aria-labelledby="ready-h">
                <SectionHeader id="ready-h">Your readiness</SectionHeader>
                <p>
                  {roleName(home.player.primaryRole)} · OVR{' '}
                  {home.player.overall} · Level {home.progression.level}
                </p>
                <p>
                  Fatigue {home.progression.fatigue}% · Form{' '}
                  {home.progression.form} ({home.progression.formLabel})
                </p>
                {home.readiness.issues.length ? (
                  <ul className="issue-list">
                    {home.readiness.issues.map((i) => (
                      <li key={i.code}>{i.message}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">You are match ready.</p>
                )}
              </section>
              <section className="panel" aria-labelledby="gear-h">
                <SectionHeader id="gear-h">Equipped gear</SectionHeader>
                <p>
                  {home.equipped.bat?.name ?? 'No bat'} ·{' '}
                  {home.equipped.kit?.name ?? 'No kit'} ·{' '}
                  {home.equipped.equippedCount} items
                </p>
                <div className="actions">
                  <Link className="button" href="/dressing-room">
                    Dressing room
                  </Link>
                  <Link className="button" href="/career">
                    Back to career
                  </Link>
                </div>
              </section>
            </div>
          </div>
        );
      }}
    </DataPage>
  </RequirePlayer>
);
