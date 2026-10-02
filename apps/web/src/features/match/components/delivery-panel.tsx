'use client';

import { LENGTH_LABELS, LINE_LABELS } from '@the-cricketer/game-core';
import type { DeliveryLength, DeliveryLine } from '@the-cricketer/game-core';
import type { MatchPlayStateDto } from '@the-cricketer/shared-types';
import { classifyTarget } from '../core/coordinates';
import type { MatchGameplayController } from '../core/gameplay-controller';
import type { ControllerSnapshot } from '../core/gameplay-controller';
import { TimingMeter } from './timing-meter';

const LINES: DeliveryLine[] = [
  'wide_off',
  'outside_off',
  'off_stump',
  'middle',
  'leg',
];
const LENGTHS: DeliveryLength[] = [
  'yorker',
  'full',
  'good',
  'short',
  'bouncer',
];

const DIFFICULTY_TEXT = {
  low: 'Easy',
  medium: 'Medium',
  high: 'Hard',
} as const;
const COST_TEXT = {
  low: 'low control cost',
  medium: 'medium control cost',
  high: 'high control cost',
} as const;

/** The player's choices for one delivery: variation, aim, execution timing and BOWL. */
export function DeliveryPanel({
  controller,
  snapshot,
  match,
}: {
  controller: MatchGameplayController;
  snapshot: ControllerSnapshot;
  match: MatchPlayStateDto;
}) {
  const { input, deliveries } = snapshot;
  const zone = classifyTarget(input.target);
  const locked = !input.inputOpen;
  const bowler = snapshot.bowler;
  return (
    <div className="delivery-panel" data-testid="delivery-panel">
      <fieldset className="dp-group dp-deliveries" disabled={locked}>
        <legend>Delivery</legend>
        <div role="radiogroup" aria-label="Delivery variation">
          {deliveries.map((option, index) => {
            const card = match.deliveryCatalog[option.id];
            if (!card) return null;
            const selected = input.deliveryId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`delivery-card${selected ? ' is-selected' : ''}`}
                onClick={() => controller.selectDelivery(option.id)}
                data-delivery={option.id}
                aria-keyshortcuts={String(index + 1)}
              >
                <span className="dc-name">{card.name}</span>
                <span className="dc-meta">
                  {card.movement} · {DIFFICULTY_TEXT[card.difficulty]} ·{' '}
                  {COST_TEXT[card.controlCost]}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="dp-group dp-aim" disabled={locked}>
        <legend>Aim</legend>
        <p className="aim-readout" data-testid="aim-readout">
          <strong>
            {LINE_LABELS[zone.line]}, {LENGTH_LABELS[zone.length].toLowerCase()}
          </strong>
        </p>
        <div className="preset-row" role="group" aria-label="Length">
          {LENGTHS.map((length) => (
            <button
              key={length}
              type="button"
              className="chip"
              aria-pressed={zone.length === length}
              onClick={() => controller.setLength(length)}
              data-length={length}
            >
              {LENGTH_LABELS[length]}
            </button>
          ))}
        </div>
        <div className="preset-row" role="group" aria-label="Line">
          {LINES.map((line) => (
            <button
              key={line}
              type="button"
              className="chip"
              aria-pressed={zone.line === line}
              onClick={() => controller.setLine(line)}
              data-line={line}
            >
              {LINE_LABELS[line]}
            </button>
          ))}
        </div>
        <div className="nudge" role="group" aria-label="Fine aim">
          <button
            type="button"
            className="chip"
            aria-label="Aim toward the off side"
            onClick={() => controller.nudgeTarget(-1, 0)}
          >
            ◀ Off
          </button>
          <button
            type="button"
            className="chip"
            aria-label="Aim fuller"
            onClick={() => controller.nudgeTarget(0, -1)}
          >
            ▲ Fuller
          </button>
          <button
            type="button"
            className="chip"
            aria-label="Aim shorter"
            onClick={() => controller.nudgeTarget(0, 1)}
          >
            ▼ Shorter
          </button>
          <button
            type="button"
            className="chip"
            aria-label="Aim toward the leg side"
            onClick={() => controller.nudgeTarget(1, 0)}
          >
            Leg ▶
          </button>
        </div>
        <p className="hint">
          Drag the marker on the pitch, or use these buttons.
        </p>
      </fieldset>

      <div className="dp-group dp-bowl">
        <p className="bowler-line">
          {bowler ? (
            <>
              <strong>{bowler.name}</strong>{' '}
              <span className="hud-muted">
                {bowler.styleName} · Accuracy {bowler.skills.accuracy} · Control{' '}
                {bowler.skills.control}
              </span>
            </>
          ) : null}
        </p>
        <TimingMeter
          controller={controller}
          active={input.inputOpen}
          assist={input.assist}
          halfWindow={controller.input.halfWindow}
        />
        <label className="assist-toggle">
          <input
            type="checkbox"
            checked={input.assist}
            onChange={(event) => controller.setAssist(event.target.checked)}
            disabled={locked}
          />{' '}
          Assisted timing
        </label>
        <button
          type="button"
          className="button button-primary button-large bowl-button"
          disabled={!input.canBowl}
          onClick={() => controller.bowl()}
          aria-keyshortcuts="Space"
          data-testid="bowl"
        >
          BOWL
        </button>
      </div>
    </div>
  );
}
