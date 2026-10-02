'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { detectQuality } from '../../player-3d/utils/quality';
import type { SceneEvent } from '../core/scene-port';
import { matchClient } from '../api';
import {
  useMatchController,
  usePrefersReducedMotion,
} from '../hooks/use-match-controller';
import { FirstMatchTips } from '../../match-flow/components/first-match-tips';
import { InningsBreakScreen } from '../../match-flow/components/innings-break';
import { OverSummaryCard } from '../../match-flow/components/over-summary';
import { PauseMenu } from '../../match-flow/components/pause-menu';
import { PlayerTurnBanner } from '../../match-flow/components/turn-banner';
import { ScorecardOverlay } from '../../match-flow/components/scorecard-overlay';
import {
  SimulationFeed,
  SimulationPanel,
} from '../../match-flow/components/simulation-panel';
import { getSettings, useMatchSettings } from '../../match-flow/state/settings';
import { BattingPanel } from './batting-panel';
import { cuesForResult, MatchSound } from '../core/match-sound';
import { DeliveryPanel } from './delivery-panel';
import { ScoreHud } from './hud';
import { BowlerSelect, ErrorBanner } from './phase-panels';

declare global {
  interface Window {
    /** Development/test hook: read-only view of the live match. Never present in production builds. */
    __cricketerMatch?: {
      snapshot(): unknown;
      scene(): unknown;
      canvasCount(): number;
      /** Batting: how far away the best moment to swing is (test hook). */
      cue(): { cue: number; secondsToIdeal: number; shotId: string } | null;
      /** Milliseconds the last tap took from the pointer event to the recorded swing (test hook). */
      swingLatencyMs(): number | null;
    };
  }
}

const SEQUENCE_STATES = [
  'RUN_UP',
  'RELEASED',
  'BALL_IN_FLIGHT',
  'PITCHED',
  'BATTER_ACTION',
  'RESULT',
];

export interface MatchViewProps {
  readonly matchId: string;
  /** The player's first career match: short tips are shown. */
  readonly firstMatch?: boolean;
  /** Where the live match is (innings, break, completed), so the flow controller can follow it. */
  readonly onLiveState?: (live: {
    phase: string;
    inningsNumber: number;
  }) => void;
  /** Save & Exit. */
  readonly onExit?: () => void;
}

