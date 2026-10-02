'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  EmptyState,
  ProgressBar,
  SectionHeader,
  StatCard,
} from '@the-cricketer/ui';
import type { CareerHomeDto } from '@the-cricketer/shared-types';
import { careerClient } from '../api/career-client';
import { FixtureRow } from './fixture-row';
import { CareerPortrait, TrackedLink } from './primitives';
import {
  formatCount,
  formatDateTime,
  formatRatio,
  percent,
  relativeDay,
  resultLabel,
  roleName,
} from '../utils/format';

type Home = CareerHomeDto;

export function PlayerHeader({ home }: { home: Home }) {
  const { player, progression, career } = home;
  const xpText = progression.isMaxLevel
    ? 'MAX LEVEL'
    : `${progression.xp.toLocaleString('en-US')} / ${(progression.xpToNext ?? 0).toLocaleString('en-US')} XP`;
  return (
    <section className="player-header" aria-labelledby="player-name">
      <TrackedLink
        href="/player"
        event="player_profile_opened"
        className="portrait-link"
        ariaLabel={`Open ${player.displayName}'s profile`}
      >
        <CareerPortrait portrait={player.portrait} label="" />
      </TrackedLink>
      <div style={{ minWidth: 0 }}>
        <h1 id="player-name" className="player-name">
          {player.displayName}
        </h1>
        <p className="player-role">{roleName(player.primaryRole)}</p>
        <div className="chip-row">
          <span className="chip chip-ovr">
            <small>OVR</small> {player.overall}
          </span>
          <span className="chip">
            <small>LVL</small> {progression.level}
          </span>
        </div>
        <p className="player-role">
          {career.teamName ?? 'Free agent'} · {career.tierName}
        </p>
      </div>
      <div className="header-xp">
        <div className="xp-line">
          <span>
            {progression.isMaxLevel
              ? 'Level cap reached'
              : `Level ${progression.level}`}
          </span>
          <span>{xpText}</span>
        </div>
        <ProgressBar
          label="Experience this level"
          current={progression.isMaxLevel ? 1 : progression.xp}
          target={progression.isMaxLevel ? 1 : (progression.xpToNext ?? 1)}
          valueText={xpText}
        />
      </div>
    </section>
  );
}

