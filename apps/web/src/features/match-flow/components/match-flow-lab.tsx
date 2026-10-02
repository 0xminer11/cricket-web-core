'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RequirePlayer } from '../../career/components/primitives';
import { careerClient } from '../../career/api/career-client';
import { matchClient } from '../../match/api';
import { matchFlowClient } from '../api';
import { matchFlowDevClient } from '../api/dev-client';

/**
 * DEVELOPMENT ONLY (the page is a 404 in production and the API routes it calls do not exist there).
 * Walks one match through the flow stage by stage and can arrange a toss or a result, so every screen of Module 11 can
 * be looked at without playing a match. It writes nothing itself: the API plays the match through the normal code.
 */
function Lab() {
  const [matchId, setMatchId] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [flow, setFlow] = useState<unknown>(null);
  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 12));
  const run = async (label: string, work: () => Promise<unknown>) => {
    try {
      const out = await work();
      note(`${label}: ok ${out ? JSON.stringify(out).slice(0, 160) : ''}`);
    } catch (e) {
      note(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const refresh = (id = matchId) =>
    run('flow', async () => {
      const f = await matchFlowClient.flow(id);
      setFlow(f);
      return { stage: f.stage };
    });
  return (
    <div className="stack flow-screen" data-testid="match-flow-lab">
      <h1>Match flow lab</h1>
      <p className="hint">
        Development only. Create the next fixture&apos;s match, arrange the toss
        or the result, then open the screen you want to look at.
      </p>
      <div className="preset-row">
        <button
          type="button"
          className="button"
          onClick={() =>
            void run('create', async () => {
              const home = await careerClient.getHome();
              if (!home.nextMatch) throw new Error('no next fixture');
              const { matchId: id } = await matchClient.start(
                home.nextMatch.id,
              );
              setMatchId(id);
              await refresh(id);
              return { matchId: id };
            })
          }
        >
          Create match (next fixture)
        </button>
        <label>
          Match id{' '}
          <input
            value={matchId}
            onChange={(e) => setMatchId(e.target.value.trim())}
            size={40}
            aria-label="Match id"
          />
        </label>
        <button type="button" className="button" onClick={() => void refresh()}>
          Reload flow
        </button>
      </div>
      <div className="preset-row">
        <button
          type="button"
          className="button"
          disabled={!matchId}
          onClick={() =>
            void run('toss: I win', async () => {
              const r = await matchFlowDevClient.arrangeToss({
                matchId,
                userWins: true,
              });
              await refresh();
              return r;
            })
          }
        >
          Arrange toss: I win
        </button>
        <button
          type="button"
          className="button"
          disabled={!matchId}
          onClick={() =>
            void run('toss: AI wins', async () => {
              const r = await matchFlowDevClient.arrangeToss({
                matchId,
                userWins: false,
              });
              await refresh();
              return r;
            })
          }
        >
          Arrange toss: AI wins
        </button>
      </div>
      <div className="preset-row">
        {(['win', 'loss', 'tie'] as const).map((outcome) => (
          <button
            key={outcome}
            type="button"
            className="button"
            disabled={!matchId}
            onClick={() =>
              void run(`force ${outcome}`, async () => {
                const r = await matchFlowDevClient.forceResult({
                  matchId,
                  outcome,
                  play: true,
                });
                await refresh();
                return { seed: r.seed, phase: r.match.phase };
              })
            }
          >
            Force result: {outcome} (plays the match)
          </button>
        ))}
      </div>
      {matchId ? (
        <div className="preset-row">
          <Link className="button" href={`/match/${matchId}`}>
            Open match
          </Link>
          <Link className="button" href={`/match/${matchId}/result`}>
            Open result
          </Link>
          <Link className="button" href={`/match/${matchId}/scorecard`}>
            Open scorecard
          </Link>
        </div>
      ) : null}
      <pre className="hint" data-testid="lab-flow">
        {flow ? JSON.stringify(flow, null, 2).slice(0, 1800) : 'no flow loaded'}
      </pre>
      <ul aria-label="Log">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

export function MatchFlowLab() {
  return (
    <RequirePlayer>
      <Lab />
    </RequirePlayer>
  );
}