/** The match screen: Phaser world + DOM HUD and controls, driven by one controller. */
export function MatchView({
  matchId,
  firstMatch = false,
  onLiveState,
  onExit,
}: MatchViewProps) {
  const router = useRouter();
  const { settings, update: updateSettings } = useMatchSettings();
  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pausedByUi = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const systemReduced = usePrefersReducedMotion();
  const reduced =
    settings.reducedMotion === 'system'
      ? systemReduced
      : settings.reducedMotion === 'on';
  const completeRef = useRef<(id: string) => void>(() => undefined);
  useEffect(() => {
    completeRef.current = (id) => router.push(`/match/${id}/result`);
  }, [router]);
  const { controller, snapshot } = useMatchController(matchId, (id) =>
    completeRef.current(id),
  );
  const [sceneState, setSceneState] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );
  const [fps, setFps] = useState<number | null>(null);
  const swingLatency = useRef<number | null>(null);
  const sound = useRef(new MatchSound());
  const gameRef = useRef<{ debug(): unknown; canvasCount(): number } | null>(
    null,
  );

  // the global header and footer are hidden while a match is on screen
  useEffect(() => {
    document.body.classList.add('match-immersive');
    return () => document.body.classList.remove('match-immersive');
  }, []);

  // the comfort settings of this visit (never game state, and never stored in the browser): assisted timing is the default for people who ask
  // for reduced motion
  useEffect(() => {
    controller.setAssist(settings.bowlingAssist || reduced);
    controller.setBattingAssist(settings.battingAssist);
    controller.setSimulationSpeed(settings.simulationSpeed);
    sound.current.setEnabled(settings.sound);
  }, [controller, reduced, settings]);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    const started = performance.now();
    const params = new URLSearchParams(window.location.search);
    const dev = process.env.NODE_ENV !== 'production';
    const saved = getSettings();
    const failAssets = dev
      ? (params.get('failAssets') ?? '').split(',').filter(Boolean)
      : [];
    const host = {
      emit(event: SceneEvent): boolean | void {
        switch (event.type) {
          case 'SCENE_READY':
            setSceneState('ready');
            matchClient.track(
              'match_scene_loaded',
              `${detectQuality()}:${Math.round(performance.now() - started)}ms`,
            );
            return;
          case 'SWING_INPUT': {
            // the pointer handler goes straight to the controller (no React render in between); this measures it
            const t0 = performance.now();
            const handled = controller.handleSceneEvent(event);
            swingLatency.current = performance.now() - t0;
            return handled;
          }
          case 'BAT_CONTACT':
          case 'RESULT': {
            // sound follows the engine's result: the cues come from what the server said, never from the scene
            const handled = controller.handleSceneEvent(event);
            const result = controller.resultInPlay();
            if (result)
              for (const scheduled of cuesForResult(result))
                if (
                  scheduled.at ===
                  (event.type === 'RESULT' ? 'result' : 'contact')
                )
                  sound.current.play(scheduled.cue);
            return handled;
          }
          case 'FPS_SAMPLE':
            setFps(event.fps);
            return;
          case 'ASSET_WARNING':
            if (dev) console.warn(`[match] ${event.message}`);
            matchClient.track('match_visual_error', 'asset_fallback');
            return;
          default:
            return controller.handleSceneEvent(event);
        }
      },
    };
    void import('../phaser/game')
      .then(({ createMatchGame }) => {
        if (cancelled || !stage.current) return;
        const game = createMatchGame({
          parent: stage.current,
          host,
          quality: saved.quality === 'auto' ? detectQuality() : saved.quality,
          reducedMotion:
            saved.reducedMotion === 'system'
              ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
              : saved.reducedMotion === 'on',
          debug: dev && params.get('debug') === '1',
          simulateAssetFailures: failAssets,
        });
        gameRef.current = game;
        controller.attachScene(game.port);
        if (dev)
          window.__cricketerMatch = {
            snapshot: () => controller.getSnapshot(),
            scene: () => game.debug(),
            canvasCount: () => game.canvasCount(),
            cue: () => controller.battingCue(),
            swingLatencyMs: () => swingLatency.current,
          };
        destroy = () => {
          game.destroy();
          gameRef.current = null;
        };
      })
      .catch(() => {
        if (!cancelled) setSceneState('failed');
        matchClient.track('match_visual_error', 'scene_load_failed');
      });
    return () => {
      cancelled = true;
      controller.attachScene(null);
      destroy?.();
      if (window.__cricketerMatch) delete window.__cricketerMatch;
    };
  }, [controller]);

  // optional haptics: a short pulse for a Perfect contact and a longer one for a wicket (never relied on)
  const feedbackContact = snapshot.batting.feedback?.contact;
  const wicketShown = snapshot.banner?.tone === 'wicket';
  useEffect(() => {
    if (reduced || typeof navigator.vibrate !== 'function') return;
    try {
      if (feedbackContact === 'PERFECT') navigator.vibrate(30);
    } catch {
      /* unsupported */
    }
  }, [feedbackContact, reduced]);
  useEffect(() => {
    if (reduced || !wicketShown || typeof navigator.vibrate !== 'function')
      return;
    try {
      navigator.vibrate([60, 40, 60]);
    } catch {
      /* unsupported */
    }
  }, [wicketShown, reduced]);

  const match = snapshot.display ?? snapshot.authoritative;

  // the flow controller follows the live match (which innings, the break, the end)
  const livePhase = snapshot.authoritative?.phase;
  const liveInnings = snapshot.authoritative?.innings.number;
  useEffect(() => {
    if (livePhase && liveInnings)
      onLiveState?.({ phase: livePhase, inningsNumber: liveInnings });
  }, [livePhase, liveInnings, onLiveState]);

  // opening the scorecard or the menu pauses the presentation; closing gives it back
  const openOverlay = useCallback(
    (which: 'scorecard' | 'menu') => {
      if (!controller.getSnapshot().paused) {
        controller.setPaused(true);
        pausedByUi.current = true;
      }
      if (which === 'scorecard') {
        setMenuOpen(false);
        setScorecardOpen(true);
        matchClient.track('scorecard_viewed', 'live');
      } else setMenuOpen(true);
    },
    [controller],
  );
  const closeOverlays = useCallback(() => {
    setScorecardOpen(false);
    setMenuOpen(false);
    if (pausedByUi.current) {
      pausedByUi.current = false;
      controller.setPaused(false);
    }
  }, [controller]);
  const state = snapshot.bowlingState;
  const phase = match?.phase;
  const batting = snapshot.mode === 'batting';
  const battingState = snapshot.batting.state;
  const playing = batting
    ? battingState !== 'WAITING'
    : SEQUENCE_STATES.includes(state);

  // desktop shortcuts: Space bowls, arrows move the aim, 1-9 pick a delivery
  const onKey = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable)
      )
        return;
      if (scorecardOpen || menuOpen) return;
      if (event.key === ' ' || event.key === 'Enter') {
        if (target?.closest('button, a, [role="radio"], summary')) return;
        event.preventDefault();
        if (controller.getSnapshot().overSummary) {
          controller.dismissOverSummary();
          return;
        }
        if (controller.getSnapshot().mode === 'batting') {
          // Space faces the next ball, and then swings
          if (controller.getSnapshot().batting.canFace)
            void controller.faceNextBall();
          else controller.swing();
        } else controller.bowl();
        return;
      }
      if (controller.getSnapshot().mode === 'batting') {
        const actions = [
          'defend',
          'drive',
          'leg_side',
          'back_foot',
          'loft',
        ] as const;
        const index = /^[1-5]$/.test(event.key) ? Number(event.key) - 1 : -1;
        if (index >= 0) controller.setBattingAction(actions[index]!);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          // arrows lean toward the side they point to ON SCREEN: from behind a right-hander the off side is on
          // the right; for a left-hander it is mirrored
          event.preventDefault();
          const snap = controller.getSnapshot();
          const mirror = snap.authoritative?.striker?.hand === 'left' ? -1 : 1;
          const step = (event.key === 'ArrowRight' ? 0.5 : -0.5) * mirror;
          controller.setBattingDirection(snap.batting.input.direction + step);
        }
        return;
      }
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const move = arrows[event.key];
      if (move && controller.machine.inputOpen) {
        event.preventDefault();
        controller.nudgeTarget(move[0], move[1], event.shiftKey);
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const option =
          controller.getSnapshot().deliveries[Number(event.key) - 1];
        if (option) controller.selectDelivery(option.id);
      }
    },
    [controller, scorecardOpen, menuOpen],
  );
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  if (snapshot.status === 'error' && !match)
    return (
      <div className="stack" role="alert">
        <p className="alert">
          {snapshot.error?.message ?? 'The match could not be loaded.'}
        </p>
        <button
          type="button"
          className="button"
          onClick={() => void controller.load()}
        >
          Try again
        </button>
        <Link className="button" href="/career">
          Back to career
        </Link>
      </div>
    );

  return (
    <div
      className="match-shell"
      data-testid="match-shell"
      data-bowling-state={state}
      data-mode={snapshot.mode}
      data-batting-state={battingState}
      data-phase={phase ?? 'loading'}
      data-scene={sceneState}
    >
      <div className="match-bar">
        <button
          type="button"
          className="button"
          onClick={() => openOverlay('menu')}
          aria-label="Open the menu; Save and exit keeps your progress"
          data-testid="menu-open"
        >
          ☰ Menu
        </button>
        <p className="match-title">
          {match
            ? `${match.format.name} · ${match.pitch.name} pitch`
            : 'Loading match…'}
        </p>
        <div className="match-bar-actions">
          {playing ? (
            <button
              type="button"
              className="button"
              onClick={() => controller.skip()}
              data-testid="skip"
            >
              Skip
            </button>
          ) : null}
          <button
            type="button"
            className="button"
            onClick={() => openOverlay('scorecard')}
            data-testid="scorecard-open"
          >
            Scorecard
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={snapshot.paused}
            onClick={() =>
              snapshot.paused ? closeOverlays() : openOverlay('menu')
            }
            data-testid="pause"
          >
            {snapshot.paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      {match ? <ScoreHud match={match} /> : null}

      <div className="match-body">
        <div className="match-main">
          <div className="match-stage-wrap">
            <div
              className="match-stage"
              ref={stage}
              data-testid="match-stage"
              aria-hidden="true"
            />
            {sceneState === 'failed' ? (
              <p className="match-alert is-error" role="alert">
                The match view could not start on this device. Your match is
                safe; try reloading.
              </p>
            ) : null}
            {snapshot.waitingForServer ? (
              <p className="stage-pill" role="status">
                Waiting for the umpire…
              </p>
            ) : null}
            {menuOpen ? (
              <PauseMenu
                settings={settings}
                onUpdate={updateSettings}
                reducedMotionSystem={systemReduced}
                onResume={closeOverlays}
                onScorecard={() => openOverlay('scorecard')}
                onSaveAndExit={() => {
                  matchClient.track('match_exited', 'save_and_exit');
                  if (onExit) onExit();
                  else router.push('/career');
                }}
              />
            ) : null}
            {fps !== null && process.env.NODE_ENV !== 'production' ? (
              <span className="fps-debug" data-testid="fps">
                {fps} fps
              </span>
            ) : null}
          </div>

          <div
            className="match-live"
            role="status"
            aria-live="polite"
            data-testid="live-result"
          >
            {snapshot.banner ? (
              <>
                <strong className={`result-${snapshot.banner.tone}`}>
                  {snapshot.banner.headline}
                </strong>{' '}
                <span>{snapshot.banner.detail}</span>
              </>
            ) : null}
            <span className="sr-only">{snapshot.banner?.announcement}</span>
          </div>
        </div>

        <section
          className="match-dock"
          aria-label={batting ? 'Batting controls' : 'Bowling controls'}
        >
          <ErrorBanner controller={controller} snapshot={snapshot} />
          {firstMatch ? (
            <FirstMatchTips mode={batting ? 'batting' : 'bowling'} />
          ) : null}
          <PlayerTurnBanner
            mode={snapshot.controlMode}
            youStatus={match?.you.status ?? null}
            side={match?.you.side ?? null}
          />
          {snapshot.overSummary && !playing ? (
            <OverSummaryCard
              summary={snapshot.overSummary}
              onContinue={() => controller.dismissOverSummary()}
            />
          ) : snapshot.over ? (
            <p className="over-summary" data-testid="over-summary">
              <strong>{snapshot.over.title}</strong> {snapshot.over.line}
            </p>
          ) : null}
          {snapshot.last && !playing ? (
            <p className="last-delivery" data-testid="last-delivery">
              {snapshot.last.speedKmh} km/h · {snapshot.last.variation} ·{' '}
              {snapshot.last.zone}
            </p>
          ) : null}
          {snapshot.simulation ? (
            // balls the server has already played are being shown, whatever panel the match is on: this must be
            // visible for the reveal to finish, because finishing it is what unlocks the controls
            <SimulationFeed controller={controller} snapshot={snapshot} />
          ) : !match ? (
            <p role="status">Loading the match…</p>
          ) : batting && (match.phase === 'ready_to_bat' || playing) ? (
            <BattingPanel
              controller={controller}
              snapshot={snapshot}
              match={match}
              sound={{
                enabled: settings.sound,
                toggle: () => updateSettings({ sound: !settings.sound }),
              }}
            />
          ) : playing ? (
            <p
              className="bowling-status"
              role="status"
              data-testid="bowling-status"
            >
              {state === 'RESULT' ? 'Result' : 'Bowling…'}
            </p>
          ) : match.phase === 'bowler_select' ? (
            <>
              <BowlerSelect
                controller={controller}
                match={match}
                chosen={snapshot.input.bowlerId}
                busy={snapshot.busy}
              />
              {snapshot.input.bowlerId && snapshot.deliveries.length ? (
                <DeliveryPanel
                  controller={controller}
                  snapshot={snapshot}
                  match={match}
                />
              ) : null}
            </>
          ) : match.phase === 'ready_to_bowl' ? (
            <DeliveryPanel
              controller={controller}
              snapshot={snapshot}
              match={match}
            />
          ) : match.phase === 'simulate_required' ? (
            <SimulationPanel
              controller={controller}
              snapshot={snapshot}
              match={match}
              settings={settings}
              onSpeed={(speed) => updateSettings({ simulationSpeed: speed })}
              matchId={matchId}
            />
          ) : match.phase === 'innings_break' ? (
            <InningsBreakScreen
              match={match}
              busy={snapshot.busy}
              onContinue={() => void controller.advance()}
              onScorecard={() => openOverlay('scorecard')}
            />
          ) : null}
        </section>
      </div>
      {scorecardOpen ? (
        <ScorecardOverlay matchId={matchId} onClose={closeOverlays} />
      ) : null}
    </div>
  );
}