export function CurrencyRow({
  currencies,
}: {
  currencies: Home['currencies'];
}) {
  return (
    <section className="panel" aria-label="Currencies">
      <ul className="currency-row">
        {currencies.map((c) => (
          <li
            key={c.code}
            className="currency"
            title={`${c.balance.toLocaleString('en-US')} ${c.name}`}
          >
            <strong>{formatCount(c.balance, 100_000)}</strong>
            <span>{c.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReadinessBadge({
  readiness,
}: {
  readiness: Home['readiness'];
}) {
  const label =
    readiness.status === 'ready'
      ? 'Match ready'
      : readiness.status === 'caution'
        ? 'Check readiness'
        : 'Not ready';
  return (
    <span className={`readiness is-${readiness.status}`}>
      <span aria-hidden="true">{readiness.status === 'ready' ? '✓' : '!'}</span>
      {label}
    </span>
  );
}

export function NextMatchCard({ home }: { home: Home }) {
  const m = home.nextMatch;
  if (!m)
    return (
      <section className="panel next-match" aria-labelledby="next-match-h">
        <SectionHeader id="next-match-h">Next match</SectionHeader>
        <EmptyState
          title="No match scheduled."
          action={
            <div className="actions">
              <TrackedLink
                href="/training"
                event="training_opened"
                className="button"
              >
                Open training
              </TrackedLink>
              <TrackedLink
                href="/career/fixtures"
                event="fixture_list_opened"
                className="button"
              >
                View fixtures
              </TrackedLink>
            </div>
          }
        >
          Your next fixture will appear here when the schedule is generated.
        </EmptyState>
      </section>
    );
  return (
    <section className="panel next-match" aria-labelledby="next-match-h">
      <SectionHeader
        id="next-match-h"
        action={<ReadinessBadge readiness={home.readiness} />}
      >
        Next match
      </SectionHeader>
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
        {m.pitch ? <li>Pitch: {m.pitch.name}</li> : null}
        <li>
          {formatDateTime(m.scheduledAt)} ·{' '}
          <strong>{relativeDay(m.scheduledAt)}</strong>
        </li>
      </ul>
      {m.pitch?.hint ? <p className="hint">{m.pitch.hint}</p> : null}
      {home.readiness.issues.length ? (
        <ul className="issue-list">
          {home.readiness.issues.map((i) => (
            <li key={i.code}>{i.message}</li>
          ))}
        </ul>
      ) : null}
      <div className="actions" style={{ marginTop: 'var(--space-3)' }}>
        {m.matchId && m.status === 'in_progress' ? (
          <TrackedLink
            href={`/match/${m.matchId}`}
            event="next_match_opened"
            className="button button-primary button-large"
          >
            RESUME MATCH
          </TrackedLink>
        ) : (
          <TrackedLink
            href="/match/preparation"
            event="next_match_opened"
            className="button button-primary button-large"
          >
            PREPARE MATCH
          </TrackedLink>
        )}
        <TrackedLink href="/career/fixtures" event="fixture_list_opened">
          View fixtures
        </TrackedLink>
      </div>
    </section>
  );
}

export function ActionCards({ home }: { home: Home }) {
  const t = home.training;
  const last = home.lastTraining;
  return (
    <div className="action-grid">
      <TrackedLink
        href="/training"
        event="training_opened"
        className="action-card"
      >
        <span className="action-title">Training</span>
        {t ? (
          <>
            <strong>
              {t.reason === 'recover_first'
                ? 'Rest and recover'
                : t.statLabel
                  ? `Improve ${t.statLabel}`
                  : t.name}
            </strong>
            <span className="hint">
              {t.name}
              {t.statValue !== null ? ` · ${t.statLabel} ${t.statValue}` : ''}
              {t.fatigueAdded > 0 ? ` · +${t.fatigueAdded} fatigue` : ''}
            </span>
          </>
        ) : (
          <strong>Choose a drill</strong>
        )}
        {last ? (
          <span className="hint">
            Last: {last.name}
            {last.improvements.length
              ? ` (${last.improvements.join(', ')})`
              : ''}
          </span>
        ) : null}
        <span className="action-cta">TRAIN</span>
      </TrackedLink>
      <TrackedLink
        href="/dressing-room"
        event="dressing_room_opened"
        className="action-card"
      >
        <span className="action-title">Dressing room</span>
        <strong>{home.equipped.bat?.name ?? 'No bat equipped'}</strong>
        <span className="hint">
          {home.equipped.kit?.name ?? 'No kit equipped'}
        </span>
        <span className="action-cta">CUSTOMIZE</span>
      </TrackedLink>
      <TrackedLink
        href="/player"
        event="player_profile_opened"
        className="action-card"
      >
        <span className="action-title">Player profile</span>
        <strong>
          OVR {home.player.overall} · {roleName(home.player.primaryRole)}
        </strong>
        <span className="hint">
          {home.stats.matches} {home.stats.matches === 1 ? 'match' : 'matches'}{' '}
          played
        </span>
        <span className="action-cta">VIEW</span>
      </TrackedLink>
    </div>
  );
}

export function TierPath({ tiers }: { tiers: Home['career']['tiers'] }) {
  return (
    <ol className="tier-path" aria-label="Career path">
      {tiers.map((t) => (
        <li
          key={t.id}
          className={`is-${t.status}`}
          {...(t.status === 'current'
            ? { 'aria-current': 'step' as const }
            : {})}
        >
          <span className="tier-dot" aria-hidden="true">
            {t.status === 'locked' ? '○' : '●'}
          </span>
          {t.name}
          <span className="sr-only">
            {t.status === 'current'
              ? ' (current)'
              : t.status === 'completed'
                ? ' (completed)'
                : ' (locked)'}
          </span>
        </li>
      ))}
    </ol>
  );
}

const TREND_TEXT = {
  up: '↑ Improving',
  down: '↓ Declining',
  flat: '— Steady',
} as const;

export function CareerProgressCard({ home }: { home: Home }) {
  const { progression: p, career: c } = home;
  const fatigueTone =
    p.readiness === 'exhausted'
      ? 'danger'
      : p.readiness === 'tired'
        ? 'warning'
        : 'accent';
  const next = c.nextTier;
  return (
    <section className="panel" aria-labelledby="progress-h">
      <SectionHeader
        id="progress-h"
        action={
          <TrackedLink
            href="/career/progression"
            event="career_progression_opened"
          >
            Progression
          </TrackedLink>
        }
      >
        Career
      </SectionHeader>
      <dl className="stat-grid">
        <StatCard
          label="Form"
          value={p.form}
          hint={`${p.formLabel}${p.formTrend ? ` · ${TREND_TEXT[p.formTrend]}` : ''}`}
        />
        <StatCard
          label="Fatigue"
          value={`${p.fatigue}%`}
          hint={
            p.readiness === 'ready'
              ? 'Fresh'
              : p.readiness === 'tired'
                ? 'Tired'
                : 'Exhausted'
          }
        />
        <StatCard
          label="Fans"
          value={formatCount(c.fans)}
          hint={
            c.fans >= 10_000
              ? `${c.fans.toLocaleString('en-US')} fans`
              : undefined
          }
        />
        <StatCard label="Season" value={c.season} />
      </dl>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <div className="xp-line">
          <span>Fatigue</span>
          <span>{p.fatigue} / 100</span>
        </div>
        <ProgressBar
          label="Fatigue"
          current={p.fatigue}
          target={100}
          tone={fatigueTone}
          valueText={`${p.fatigue}% fatigue`}
        />
        {p.readiness !== 'ready' ? (
          <p className="hint" role="status">
            Your fatigue is high. Consider recovery before intensive training.
          </p>
        ) : null}
      </div>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <TierPath tiers={c.tiers} />
      </div>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <div className="xp-line">
          <span>Reputation</span>
          <span>
            {c.reputation.toLocaleString('en-US')}
            {next ? ` / ${next.minReputation} for ${next.name}` : ''}
          </span>
        </div>
        {next ? (
          <ProgressBar
            label={`Reputation toward ${next.name}`}
            current={c.reputation}
            target={next.minReputation}
          />
        ) : null}
      </div>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <div className="xp-line">
          <span>Selector interest</span>
          <span>{percent(c.selectorInterest, c.selectorInterestMax)}%</span>
        </div>
        <ProgressBar
          label="Selector interest"
          current={c.selectorInterest}
          target={c.selectorInterestMax}
          valueText={`${percent(c.selectorInterest, c.selectorInterestMax)}%`}
        />
        <p className="hint">
          Perform consistently to attract higher-level selectors.
        </p>
      </div>
    </section>
  );
}

export function StatsSummary({ stats }: { stats: Home['stats'] }) {
  const bat = (
    <>
      <StatCard label="Runs" value={stats.batting.runs} />
      <StatCard label="Average" value={formatRatio(stats.batting.average)} />
      <StatCard
        label="Strike rate"
        value={formatRatio(stats.batting.strikeRate, 0)}
      />
      <StatCard
        label="50s / 100s"
        value={`${stats.batting.fifties} / ${stats.batting.hundreds}`}
      />
    </>
  );
  const bowl = (
    <>
      <StatCard label="Wickets" value={stats.bowling.wickets} />
      <StatCard label="Economy" value={formatRatio(stats.bowling.economy, 2)} />
      <StatCard label="Average" value={formatRatio(stats.bowling.average)} />
      <StatCard label="Best" value={stats.bowling.bestFigures ?? '—'} />
    </>
  );
  return (
    <section className="panel" aria-labelledby="stats-h">
      <SectionHeader id="stats-h">Career stats</SectionHeader>
      <dl className="stat-grid">
        <StatCard label="Matches" value={stats.matches} />
        {stats.focus !== 'bowling' ? bat : null}
        {stats.focus !== 'batting' ? bowl : null}
      </dl>
    </section>
  );
}

export function RecentMatches({ matches }: { matches: Home['recentMatches'] }) {
  if (!matches.length) return null; // only real history is ever shown
  return (
    <section className="panel" aria-labelledby="recent-h">
      <SectionHeader id="recent-h">Recent</SectionHeader>
      <ul className="list-plain">
        {matches.map((m) => (
          <li key={m.matchId} className="fixture-row">
            <strong
              className={
                m.result === 'won'
                  ? 'result-won'
                  : m.result === 'lost'
                    ? 'result-lost'
                    : undefined
              }
            >
              <Link href={`/match/${m.matchId}/result`}>
                {resultLabel(m.result)} vs {m.opponentName}
              </Link>
            </strong>
            <small>
              {m.formatName}
              {m.scoreLine ? ` · ${m.scoreLine}` : ''}
              {m.performanceRating !== null
                ? ` · Rating ${m.performanceRating.toFixed(1)}`
                : ''}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UpcomingFixtures({
  fixtures,
}: {
  fixtures: Home['upcomingFixtures'];
}) {
  return (
    <section className="panel" aria-labelledby="upcoming-h">
      <SectionHeader
        id="upcoming-h"
        action={
          <TrackedLink href="/career/fixtures" event="fixture_list_opened">
            View fixtures
          </TrackedLink>
        }
      >
        Upcoming
      </SectionHeader>
      {fixtures.length ? (
        <ul className="list-plain">
          {fixtures.map((f) => (
            <FixtureRow key={f.id} fixture={f} />
          ))}
        </ul>
      ) : (
        <EmptyState title="Nothing else scheduled.">
          More fixtures appear as your season is scheduled.
        </EmptyState>
      )}
    </section>
  );
}

export function ObjectivesPanel({
  objectives,
  achievements,
}: {
  objectives: Home['objectives'];
  achievements: Home['achievements'];
}) {
  return (
    <section className="panel" aria-labelledby="obj-h">
      <SectionHeader
        id="obj-h"
        action={<TrackedLink href="/career/objectives">All goals</TrackedLink>}
      >
        Objectives
      </SectionHeader>
      {objectives.length ? (
        objectives.map((o) => (
          <div key={o.id} className="objective-row">
            <div className="objective-top">
              <strong>{o.title}</strong>
              <span className="hint">
                {o.progress} / {o.target}
              </span>
            </div>
            <ProgressBar
              label={o.title}
              current={o.progress}
              target={o.target}
              valueText={`${o.progress} of ${o.target}`}
            />
          </div>
        ))
      ) : (
        <EmptyState title="All goals complete.">
          New objectives arrive as your career grows.
        </EmptyState>
      )}
      <p className="hint">
        Achievements {achievements.completed} / {achievements.total}
      </p>
    </section>
  );
}

export function CareerEventCard({ event }: { event: Home['careerEvent'] }) {
  if (!event) return null;
  return (
    <section
      className="panel"
      aria-labelledby="event-h"
      style={{ borderColor: 'var(--color-warning)' }}
    >
      <SectionHeader id="event-h">Career event</SectionHeader>
      <strong>{event.title}</strong>
      <p className="hint">{event.description}</p>
      <TrackedLink href={`/career/events/${event.id}`} className="button">
        VIEW
      </TrackedLink>
    </section>
  );
}

export function ContractCard({ contract }: { contract: Home['contract'] }) {
  if (!contract) return null;
  return (
    <section className="panel" aria-labelledby="contract-h">
      <SectionHeader id="contract-h">Contract</SectionHeader>
      <strong>{contract.teamName}</strong>
      <p className="hint">
        {roleName(contract.role)} · {contract.matchesPlayed} /{' '}
        {contract.durationMatches} matches
        {contract.matchFeeCoins > 0
          ? ` · ${formatCount(contract.matchFeeCoins, 100_000)} coins per match`
          : ''}
      </p>
    </section>
  );
}

export function PersonalityCard({
  personality,
}: {
  personality: Home['personality'];
}) {
  return (
    <section className="panel" aria-labelledby="pers-h">
      <SectionHeader id="pers-h">Personality</SectionHeader>
      <strong>{personality.archetype}</strong>
      <p className="hint">
        Confidence {personality.confidence} · Discipline{' '}
        {personality.discipline}
      </p>
    </section>
  );
}

export function IntroCard({ onDone }: { onDone: () => void }) {
  return (
    <section className="panel intro-card" aria-labelledby="intro-h">
      <SectionHeader id="intro-h">Your career starts here</SectionHeader>
      <ul>
        <li>Train your skills.</li>
        <li>Prepare your kit in the dressing room.</li>
        <li>Play matches.</li>
        <li>Build your reputation and move up the career path.</li>
      </ul>
      <button type="button" className="button" onClick={onDone}>
        Got it
      </button>
    </section>
  );
}

/** Dismissal lasts for this browser session of the app (until a full reload); nothing is stored. */
let guestBannerDismissed = false;
export function GuestBanner() {
  const [hidden, setHidden] = useState(guestBannerDismissed);
  if (hidden) return null;
  return (
    <aside className="guest-banner" aria-label="Guest account">
      <p>
        <strong>Playing as Guest.</strong> Create an account to access your
        career on other devices.
      </p>
      <div className="actions">
        <TrackedLink href="/account/upgrade" className="button button-primary">
          Protect Progress
        </TrackedLink>
        <button
          type="button"
          className="button"
          onClick={() => {
            guestBannerDismissed = true;
            setHidden(true);
          }}
        >
          Not now
        </button>
      </div>
    </aside>
  );
}

export function DegradedNotice({
  degraded,
}: {
  degraded: Home['degraded'];
}): ReactNode {
  if (!degraded.length) return null;
  return (
    <p className="hint" role="status">
      Some sections couldn&apos;t load right now. The rest of your career is up
      to date.
    </p>
  );
}

export { careerClient };
