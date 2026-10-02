'use client';

import { useEffect, useState } from 'react';
import type {
  MatchPlayStateDto,
  ScorecardDto,
} from '@the-cricketer/shared-types';
import type {
  ControllerSnapshot,
  MatchGameplayController,
} from '../../match/core/gameplay-controller';
import { matchFlowClient } from '../api';
import type { MatchSettings } from '../state/settings';

const SPEEDS = [
  { id: 'normal', label: 'Normal', ms: 700 },
  { id: 'fast', label: 'Fast', ms: 160 },
  { id: 'instant', label: 'Instant', ms: 0 },
] as const;

/** Reveals the balls the server played, one at a time at the chosen speed, then hands the screen back. */
export function SimulationFeed({
  controller,
  snapshot,
}: {
  controller: MatchGameplayController;
  snapshot: ControllerSnapshot;
}) {
  const sim = snapshot.simulation!;
  const ms = SPEEDS.find((s) => s.id === sim.speed)?.ms ?? 160;
  useEffect(() => {
    if (sim.done) {
      // the last ball is on screen: leave the feed after a moment (the summary line stays as a notice)
      const timer = setTimeout(() => controller.closeSimulation(), 900);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => controller.revealSimulation(1), ms);
    return () => clearTimeout(timer);
  }, [controller, sim.done, sim.shown, ms]);
  const shown = sim.balls.slice(0, sim.shown);
  return (
    <section
      className="sim-feed"
      aria-label="Balls being played"
      data-testid="simulation-feed"
    >
      <ol aria-live="polite">
        {shown.slice(-8).map((ball) => (
          <li key={ball.sequence} data-headline={ball.headline}>
            <span className="sim-over">{ball.over || ball.label}</span>
            <strong>{ball.headline}</strong>
            {ball.score ? (
              <span className="hud-muted"> {ball.score}</span>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="hint">
        {sim.shown} of {sim.balls.length} balls
      </p>
      {!sim.done ? (
        <button
          type="button"
          className="button"
          onClick={() => controller.skipSimulation()}
          data-testid="simulation-skip"
        >
          Skip to the end
        </button>
      ) : null}
    </section>
  );
}

/** Your Cricketer's own figures once they are out or their spell is over (from the scorecard; nothing is computed here). */
function PersonalSummary({
  matchId,
  match,
}: {
  matchId: string;
  match: MatchPlayStateDto;
}) {
  const [card, setCard] = useState<ScorecardDto | null>(null);
  useEffect(() => {
    let cancelled = false;
    matchFlowClient
      .scorecard(matchId)
      .then((c) => !cancelled && setCard(c))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [matchId, match.expectedSequence]);
  if (!card) return null;
  const rows = card.innings.flatMap((i) =>
    i.batting.filter((b) => b.isYou && !b.notOut).map((b) => ({ i, b })),
  );
  const bowls = card.innings.flatMap((i) =>
    i.bowling.filter((b) => b.isYou).map((b) => ({ i, b })),
  );
  const bat = rows.at(-1);
  const bowl = bowls.at(-1);
  if (!bat && !bowl) return null;
  return (
    <div className="personal-summary" data-testid="personal-summary">
      {bat ? (
        <p data-testid="your-innings">
          <strong>YOUR INNINGS</strong> {bat.b.runs} ({bat.b.balls}){' '}
          <span className="hud-muted">{bat.b.dismissal}</span>
        </p>
      ) : null}
      {bowl && match.you.side === 'bowling' ? (
        <p data-testid="your-spell">
          <strong>YOUR SPELL</strong> {bowl.b.oversText} overs · {bowl.b.runs}{' '}
          runs · {bowl.b.wickets} {bowl.b.wickets === 1 ? 'wicket' : 'wickets'}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The AI plays on: SIMULATE UNTIL MY TURN (and SIMULATE REST after your dismissal), at Normal, Fast or Instant. The
 * server stops exactly where your Cricketer is needed (on strike, or at an over they can bowl), never past it.
 */
export function SimulationPanel({
  controller,
  snapshot,
  match,
  settings,
  onSpeed,
  matchId,
}: {
  controller: MatchGameplayController;
  snapshot: ControllerSnapshot;
  match: MatchPlayStateDto;
  settings: MatchSettings;
  onSpeed: (speed: MatchSettings['simulationSpeed']) => void;
  matchId: string;
}) {
  const { side, status } = match.you;
  const batting = side === 'batting';
  const dismissed = batting && status === 'dismissed';
  const heading = dismissed
    ? 'You are out'
    : batting
      ? status === 'non_striker'
        ? 'You are at the non-striker’s end'
        : 'Waiting for your turn to bat'
      : `${match.battingTeam.name} are batting`;
  const body = dismissed
    ? 'Your innings is over. The rest of it is played for you.'
    : batting
      ? 'Your team plays on until your Cricketer is on strike.'
      : 'Your side is in the field; the over is bowled for you until your turn to bowl.';
  const busy = snapshot.busy;
  return (
    <section
      className="phase-panel"
      aria-labelledby="sim-h"
      data-testid="simulate-panel"
    >
      <h2 id="sim-h">{heading}</h2>
      <p>{body}</p>
      <PersonalSummary matchId={matchId} match={match} />
      <fieldset className="dp-group sim-speed">
        <legend>Watch the AI play</legend>
        <div role="radiogroup" aria-label="Simulation speed">
          {SPEEDS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={settings.simulationSpeed === s.id}
              className="chip"
              onClick={() => {
                onSpeed(s.id);
                controller.setSimulationSpeed(s.id);
              }}
              data-speed={s.id}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="preset-row">
        <button
          type="button"
          className="button button-primary button-large"
          disabled={busy}
          onClick={() => void controller.simulate('until_my_turn')}
          data-testid="simulate"
        >
          {busy
            ? 'Playing…'
            : batting && !dismissed
              ? 'SIMULATE TO MY TURN'
              : 'SIMULATE UNTIL MY TURN'}
        </button>
        {dismissed ? (
          <button
            type="button"
            className="button button-large"
            disabled={busy}
            onClick={() => void controller.simulate('innings')}
            data-testid="simulate-rest"
          >
            SIMULATE REST
          </button>
        ) : null}
      </div>
    </section>
  );
}
