'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  BattingLabRequest,
  BattingLabResultDto,
} from '@the-cricketer/shared-types';
import { BATTING_ASSISTS } from '@the-cricketer/game-core';
import type { BattingAssist } from '@the-cricketer/game-core';
import { detectQuality } from '../../player-3d/utils/quality';
import { matchClient } from '../api';
import {
  applyBattingPreview,
  BATTING_PREVIEWS,
  errorSecondsFor,
  previewFromLab,
  resultFromLab,
} from './batting-lab-previews';
import type { BattingPreview } from './batting-lab-previews';
import { MANUAL_SHOTS } from '../core/batting-shot-selector';
import type { SceneEvent, ScenePort } from '../core/scene-port';

const STYLES = [
  'right_arm_fast',
  'left_arm_fast',
  'right_arm_medium',
  'left_arm_medium',
  'off_spin',
  'leg_spin',
  'left_arm_orthodox',
  'left_arm_wrist_spin',
] as const;
const PITCHES = ['pitch.green', 'pitch.hard', 'pitch.dry'] as const;
const SPEEDS = [1, 0.5, 0.25, 0.1] as const;

/**
 * Developer batting lab (`/dev/batting`, disabled in production). It plays ONE ball through the real engine
 * and the real scene with a chosen shot, direction and timing error, so the bat-ball contact, the assist and
 * the animation can be inspected: slow motion, freeze at contact, frame stepping and a debug overlay with the
 * ball-to-bat distance. Forced results are SYNTHETIC and presentation-only; they are never sent anywhere.
 */
