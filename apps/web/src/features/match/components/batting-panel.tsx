'use client';

import { useEffect, useRef, useState } from 'react';
import { BATTING_ASSISTS, BATTING_INPUT } from '@the-cricketer/game-core';
import type { BattingAssist } from '@the-cricketer/game-core';
import type { MatchPlayStateDto } from '@the-cricketer/shared-types';
import {
  ACTION_DESCRIPTIONS,
  ACTION_LABELS,
  BATTING_ACTIONS,
  DIRECTION_LABELS,
  DIRECTION_STEPS,
  HINT_TEXT,
  MANUAL_SHOTS,
} from '../core/batting-shot-selector';
import type { MatchGameplayController } from '../core/gameplay-controller';
import type { ControllerSnapshot } from '../core/gameplay-controller';

const ASSIST_LABEL: Readonly<Record<BattingAssist, string>> = {
  off: 'Off',
  normal: 'Normal',
  high: 'High',
  auto: 'Auto',
};
const ASSIST_TEXT: Readonly<Record<BattingAssist, string>> = {
  off: 'No timing cue, no hints. Pure skill.',
  normal: 'A timing cue and shot hints; a little forgiveness.',
  high: 'A bigger cue and more forgiveness.',
  auto: 'We time it for you. Choose the shot; the result matters less to you than the choice.',
};

const TIMING_TEXT = {
  very_early: 'Very early',
  early: 'Early',
  perfect: 'Perfect timing',
  late: 'Late',
  very_late: 'Very late',
} as const;
const CONTACT_TEXT = {
  PERFECT: 'Perfect contact',
  GOOD: 'Good contact',
  OKAY: 'Decent contact',
  POOR: 'Poor contact',
  EDGE: 'Edged it',
  MISS: 'Missed it',
} as const;

/**
 * The batting controls: what to do, which way, how much help, and SWING. It sends choices, never
 * results. The timing cue reads the scene's own clock, so it shows exactly what the swing is measured by.
 */
