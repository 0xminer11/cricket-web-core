'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  BowlingLabRequest,
  BowlingLabResultDto,
  DeliveryCardDto,
  DeliveryOutcomeDto,
  ResolvedShotDto,
} from '@the-cricketer/shared-types';
import { detectQuality } from '../../player-3d/utils/quality';
import { matchClient } from '../api';
import { classifyTarget } from '../core/coordinates';
import type { NormalizedTarget } from '../core/coordinates';
import type { FlightInput, SceneEvent, ScenePort } from '../core/scene-port';
import { LENGTH_LABELS, LINE_LABELS } from '@the-cricketer/game-core';

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

/**
 * DEVELOPMENT ONLY. Rare results (bowled, LBW, a clean miss) almost never come out of the engine for an
 * AI batter, yet the scene must be checked against them. This swaps in a SYNTHETIC shot and outcome on
 * the client, for presentation QA only. It is never sent to the server and never touches a match.
 */
const PREVIEWS = [
  'engine result',
  'bowled',
  'lbw',
  'miss',
  'edge',
  'edge four',
  'caught',
  'six',
  'four',
  'wide',
  'no ball',
] as const;
type Preview = (typeof PREVIEWS)[number];

function applyPreview(
  result: BowlingLabResultDto,
  preview: Preview,
): Pick<BowlingLabResultDto, 'delivery' | 'shot' | 'outcome'> {
  if (preview === 'engine result') return result;
  const shot: ResolvedShotDto = { ...result.shot };
  const outcome: DeliveryOutcomeDto = {
    ...result.outcome,
    runsOffBat: 0,
    extras: 0,
    extraType: null,
    wicketType: null,
    legal: true,
    totalRuns: 0,
    distanceClass: 'infield',
    headline: 'DOT BALL',
    detail: `${preview} (synthetic preview)`,
  };
  let delivery = result.delivery;
  switch (preview) {
    case 'bowled':
    case 'lbw':
      shot.contactQuality = 'miss';
      outcome.wicketType = preview;
      outcome.headline = 'WICKET';
      break;
    case 'miss':
      shot.contactQuality = 'miss';
      break;
    case 'edge':
      shot.contactQuality = 'edge';
      shot.worldDirection = 150;
      break;
    case 'edge four':
      shot.contactQuality = 'edge';
      outcome.runsOffBat = 4;
      outcome.totalRuns = 4;
      outcome.headline = 'FOUR';
      break;
    case 'caught':
      shot.contactQuality = 'good';
      shot.category = 'lofted';
      outcome.wicketType = 'caught';
      outcome.headline = 'WICKET';
      break;
    case 'six':
      shot.contactQuality = 'perfect';
      shot.category = 'lofted';
      outcome.runsOffBat = 6;
      outcome.totalRuns = 6;
      outcome.headline = 'SIX';
      outcome.distanceClass = 'six';
      break;
    case 'four':
      shot.contactQuality = 'perfect';
      outcome.runsOffBat = 4;
      outcome.totalRuns = 4;
      outcome.headline = 'FOUR';
      outcome.distanceClass = 'boundary';
      break;
    case 'wide':
      outcome.extras = 1;
      outcome.totalRuns = 1;
      outcome.extraType = 'wide';
      outcome.legal = false;
      outcome.headline = 'WIDE';
      delivery = {
        ...delivery,
        actual: {
          ...delivery.actual,
          line: 'wide_off',
          lineLabel: 'Wide outside off',
        },
      };
      break;
    case 'no ball':
      outcome.extras = 1;
      outcome.totalRuns = 1;
      outcome.extraType = 'no_ball';
      outcome.legal = false;
      outcome.headline = 'NO BALL';
      break;
  }
  return { delivery, shot, outcome };
}

/**
 * Developer bowling lab (`/dev/bowling`, disabled in production). It drives the real scene and the
 * real engine for a single, stateless ball so bowling can be tuned: pick a bowler style, ratings,
 * pitch, seed and aim, then replay the exact same ball and compare the engine's resolved target
 * with where the ball visibly pitched.
 */
