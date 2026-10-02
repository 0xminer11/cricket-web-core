'use client';

import { useState } from 'react';
import type {
  ScorecardDto,
  ScorecardInningsDto,
} from '@the-cricketer/shared-types';

type Tab = 'batting' | 'bowling' | 'summary';
const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'batting', label: 'Batting' },
  { id: 'bowling', label: 'Bowling' },
  { id: 'summary', label: 'Match summary' },
];

function BattingTable({ innings }: { innings: ScorecardInningsDto }) {
  return (
    <>
      <table className="score-table" data-testid="batting-table">
        <caption className="sr-only">
          Batting, {innings.teamName}, innings {innings.number}
        </caption>
        <thead>
          <tr>
            <th scope="col">Batter</th>
            <th scope="col">R</th>
            <th scope="col">B</th>
            <th scope="col">4s</th>
            <th scope="col">6s</th>
            <th scope="col">SR</th>
          </tr>
        </thead>
        <tbody>
          {innings.batting.map((b) => (
            <tr key={b.playerId} className={b.isYou ? 'is-you' : ''}>
              <th scope="row">
                <span className="sc-name">
                  {b.name}
                  {b.batting ? '*' : ''}
                  {b.isYou ? <span className="you-tag">You</span> : null}
                </span>
                <span className="sc-dismissal hud-muted">
                  {b.batting ? 'batting' : (b.dismissal ?? '')}
                </span>
              </th>
              <td>{b.runs}</td>
              <td>{b.balls}</td>
              <td>{b.fours}</td>
              <td>{b.sixes}</td>
              <td>{b.strikeRate ?? '–'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">
              Extras
              <span className="sc-dismissal hud-muted">
                {[
                  innings.extras.wides ? `wd ${innings.extras.wides}` : null,
                  innings.extras.noBalls
                    ? `nb ${innings.extras.noBalls}`
                    : null,
                  innings.extras.byes ? `b ${innings.extras.byes}` : null,
                  innings.extras.legByes
                    ? `lb ${innings.extras.legByes}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(', ') || 'none'}
              </span>
            </th>
            <td colSpan={5}>{innings.extras.total}</td>
          </tr>
          <tr className="sc-total">
            <th scope="row">TOTAL</th>
            <td colSpan={5} data-testid="innings-total">
              {innings.total}
            </td>
          </tr>
        </tfoot>
      </table>
      {innings.didNotBat.length ? (
        <p className="hint" data-testid="did-not-bat">
          <strong>DNB</strong> {innings.didNotBat.join(', ')}
        </p>
      ) : null}
      {innings.fallOfWickets.length ? (
        <p className="hint" data-testid="fall-of-wickets">
          <strong>Fall of wickets</strong>{' '}
          {innings.fallOfWickets
            .map((f) => `${f.wicket}-${f.score} (${f.batter}, ${f.over} ov)`)
            .join(' · ')}
        </p>
      ) : null}
    </>
  );
}

function BowlingTable({ innings }: { innings: ScorecardInningsDto }) {
  return (
    <table className="score-table" data-testid="bowling-table">
      <caption className="sr-only">Bowling, against {innings.teamName}</caption>
      <thead>
        <tr>
          <th scope="col">Bowler</th>
          <th scope="col">O</th>
          <th scope="col">M</th>
          <th scope="col">R</th>
          <th scope="col">W</th>
          <th scope="col">Econ</th>
        </tr>
      </thead>
      <tbody>
        {innings.bowling.map((b) => (
          <tr key={b.playerId} className={b.isYou ? 'is-you' : ''}>
            <th scope="row">
              {b.name}
              {b.isYou ? <span className="you-tag">You</span> : null}
            </th>
            <td>{b.oversText}</td>
            <td>{b.maidens}</td>
            <td>{b.runs}</td>
            <td>{b.wickets}</td>
            <td>{b.economy ?? '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The scorecard: pick an innings, then Batting, Bowling or Match summary. Everything is the server's: overs are
 * written in cricket form (1.4, not 1.67), the dismissal never names a fielder the game does not model, and a
 * batter who has not yet batted is listed under DNB.
 */
export function ScorecardView({ scorecard }: { scorecard: ScorecardDto }) {
  const [tab, setTab] = useState<Tab>('batting');
  const [index, setIndex] = useState(() =>
    Math.max(0, scorecard.innings.length - 1),
  );
  const innings =
    scorecard.innings[Math.min(index, scorecard.innings.length - 1)];
  return (
    <div className="scorecard" data-testid="scorecard">
      {scorecard.innings.length > 1 ? (
        <div className="chip-row" role="group" aria-label="Innings">
          {scorecard.innings.map((i, n) => (
            <button
              key={i.number}
              type="button"
              className="chip"
              aria-pressed={index === n}
              onClick={() => setIndex(n)}
              data-innings={i.number}
            >
              {i.teamName}
              {i.isSuperOver ? ' (Super Over)' : ''} {i.score}
            </button>
          ))}
        </div>
      ) : null}
      <div role="tablist" aria-label="Scorecard" className="tab-row">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`sc-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`sc-panel-${t.id}`}
            className="tab"
            onClick={() => setTab(t.id)}
            data-tab={t.id}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`sc-panel-${tab}`}
        aria-labelledby={`sc-tab-${tab}`}
        tabIndex={0}
        className="tab-panel"
      >
        {tab === 'summary' || !innings ? (
          <div className="stack" data-testid="scorecard-summary">
            {scorecard.resultText ? (
              <p className="sc-result">
                <strong>{scorecard.resultText}</strong>
              </p>
            ) : null}
            {scorecard.tossText ? <p>{scorecard.tossText}</p> : null}
            <p className="hint">
              {scorecard.format} · {scorecard.pitch} pitch
            </p>
            <ul className="sc-innings-list">
              {scorecard.innings.map((i) => (
                <li key={i.number}>
                  <strong>{i.teamName}</strong> {i.total}
                  {i.target ? ` · target ${i.target}` : ''}
                  {i.runRate !== null ? ` · RR ${i.runRate}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : tab === 'batting' ? (
          <>
            <p className="sc-heading">
              {innings.teamName}
              {innings.isSuperOver ? ' · Super Over' : ''}
              {innings.inProgress ? ' · in progress' : ''}
            </p>
            <BattingTable innings={innings} />
          </>
        ) : (
          <>
            <p className="sc-heading">Bowling against {innings.teamName}</p>
            <BowlingTable innings={innings} />
          </>
        )}
      </div>
    </div>
  );
}
