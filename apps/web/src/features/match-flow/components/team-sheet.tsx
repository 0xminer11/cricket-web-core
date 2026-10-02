'use client';

import type { MatchFlowDto, TeamSheetDto } from '@the-cricketer/shared-types';

/**
 * Both sides, in batting order. Your own side shows each player's overall; the opposition's attributes are not
 * scouted, so only names, roles and bowling styles are shown. Your Cricketer is marked in text, not only by colour.
 */
function Sheet({ sheet }: { sheet: TeamSheetDto }) {
  const id = `sheet-${sheet.isYours ? 'mine' : 'theirs'}`;
  return (
    <section
      className={`panel team-sheet${sheet.isYours ? ' is-mine' : ''}`}
      aria-labelledby={id}
      data-testid={sheet.isYours ? 'team-sheet-mine' : 'team-sheet-theirs'}
    >
      <h2 id={id} className="team-sheet-title">
        {sheet.name}
        <span className="hud-muted">
          {sheet.isYours ? ' · Your team' : ' · Opposition'}
        </span>
      </h2>
      <ol className="team-sheet-list">
        {sheet.players.map((p) => (
          <li
            key={p.playerId}
            className={p.isYou ? 'is-you' : undefined}
            aria-label={`${p.battingPosition}. ${p.name}, ${p.roleName}${p.isYou ? ', your Cricketer' : ''}`}
          >
            <span className="ts-pos" aria-hidden="true">
              {p.battingPosition}
            </span>
            <span className="ts-name">
              {p.name}
              {p.isYou ? <span className="you-tag">You</span> : null}
            </span>
            <span className="ts-role">
              {p.roleName}
              {p.bowlingStyleName ? ` · ${p.bowlingStyleName}` : ''}
            </span>
            {p.overall !== null ? (
              <span className="ts-ovr" title="Overall">
                <span className="sr-only">Overall </span>
                {p.overall}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TeamSheetScreen({
  flow,
  onContinue,
}: {
  flow: MatchFlowDto;
  onContinue: () => void;
}) {
  return (
    <div className="flow-screen stack" data-testid="team-sheet">
      <header className="flow-head">
        <p className="eyebrow">TEAM SHEETS</p>
        <h1>
          {flow.yourTeam.name} <span className="hud-muted">vs</span>{' '}
          {flow.opponentTeam.name}
        </h1>
        <p className="hint">
          {flow.format.name} · {flow.pitch.name} pitch
          {flow.venueName ? ` · ${flow.venueName}` : ''}
        </p>
      </header>
      <div className="team-sheet-grid">
        <Sheet sheet={flow.yourTeam} />
        <Sheet sheet={flow.opponentTeam} />
      </div>
      <div className="actions flow-actions">
        <button
          type="button"
          className="button button-primary button-large"
          onClick={onContinue}
          data-testid="team-sheet-continue"
        >
          CONTINUE TO TOSS
        </button>
      </div>
    </div>
  );
}