export function BattingLab() {
  const stage = useRef<HTMLDivElement>(null);
  const port = useRef<ScenePort | null>(null);
  const gameRef = useRef<{ debug(): unknown } | null>(null);
  const [form, setForm] = useState({
    bowlingStyle: 'right_arm_fast' as BattingLabRequest['bowlingStyle'],
    battingHand: 'right' as 'right' | 'left',
    pitchId: 'pitch.hard' as BattingLabRequest['pitchId'],
    batterRating: 60,
    bowlerRating: 60,
    seed: 'lab-1',
    variationId: 'delivery.fast.stock',
    x: 0.5,
    y: 0.5,
    shotId: 'shot.straight_drive',
    direction: 0,
    timingInput: 0,
    assist: 'off' as BattingAssist,
    preview: 'engine result' as BattingPreview,
    speed: 1 as number,
    freezeAtContact: true,
  });
  const formRef = useRef(form);
  const [frozen, setFrozen] = useState(false);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<BattingLabResultDto | null>(null);
  const [debug, setDebug] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    formRef.current = form;
  });

  const prepare = (): void => {
    const f = formRef.current;
    port.current?.prepare({
      mode: 'batting',
      pitchKind: f.pitchId.replace('pitch.', '') as 'green' | 'hard' | 'dry',
      battingHand: f.battingHand,
      bowlerStyle: f.bowlingStyle,
      bowlerName: 'Lab bowler',
      batterName: 'Lab batter',
      bowlingTeamName: 'Lab',
      battingTeamName: 'Lab',
    });
    port.current?.setTimeScale(f.speed);
  };

  useEffect(() => {
    document.body.classList.add('match-immersive');
    let cancelled = false;
    let destroy: (() => void) | null = null;
    let poll = 0;
    void import('../phaser/game').then(({ createMatchGame }) => {
      if (cancelled || !stage.current) return;
      const game = createMatchGame({
        parent: stage.current,
        quality: detectQuality(),
        reducedMotion: false,
        debug: true,
        host: {
          emit(event: SceneEvent) {
            if (event.type === 'SCENE_READY') setReady(true);
            if (
              event.type === 'CONTACT_PRESENTATION' &&
              formRef.current.freezeAtContact
            ) {
              port.current?.setPaused(true);
              setFrozen(true);
            }
            if (event.type === 'SEQUENCE_COMPLETE') {
              port.current?.setPaused(false);
              setFrozen(false);
              port.current?.reset();
            }
            return undefined;
          },
        },
      });
      gameRef.current = game;
      port.current = game.port;
      prepare();
      poll = window.setInterval(() => setDebug(game.debug()), 150);
      destroy = () => game.destroy();
    });
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      destroy?.();
      document.body.classList.remove('match-immersive');
    };
  }, []);

  useEffect(() => {
    prepare();
  }, [form.pitchId, form.battingHand, form.bowlingStyle, form.speed]);

  const play = async (): Promise<void> => {
    setError(null);
    setResult(null);
    setFrozen(false);
    port.current?.setPaused(false);
    try {
      const body: BattingLabRequest = {
        battingHand: form.battingHand,
        batterRating: form.batterRating,
        batterOverrides: {},
        bowlingStyle: form.bowlingStyle,
        bowlerRating: form.bowlerRating,
        pitchId: form.pitchId,
        seed: form.seed,
        variationId: form.variationId,
        target: { x: form.x, y: form.y },
        shotId: form.shotId,
        direction: form.direction,
        timingInput: form.timingInput,
        assist: form.assist,
      };
      const lab = await matchClient.battingLab(body);
      setResult(lab);
      const shown = applyBattingPreview(lab, form.preview);
      prepare();
      port.current?.startDelivery(previewFromLab(shown, form.bowlingStyle), {
        shotId: form.shotId,
        errorSeconds: errorSecondsFor(form.timingInput),
        result: resultFromLab(shown),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The lab request failed');
    }
  };

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div
      className="match-shell lab-shell"
      data-testid="batting-lab"
      data-frozen={frozen}
      data-scene={ready ? 'ready' : 'loading'}
    >
      <header className="match-bar">
        <p className="match-title">Batting lab (development only)</p>
      </header>
      <div className="match-body">
        <div className="match-main">
          <div className="match-stage-wrap">
            <div
              className="match-stage"
              ref={stage}
              data-testid="match-stage"
            />
          </div>
        </div>
        <section className="match-dock lab-controls" aria-label="Lab controls">
          <label>
            Bowler{' '}
            <select
              value={form.bowlingStyle}
              onChange={(e) =>
                set('bowlingStyle', e.target.value as typeof form.bowlingStyle)
              }
            >
              {STYLES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Batter hand{' '}
            <select
              value={form.battingHand}
              onChange={(e) =>
                set('battingHand', e.target.value as 'right' | 'left')
              }
              data-testid="lab-hand"
            >
              <option>right</option>
              <option>left</option>
            </select>
          </label>
          <label>
            Pitch{' '}
            <select
              value={form.pitchId}
              onChange={(e) =>
                set('pitchId', e.target.value as typeof form.pitchId)
              }
            >
              {PITCHES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Batter rating {form.batterRating}{' '}
            <input
              type="range"
              min={1}
              max={100}
              value={form.batterRating}
              onChange={(e) => set('batterRating', Number(e.target.value))}
            />
          </label>
          <label>
            Bowler rating {form.bowlerRating}{' '}
            <input
              type="range"
              min={1}
              max={100}
              value={form.bowlerRating}
              onChange={(e) => set('bowlerRating', Number(e.target.value))}
            />
          </label>
          <label>
            Seed{' '}
            <input
              value={form.seed}
              onChange={(e) => set('seed', e.target.value)}
            />
          </label>
          <label>
            Variation{' '}
            <input
              value={form.variationId}
              onChange={(e) => set('variationId', e.target.value)}
            />
          </label>
          <label>
            Pitching x (0 off … 1 leg){' '}
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={form.x}
              data-testid="lab-x"
              onChange={(e) =>
                set('x', Math.min(1, Math.max(0, Number(e.target.value) || 0)))
              }
            />
          </label>
          <label>
            Pitching y (0 yorker … 1 bouncer){' '}
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={form.y}
              data-testid="lab-y"
              onChange={(e) =>
                set('y', Math.min(1, Math.max(0, Number(e.target.value) || 0)))
              }
            />
          </label>
          <label>
            Shot{' '}
            <select
              value={form.shotId}
              onChange={(e) => set('shotId', e.target.value)}
              data-testid="lab-shot"
            >
              {MANUAL_SHOTS.map((s) => (
                <option key={s.shotId} value={s.shotId}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Direction {form.direction}{' '}
            <input
              type="range"
              min={-1}
              max={1}
              step={0.1}
              value={form.direction}
              onChange={(e) => set('direction', Number(e.target.value))}
            />
          </label>
          <label>
            Timing error {form.timingInput} (−1 early … +1 late){' '}
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={form.timingInput}
              data-testid="lab-timing"
              onChange={(e) => set('timingInput', Number(e.target.value))}
            />
          </label>
          <label>
            Assist{' '}
            <select
              value={form.assist}
              onChange={(e) => set('assist', e.target.value as BattingAssist)}
            >
              {BATTING_ASSISTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            Forced result (presentation only){' '}
            <select
              value={form.preview}
              data-testid="lab-preview"
              onChange={(e) => set('preview', e.target.value as BattingPreview)}
            >
              {BATTING_PREVIEWS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Speed{' '}
            <select
              value={form.speed}
              data-testid="lab-speed"
              onChange={(e) => set('speed', Number(e.target.value))}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s === 1 ? 'normal' : `${s}x`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.freezeAtContact}
              onChange={(e) => set('freezeAtContact', e.target.checked)}
            />{' '}
            Freeze at contact
          </label>
          <button
            type="button"
            className="button button-primary"
            disabled={!ready}
            onClick={() => void play()}
            data-testid="lab-play"
          >
            Play this ball
          </button>
          <div className="preset-row">
            <button
              type="button"
              className="button"
              disabled={!frozen}
              onClick={() => port.current?.step(1 / 60)}
              data-testid="lab-step"
            >
              Step 1 frame
            </button>
            <button
              type="button"
              className="button"
              disabled={!frozen}
              onClick={() => port.current?.step(1 / 6)}
              data-testid="lab-step-10"
            >
              Step 10
            </button>
            <button
              type="button"
              className="button"
              disabled={!frozen}
              onClick={() => {
                port.current?.setPaused(false);
                setFrozen(false);
              }}
              data-testid="lab-resume"
            >
              Resume
            </button>
          </div>
          {error ? <p className="alert">{error}</p> : null}
          {result ? (
            <pre data-testid="lab-result">
              {JSON.stringify(
                {
                  delivery: {
                    variation: result.delivery.variationId,
                    pitched: result.delivery.actual.target,
                    line: result.delivery.actual.line,
                    length: result.delivery.actual.length,
                    speedKmh: result.delivery.speedKmh,
                  },
                  shot: result.shot.shotId,
                  contact: result.shot.contactQuality,
                  timing: result.batting.timing,
                  engineTimingInput: result.engineTimingInput,
                  engineDirectionInput: result.engineDirectionInput,
                  outcome: result.outcome.headline,
                  runs: result.outcome.runsOffBat,
                  wicket: result.outcome.wicketType,
                },
                null,
                2,
              )}
            </pre>
          ) : null}
          <pre data-testid="lab-debug">{JSON.stringify(debug, null, 2)}</pre>
        </section>
      </div>
    </div>
  );
}
