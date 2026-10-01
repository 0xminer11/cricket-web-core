'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { SectionHeader } from '@the-cricketer/ui';
import type { DrillDto, TrainingResultDto } from '@the-cricketer/shared-types';
import { SweepBar } from './parts';
import { percentOf } from '../utils/format';

/**
 * What the server applied. Everything here is the response: nothing is recomputed. Attribute
 * arrows appear only for skills that actually changed; bars sweep in unless reduced motion is set.
 */
export function TrainingResult({
  result,
  next,
  onAgain,
}: {
  result: TrainingResultDto;
  /** The drill's current state after this session (decides whether "train again" is offered). */
  next: DrillDto | null;
  onAgain: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const leveled = result.playerXp.levelAfter > result.playerXp.levelBefore;
  const rest = result.kind === 'recovery';
  const canAgain = next?.available ?? false;
  return (
    <section className="stack training-result" aria-labelledby="result-h">
      <h2 id="result-h" ref={heading} tabIndex={-1}>
        {rest ? 'REST COMPLETE' : 'TRAINING COMPLETE'}
      </h2>
      <p className="hint">{result.name}</p>
      {leveled ? (
        <div className="notice level-up" role="status">
          <strong>LEVEL UP!</strong> Level {result.playerXp.levelAfter}
        </div>
      ) : null}

      {result.skills.length ? (
        <div className="panel">
          <SectionHeader>Skills</SectionHeader>
          {result.skills.map((s) => {
            const gained = s.valueAfter > s.valueBefore;
            const need = s.xpToNextAfter;
            const to =
              s.maxed || need === null ? 100 : percentOf(s.xpAfter, need);
            const from = gained
              ? 0
              : need === null
                ? 100
                : percentOf(s.xpBefore, need);
            return (
              <div key={s.statKey} className="skill-row">
                <div className="skill-top">
                  <strong>{s.label} XP</strong>
                  <span className="skill-gain">
                    {s.xpGained > 0 ? `+${s.xpGained}` : s.maxed ? 'MAX' : '+0'}
                  </span>
                </div>
                {gained ? (
                  <p className="skill-up">
                    <strong>
                      {s.label} {s.valueBefore} → {s.valueAfter}
                    </strong>
                  </p>
                ) : null}
                <SweepBar
                  from={from}
                  to={to}
                  label={`${s.label} progress to next point`}
                  valueText={
                    s.maxed || need === null
                      ? 'MAX'
                      : `${s.xpAfter} / ${need} XP`
                  }
                />
                <div className="xp-line">
                  <span>
                    {s.maxed || need === null
                      ? 'MAX'
                      : `${s.xpAfter} / ${need} XP`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <dl className="stat-grid">
        {result.playerXp.gained > 0 ? (
          <div className="stat-card">
            <dt>Player XP</dt>
            <dd>+{result.playerXp.gained}</dd>
          </div>
        ) : null}
        <div className="stat-card">
          <dt>Fatigue</dt>
          <dd>
            {result.fatigue.before} → {result.fatigue.after}
          </dd>
        </div>
        {result.currency ? (
          <div className="stat-card">
            <dt>Coins</dt>
            <dd>-{result.currency.spent}</dd>
            <dd className="hint">
              {result.currency.balanceAfter.toLocaleString('en-US')} left
            </dd>
          </div>
        ) : null}
        <div className="stat-card">
          <dt>Overall</dt>
          <dd>{result.overall.player}</dd>
        </div>
      </dl>

      <div className="actions">
        {canAgain ? (
          <button
            type="button"
            className="button button-primary"
            onClick={onAgain}
          >
            {rest ? 'REST AGAIN' : 'TRAIN AGAIN'}
          </button>
        ) : (
          <span className="hint" role="status">
            {next?.reason === 'insufficient_coins'
              ? 'Not enough coins to train again.'
              : next?.reason === 'blocked_fatigue'
                ? 'Too tired for more drills: rest first.'
                : next?.reason === 'already_fresh'
                  ? 'You are fully rested.'
                  : next?.reason === 'maxed_skill'
                    ? 'These skills are maxed.'
                    : ''}
          </span>
        )}
        <Link className="button" href="/career">
          BACK TO CAREER
        </Link>
        <Link href="/training">Back to training</Link>
      </div>
    </section>
  );
}