export function BattingPanel({
  controller,
  snapshot,
  match,
  sound,
}: {
  controller: MatchGameplayController;
  snapshot: ControllerSnapshot;
  match: MatchPlayStateDto;
  sound: { enabled: boolean; toggle(): void };
}) {
  const b = snapshot.batting;
  const { input } = b;
  const locked = b.state !== 'READING_DELIVERY' && b.state !== 'SHOT_ARMED';
  const [manual, setManual] = useState(false);
  const cueLevel = input.assist;
  const showCue = cueLevel !== 'off';
  const inPlay = b.state !== 'WAITING';
  return (
    <div className="batting-panel" data-testid="batting-panel">
      <div className="bp-head">
        <p className="bp-title">
          <strong>{match.striker?.name ?? 'Your Cricketer'}</strong>{' '}
          <span className="hud-muted">
            on strike
            {b.bowlerName ? ` · facing ${b.bowlerName}` : ''}
            {b.ball ? ` · ${b.ball.speedKmh} km/h` : ''}
          </span>
        </p>
        {match.striker?.balls === 0 && !b.feedback ? (
          <p className="hint" data-testid="batting-tip">
            First ball: choose a shot, watch the ball, then swing when the bar
            is full.
          </p>
        ) : null}
        {b.feedback ? (
          <p
            className="bp-feedback"
            role="status"
            data-testid="batting-feedback"
            data-contact={b.feedback.contact}
            data-timing={b.feedback.timing}
          >
            {b.shotName ? <>{b.shotName} · </> : null}
            <strong>{CONTACT_TEXT[b.feedback.contact]}</strong>
            {b.feedback.assist === 'auto'
              ? ' · timed for you'
              : ` · ${TIMING_TEXT[b.feedback.timing]}`}
          </p>
        ) : null}
      </div>

      <fieldset className="dp-group bp-actions" disabled={locked && inPlay}>
        <legend>Shot</legend>
        <div role="radiogroup" aria-label="Shot">
          {BATTING_ACTIONS.map((action, index) => {
            const selected =
              input.manualShotId === null && input.action === action;
            return (
              <button
                key={action}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`chip bp-action${selected ? ' is-selected' : ''}${input.suggested === action ? ' is-suggested' : ''}`}
                onClick={() => {
                  setManual(false);
                  controller.setBattingAction(action);
                }}
                data-action={action}
                title={ACTION_DESCRIPTIONS[action]}
                aria-keyshortcuts={String(index + 1)}
              >
                {ACTION_LABELS[action]}
                {input.suggested === action ? (
                  <span className="sr-only"> (suggested)</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="bp-selected" data-testid="shot-readout">
          {input.shot ? (
            <>
              <strong>{shotName(input.shot.shotId)}</strong>
              {input.hint ? (
                <span
                  className={`bp-hint is-${input.hint}`}
                  data-testid="shot-hint"
                >
                  {' '}
                  · {HINT_TEXT[input.hint]}
                </span>
              ) : null}
            </>
          ) : (
            <span className="hud-muted">
              The shot is chosen once you can see the ball.
            </span>
          )}
        </p>
      </fieldset>

      <fieldset className="dp-group bp-direction" disabled={locked && inPlay}>
        <legend>Direction</legend>
        <div role="radiogroup" aria-label="Direction">
          {DIRECTION_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              role="radio"
              aria-checked={input.direction === step}
              className={`chip${input.direction === step ? ' is-selected' : ''}`}
              onClick={() => controller.setBattingDirection(step)}
              data-direction={step}
            >
              {DIRECTION_LABELS[String(step)]}
            </button>
          ))}
        </div>
        <p className="hint">
          Leg side ◀ ▶ off side, whichever hand your Cricketer bats with.
        </p>
      </fieldset>

      <details
        className="dp-group bp-advanced"
        open={manual}
        onToggle={(event) => setManual(event.currentTarget.open)}
      >
        <summary>Choose the exact shot (advanced)</summary>
        <label className="bp-manual">
          <span className="sr-only">Exact shot</span>
          <select
            value={input.manualShotId ?? ''}
            disabled={locked && inPlay}
            onChange={(event) =>
              controller.setBattingShot(event.target.value || null)
            }
            data-testid="manual-shot"
          >
            <option value="">Use the simple controls</option>
            {MANUAL_SHOTS.map((shot) => (
              <option key={shot.shotId} value={shot.shotId}>
                {shot.label}
              </option>
            ))}
          </select>
        </label>
      </details>

      <details className="dp-group bp-assist">
        <summary>Batting assist: {ASSIST_LABEL[input.assist]}</summary>
        <div role="radiogroup" aria-label="Batting assist">
          {BATTING_ASSISTS.map((level) => (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={input.assist === level}
              className={`chip${input.assist === level ? ' is-selected' : ''}`}
              onClick={() => controller.setBattingAssist(level)}
              data-assist={level}
            >
              {ASSIST_LABEL[level]}
            </button>
          ))}
        </div>
        <p className="hint">{ASSIST_TEXT[input.assist]}</p>
      </details>

      <div className="dp-group dp-bowl bp-swing">
        {showCue ? (
          <TimingCue controller={controller} active={!locked} />
        ) : null}
        {b.state === 'WAITING' ? (
          <button
            type="button"
            className="button button-primary button-large bowl-button"
            disabled={!b.canFace}
            onClick={() => void controller.faceNextBall()}
            aria-keyshortcuts="Space"
            data-testid="face-ball"
          >
            {b.facing ? 'Bowler coming in…' : 'FACE NEXT BALL'}
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary button-large bowl-button"
            disabled={!input.canSwing}
            onClick={() => controller.swing()}
            aria-keyshortcuts="Space"
            data-testid="swing"
          >
            SWING
          </button>
        )}
        <div className="preset-row">
          <label className="assist-toggle">
            <input
              type="checkbox"
              checked={b.fast}
              onChange={(event) =>
                controller.setFastPresentation(event.target.checked)
              }
              data-testid="fast-presentation"
            />{' '}
            Fast presentation
          </label>
          <label className="assist-toggle">
            <input
              type="checkbox"
              checked={sound.enabled}
              onChange={() => sound.toggle()}
              data-testid="sound-toggle"
            />{' '}
            Sound
          </label>
        </div>
        <p className="hint">
          Tap the pitch or press Space to swing. The bat starts at once; the
          umpire decides what it did.
        </p>
      </div>
    </div>
  );
}

function shotName(shotId: string): string {
  return (
    MANUAL_SHOTS.find((shot) => shot.shotId === shotId)?.label ??
    shotId.replace('shot.', '').replace(/_/g, ' ')
  );
}

/**
 * "Press now" helper (assist Normal and High). The fill rises toward the best moment to swing and falls
 * after it; the text names the moment too, so it does not depend on colour or motion alone.
 */
function TimingCue({
  controller,
  active,
}: {
  controller: MatchGameplayController;
  active: boolean;
}) {
  const fill = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = '';
    const tick = () => {
      const cue = controller.battingCue();
      const value = cue ? cue.cue : 0;
      if (fill.current) fill.current.style.width = `${value * 100}%`;
      const within =
        cue !== null &&
        Math.abs(cue.secondsToIdeal) <=
          BATTING_INPUT.windowSeconds * BATTING_INPUT.timingLabels.perfect;
      const label = !cue
        ? 'Watch the ball'
        : within
          ? 'SWING NOW'
          : cue.secondsToIdeal > 0
            ? 'Wait for it…'
            : 'Too late';
      if (text.current && label !== last) {
        text.current.textContent = label;
        last = label;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [controller, active]);
  return (
    <div
      className="timing-meter bp-cue"
      role="img"
      aria-label="Timing cue. The bar fills as the ball nears the moment to swing."
      data-testid="timing-cue"
    >
      <span className="bp-cue-fill" ref={fill} />
      <span className="timing-label" aria-hidden="true" ref={text}>
        Watch the ball
      </span>
    </div>
  );
}
