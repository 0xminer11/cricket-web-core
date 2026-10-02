import type { MatchPlayStateDto } from '@the-cricketer/shared-types';

/** Score, batter, bowler and over line, all from the authoritative state (never computed here). */
export function ScoreHud({ match }: { match: MatchPlayStateDto }) {
  const i = match.innings;
  const chasing = i.target !== null;
  return (
    <section className="match-hud" aria-label="Scoreboard">
      <div className="hud-score">
        <p className="hud-team">{match.battingTeam.name}</p>
        <p className="hud-runs" data-testid="score">
          {i.runs}/{i.wickets}
        </p>
        <p className="hud-overs" data-testid="overs">
          {i.oversText} <span className="hud-muted">overs</span>
          {match.format.oversPerInnings ? (
            <span className="hud-muted">
              {' '}
              / {i.isSuperOver ? 1 : match.format.oversPerInnings}
            </span>
          ) : null}
        </p>
        {chasing ? (
          <p className="hud-need" data-testid="need">
            Need {i.runsNeeded} from {i.ballsRemaining}
            {i.requiredRate !== null ? (
              <span className="hud-muted"> · RRR {i.requiredRate}</span>
            ) : null}
          </p>
        ) : i.currentRate !== null ? (
          <p className="hud-need">
            <span className="hud-muted">Run rate</span> {i.currentRate}
          </p>
        ) : null}
        {match.previousInnings.length ? (
          <p className="hud-muted">
            {match.previousInnings
              .map((p) => `${p.teamName} ${p.score}`)
              .join(' · ')}
          </p>
        ) : null}
      </div>
      <dl className="hud-people">
        {match.striker ? (
          <div>
            <dt>Batting</dt>
            <dd data-testid="batter">
              <strong>{match.striker.name}</strong> {match.striker.runs}{' '}
              <span className="hud-muted">({match.striker.balls})</span>
            </dd>
          </div>
        ) : null}
        {match.currentBowler ? (
          <div>
            <dt>Bowling</dt>
            <dd data-testid="bowler">
              <strong>{match.currentBowler.name}</strong>{' '}
              {match.currentBowler.oversText}-{match.currentBowler.maidens}-
              {match.currentBowler.runs}-{match.currentBowler.wickets}{' '}
              <span className="hud-muted">{match.currentBowler.styleName}</span>
            </dd>
          </div>
        ) : null}
      </dl>
      {match.thisOver.length ? (
        <ol className="hud-over" aria-label={`Over ${match.overNumber}`}>
          {match.thisOver.map((ball, index) => (
            <li
              key={index}
              className={
                ball.wicket ? 'is-wicket' : ball.runs >= 4 ? 'is-boundary' : ''
              }
              aria-label={ball.label === '•' ? 'dot ball' : ball.label}
            >
              {ball.label}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
