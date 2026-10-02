'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { SectionHeader } from '@the-cricketer/ui';
import type { MatchResultDto } from '@the-cricketer/shared-types';
import { matchClient } from '../../match/api';

const OUTCOME_LABEL = { win: 'VICTORY', loss: 'DEFEAT', tie: 'TIE' } as const;

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** Your own figures. The numbers are the persisted ones; this only lays them out. */
export function PlayerPerformanceCard({ result }: { result: MatchResultDto }) {
  const { performance, you } = result;
  return (
    <section
      className="panel"
      aria-labelledby="perf-h"
      data-testid="your-performance"
    >
      <SectionHeader id="perf-h">Your performance</SectionHeader>
      <p className="hint">
        {you.name} · {you.roleName}
        {performance.rating !== null
          ? ` · match rating ${performance.rating}`
          : ''}
      </p>
      {!performance.tookPart ? (
        <p data-testid="did-not-play">You did not bat or bowl in this match.</p>
      ) : (
        <dl className="hud-people">
          {performance.batting ? (
            <div data-testid="your-batting">
              <dt>Batting</dt>
              <dd>
                <strong>
                  {performance.batting.runs}
                  {performance.batting.notOut ? '*' : ''}
                </strong>{' '}
                off {performance.batting.balls} balls ·{' '}
                {performance.batting.fours} fours · {performance.batting.sixes}{' '}
                sixes
                {performance.batting.strikeRate !== null
                  ? ` · strike rate ${performance.batting.strikeRate}`
                  : ''}
                <span className="hud-muted">
                  {' '}
                  {performance.batting.notOut
                    ? 'not out'
                    : (performance.batting.dismissal ?? 'out')}
                </span>
              </dd>
            </div>
          ) : null}
          {performance.bowling ? (
            <div data-testid="your-bowling">
              <dt>Bowling</dt>
              <dd>
                {performance.bowling.oversText}-{performance.bowling.maidens}-
                {performance.bowling.runs}-{performance.bowling.wickets}
                {performance.bowling.economy !== null
                  ? ` · economy ${performance.bowling.economy}`
                  : ''}
              </dd>
            </div>
          ) : null}
        </dl>
      )}
      {result.milestones.length ? (
        <ul className="milestones" data-testid="milestones">
          {result.milestones.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** XP, coins, fans and reputation, the level-up and how form and fatigue moved. */
export function RewardSummary({ result }: { result: MatchResultDto }) {
  const { rewards, progression } = result;
  if (!rewards || !progression)
    return (
      <section
        className="panel"
        aria-labelledby="rewards-h"
        data-testid="rewards-pending"
      >
        <SectionHeader id="rewards-h">Rewards</SectionHeader>
        <p role="status">Your rewards are being added. Refresh in a moment.</p>
      </section>
    );
  const leveled = progression.levelAfter > progression.levelBefore;
  return (
    <section
      className="panel"
      aria-labelledby="rewards-h"
      data-testid="rewards"
    >
      <SectionHeader id="rewards-h">Rewards</SectionHeader>
      {leveled ? (
        <p className="level-up" data-testid="level-up" role="status">
          <strong>LEVEL UP!</strong> Level {progression.levelBefore} → Level{' '}
          {progression.levelAfter}
        </p>
      ) : null}
      <dl className="reward-grid">
        <div>
          <dt>XP</dt>
          <dd data-testid="reward-xp">+{rewards.playerXp}</dd>
        </div>
        <div>
          <dt>Coins</dt>
          <dd data-testid="reward-coins">+{rewards.coins}</dd>
        </div>
        <div>
          <dt>Fans</dt>
          <dd data-testid="reward-fans">{signed(rewards.fans)}</dd>
        </div>
        <div>
          <dt>Reputation</dt>
          <dd data-testid="reward-reputation">{signed(rewards.reputation)}</dd>
        </div>
      </dl>
      <p className="hint" data-testid="progression-line">
        Level {progression.levelAfter}
        {progression.xpToNext !== null
          ? ` · ${progression.xpToNext} XP to the next level`
          : ' · top level'}{' '}
        · Form {progression.formBefore} → {progression.formAfter} (
        {progression.formLabel}) · Fatigue +{progression.fatigueAdded} (now{' '}
        {progression.fatigueAfter}%)
      </p>
      <details className="reward-breakdown">
        <summary>How these rewards were worked out</summary>
        <ul>
          <li>
            Coins: participation {rewards.breakdown.participationCoins}, result{' '}
            {rewards.breakdown.resultCoins}, performance{' '}
            {rewards.breakdown.performanceCoins}
          </li>
          <li>
            XP: participation {rewards.breakdown.participationXp}, result{' '}
            {rewards.breakdown.resultXp}, performance{' '}
            {rewards.breakdown.performanceXp}
          </li>
          <li>
            Multipliers: result ×{rewards.breakdown.resultMultiplier}, tier ×
            {rewards.breakdown.tierMultiplier}, repeat-play ×
            {rewards.breakdown.antiFarmMultiplier}
          </li>
        </ul>
      </details>
      {result.achievements.length ? (
        <ul className="achievement-list" data-testid="achievements">
          {result.achievements.map((a) => (
            <li key={a.id}>
              <strong>{a.name}</strong>{' '}
              <span className="hud-muted">{a.description}</span> +{a.coins}{' '}
              coins, +{a.playerXp} XP
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** The post-match screen. Everything on it was decided and stored when the match ended; a refresh shows the same numbers. */
export function MatchResultScreen({ result }: { result: MatchResultDto }) {
  useEffect(() => {
    matchClient.track('match_result_viewed', result.outcome);
  }, [result.outcome]);
  return (
    <div className="stack result-screen" data-testid="match-result">
      <section
        className={`panel result-hero is-${result.outcome}`}
        aria-labelledby="result-h"
      >
        <p className="eyebrow" data-testid="outcome">
          {OUTCOME_LABEL[result.outcome]}
        </p>
        <h1 id="result-h" data-testid="result-text">
          {result.resultText}
        </h1>
        {result.superOver ? (
          <p className="hint">Decided in a Super Over.</p>
        ) : null}
        <ul className="sc-innings-list" data-testid="result-innings">
          {result.innings.map((i) => (
            <li key={i.number}>
              <strong>{i.teamName}</strong> {i.score}{' '}
              <span className="hud-muted">
                ({i.oversText} ov){i.isSuperOver ? ' · Super Over' : ''}
              </span>
            </li>
          ))}
        </ul>
        {result.playerOfTheMatch ? (
          <p data-testid="potm">
            Player of the Match: <strong>{result.playerOfTheMatch.name}</strong>{' '}
            <span className="hud-muted">
              {result.playerOfTheMatch.isYou
                ? 'You!'
                : result.playerOfTheMatch.teamName}
            </span>
          </p>
        ) : null}
      </section>
      <PlayerPerformanceCard result={result} />
      <RewardSummary result={result} />
      <div className="actions">
        <Link
          className="button button-primary button-large"
          href="/career"
          data-testid="result-continue"
        >
          CONTINUE
        </Link>
        <Link
          className="button"
          href={`/match/${result.matchId}/scorecard`}
          data-testid="view-scorecard"
        >
          VIEW SCORECARD
        </Link>
        <Link className="button" href="/training">
          Training
        </Link>
      </div>
    </div>
  );
}