export function BowlingLab() {
  const stage = useRef<HTMLDivElement>(null);
  const port = useRef<ScenePort | null>(null);
  const gameRef = useRef<{ debug(): unknown } | null>(null);
  const pendingFlight = useRef<FlightInput | null>(null);
  const [form, setForm] = useState({
    bowlingStyle: 'right_arm_fast' as BowlingLabRequest['bowlingStyle'],
    battingHand: 'right' as 'right' | 'left',
    pitchId: 'pitch.hard' as BowlingLabRequest['pitchId'],
    rating: 60,
    batterRating: 55,
    fatigue: 0,
    seed: 'lab-1',
    execution: 0.5,
    preview: 'engine result' as Preview,
  });
  const [target, setTarget] = useState<NormalizedTarget>({ x: 0.3, y: 0.48 });
  const [cards, setCards] = useState<DeliveryCardDto[]>([]);
  const [variation, setVariation] = useState('delivery.fast.stock');
  const [result, setResult] = useState<BowlingLabResultDto | null>(null);
  const [visual, setVisual] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const targetRef = useRef(target);
  const formRef = useRef(form);
  useEffect(() => {
    targetRef.current = target;
    formRef.current = form;
  });
  const prepare = (): void => {
    const f = formRef.current;
    port.current?.prepare({
      pitchKind: f.pitchId.replace('pitch.', '') as 'green' | 'hard' | 'dry',
      battingHand: f.battingHand,
      bowlerStyle: f.bowlingStyle,
      bowlerName: 'Lab bowler',
      batterName: 'Lab batter',
      bowlingTeamName: 'Lab',
      battingTeamName: 'Lab',
    });
    port.current?.setTarget(targetRef.current, true);
  };

  useEffect(() => {
    document.body.classList.add('match-immersive');
    let cancelled = false;
    let destroy: (() => void) | null = null;
    void import('../phaser/game').then(({ createMatchGame }) => {
      if (cancelled || !stage.current) return;
      const game = createMatchGame({
        parent: stage.current,
        quality: detectQuality(),
        reducedMotion: false,
        debug: true,
        host: {
          emit(event: SceneEvent) {
            if (event.type === 'TARGET_CHANGED') {
              setTarget(event.target);
              port.current?.setTarget(event.target, true);
            }
            if (event.type === 'BALL_RELEASE') {
              const flight = pendingFlight.current;
              if (!flight) return false;
              port.current?.beginFlight(flight);
              return true;
            }
            if (event.type === 'BALL_PITCH')
              setVisual(
                (gameRef.current?.debug() as { lastPitch?: unknown } | null)
                  ?.lastPitch ?? null,
              );
            if (event.type === 'SEQUENCE_COMPLETE') {
              pendingFlight.current = null;
              port.current?.reset();
              port.current?.setTarget(targetRef.current, true);
            }
            return undefined;
          },
        },
      });
      gameRef.current = game;
      port.current = game.port;
      prepare();
      destroy = () => game.destroy();
    });
    return () => {
      cancelled = true;
      destroy?.();
      document.body.classList.remove('match-immersive');
    };
  }, []);

  // keep the scene's bowler, pitch and aim in step with the form
  useEffect(() => {
    prepare();
  }, [form.pitchId, form.battingHand, form.bowlingStyle, target]);

  const bowl = async (): Promise<void> => {
    setError(null);
    setResult(null);
    setVisual(null);
    try {
      const body: BowlingLabRequest = {
        bowlingStyle: form.bowlingStyle,
        battingHand: form.battingHand,
        pitchId: form.pitchId,
        rating: form.rating,
        batterRating: form.batterRating,
        fatigue: form.fatigue,
        seed: form.seed,
        variationId: variation,
        target,
        executionInput: form.execution,
      };
      pendingFlight.current = null;
      port.current?.startRunUp();
      const lab = await matchClient.lab(body);
      setResult(lab);
      setCards(lab.deliveries);
      pendingFlight.current = applyPreview(lab, form.preview);
    } catch (e) {
      port.current?.cancelRunUp();
      setError(e instanceof Error ? e.message : 'The lab request failed');
    }
  };

  const zone = classifyTarget(target);
  return (
    <div className="match-shell lab-shell" data-testid="bowling-lab">
      <header className="match-bar">
        <p className="match-title">Bowling lab (development only)</p>
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
            Style{' '}
            <select
              value={form.bowlingStyle}
              onChange={(e) => {
                setForm({
                  ...form,
                  bowlingStyle: e.target.value as typeof form.bowlingStyle,
                });
                setCards([]);
              }}
            >
              {STYLES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Batter{' '}
            <select
              value={form.battingHand}
              onChange={(e) =>
                setForm({
                  ...form,
                  battingHand: e.target.value as 'right' | 'left',
                })
              }
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
                setForm({
                  ...form,
                  pitchId: e.target.value as typeof form.pitchId,
                })
              }
            >
              {PITCHES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Rating {form.rating}{' '}
            <input
              type="range"
              min={1}
              max={100}
              value={form.rating}
              onChange={(e) =>
                setForm({ ...form, rating: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Batter rating {form.batterRating}{' '}
            <input
              type="range"
              min={1}
              max={100}
              value={form.batterRating}
              onChange={(e) =>
                setForm({ ...form, batterRating: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Fatigue {form.fatigue}{' '}
            <input
              type="range"
              min={0}
              max={100}
              value={form.fatigue}
              onChange={(e) =>
                setForm({ ...form, fatigue: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Execution {form.execution}{' '}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={form.execution}
              onChange={(e) =>
                setForm({ ...form, execution: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Presentation preview{' '}
            <select
              value={form.preview}
              data-testid="lab-preview"
              onChange={(e) =>
                setForm({ ...form, preview: e.target.value as Preview })
              }
            >
              {PREVIEWS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Seed{' '}
            <input
              value={form.seed}
              onChange={(e) => setForm({ ...form, seed: e.target.value })}
            />
          </label>
          <label>
            Variation{' '}
            <input
              value={variation}
              onChange={(e) => setVariation(e.target.value)}
              list="lab-variations"
            />
            <datalist id="lab-variations">
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </datalist>
          </label>
          <label>
            Aim x{' '}
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={target.x}
              data-testid="lab-x"
              onChange={(e) =>
                setTarget({
                  x: Math.min(1, Math.max(0, Number(e.target.value) || 0)),
                  y: target.y,
                })
              }
            />
          </label>
          <label>
            Aim y{' '}
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={target.y}
              data-testid="lab-y"
              onChange={(e) =>
                setTarget({
                  x: target.x,
                  y: Math.min(1, Math.max(0, Number(e.target.value) || 0)),
                })
              }
            />
          </label>
          <p data-testid="lab-aim">
            Aim x={target.x.toFixed(3)} y={target.y.toFixed(3)} ·{' '}
            {LINE_LABELS[zone.line]}, {LENGTH_LABELS[zone.length]}
          </p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void bowl()}
            data-testid="lab-bowl"
          >
            Bowl (same seed repeats the same ball)
          </button>
          {error ? <p className="alert">{error}</p> : null}
          {result ? (
            <pre data-testid="lab-result">
              {JSON.stringify(
                {
                  intended: result.delivery.intended.target,
                  actual: result.delivery.actual.target,
                  line: result.delivery.actual.line,
                  length: result.delivery.actual.length,
                  speedKmh: result.delivery.speedKmh,
                  movement: result.delivery.movement,
                  bounce: result.delivery.bounce,
                  execution: result.delivery.executionRating,
                  shot: result.shot.shotId,
                  contact: result.shot.contactQuality,
                  outcome: result.outcome.headline,
                  visualPitch: visual,
                },
                null,
                2,
              )}
            </pre>
          ) : null}
        </section>
      </div>
    </div>
  );
}
