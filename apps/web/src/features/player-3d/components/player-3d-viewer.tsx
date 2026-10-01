'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CameraPresetId,
  LogicalAnimation,
  QualityLevel,
} from '@the-cricketer/game-core';
import type { ViewerEvent } from '@the-cricketer/shared-types';
import { assetRegistry } from '../assets/asset-registry';
import { planCharacter } from '../character/plan';
import type { ViewerSession, SessionFailure } from '../renderer/viewer-session';
import type { CharacterLoadout, ViewerState } from '../types';
import { detectQuality } from '../utils/quality';
import { DevStatsOverlay } from './dev-stats-overlay';
import { PortraitFallback } from './portrait-fallback';
import { ViewerErrorBoundary } from './viewer-error-boundary';

const IS_DEV = process.env.NODE_ENV !== 'production';

export interface Player3DViewerProps {
  readonly loadout: CharacterLoadout;
  /** Used for the accessible description of the 3D scene. */
  readonly playerName: string;
  readonly description: string;
  readonly focus?: CameraPresetId;
  readonly quality?: QualityLevel;
  readonly showAnimationControls?: boolean;
  readonly onEvent?: (event: ViewerEvent) => void;
  readonly onSession?: (session: ViewerSession | null) => void;
  readonly className?: string;
}

const FAILURE_MESSAGES: Record<SessionFailure, string> = {
  webgl_unsupported:
    '3D preview is not available on this device. Your cricketer and kit are shown below.',
  base_asset_failed:
    '3D preview unavailable right now. Your information is still shown below.',
  context_lost: 'The 3D preview was interrupted. Reconnecting…',
  unknown:
    '3D preview unavailable right now. Your information is still shown below.',
};

/**
 * The only React component that touches the 3D scene. It renders the canvas shell immediately and
 * loads Three.js (a separate chunk) afterwards, so pages stay interactive while the character
 * loads. States: loading -> ready | error | unsupported. On error or when WebGL is missing it shows
 * a 2D portrait with a retry button; the page around it keeps working.
 */
export function Player3DViewer(props: Player3DViewerProps) {
  // A retry (or a restored GPU context) remounts the inner viewer, giving it a clean state.
  const [attempt, setAttempt] = useState(0);
  return (
    <ViewerErrorBoundary
      fallback={
        <div className="viewer-shell" data-viewer-state="error">
          <PortraitFallback
            loadout={props.loadout}
            label={`Portrait of ${props.playerName}`}
          />
          <p role="status">
            3D preview unavailable. Your information is still shown below.
          </p>
        </div>
      }
    >
      <ViewerInner
        key={attempt}
        {...props}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    </ViewerErrorBoundary>
  );
}

function ViewerInner({
  onRetry,
  loadout,
  playerName,
  description,
  focus,
  quality,
  showAnimationControls = true,
  onEvent,
  onSession,
  className,
}: Player3DViewerProps & { onRetry: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<ViewerSession | null>(null);
  const [state, setState] = useState<ViewerState>('loading');
  const [failure, setFailure] = useState<SessionFailure | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [animation, setAnimation] = useState<LogicalAnimation | null>(null);
  const [debug, setDebug] = useState(false);
  const level = useMemo<QualityLevel>(
    () => quality ?? detectQuality(),
    [quality],
  );
  const onEventRef = useRef(onEvent);
  const onRetryRef = useRef(onRetry);
  const onSessionRef = useRef(onSession);

  // The plan is derived from the loadout; the viewer only ever draws what the plan says.
  const plan = useMemo(() => planCharacter(loadout, assetRegistry), [loadout]);
  const planRef = useRef(plan);
  // Keep the latest callbacks/plan reachable from async code without reading refs during render.
  useEffect(() => {
    onEventRef.current = onEvent;
    onRetryRef.current = onRetry;
    onSessionRef.current = onSession;
    planRef.current = plan;
  });

  // ---- session lifecycle: create after mount, always dispose ------------------------------------
  useEffect(() => {
    let cancelled = false;
    let session: ViewerSession | null = null;
    onEventRef.current?.({ event: 'viewer_opened', quality: level });
    (async () => {
      const mod = await import('../renderer/viewer-session');
      const host = hostRef.current;
      const canvas = canvasRef.current;
      if (cancelled || !host || !canvas) return;
      session = new mod.ViewerSession(canvas, host, level, {
        onReady: ({ durationMs, bytes, report }) => {
          if (cancelled) return;
          setState('ready');
          onEventRef.current?.({ event: 'viewer_loaded', durationMs, bytes });
          if (report.failedParts.length)
            setWarning('Some equipment could not be shown in 3D.');
        },
        onFailure: (reason) => {
          if (cancelled) return;
          setFailure(reason);
          setState(reason === 'webgl_unsupported' ? 'unsupported' : 'error');
          onEventRef.current?.({
            event: 'viewer_load_failed',
            reason: reason === 'unknown' ? 'unknown' : reason,
          });
          // A lost GPU context can be restored by rebuilding the viewer.
          if (reason === 'context_lost')
            setTimeout(() => !cancelled && onRetryRef.current(), 800);
        },
        onPartialFailure: () => {
          if (!cancelled)
            setWarning('Some equipment could not be shown in 3D.');
        },
      });
      sessionRef.current = session;
      onSessionRef.current?.(session);
      if (!session.init()) return;
      if (IS_DEV)
        (window as unknown as { __viewer?: unknown }).__viewer = session;
      void session.setPlan(planRef.current);
    })().catch(() => {
      if (!cancelled) {
        setFailure('base_asset_failed');
        setState('error');
        onEventRef.current?.({
          event: 'viewer_load_failed',
          reason: 'base_asset_failed',
        });
      }
    });
    return () => {
      cancelled = true;
      session?.dispose();
      sessionRef.current = null;
      onSessionRef.current?.(null);
      if (IS_DEV)
        (window as unknown as { __viewer?: unknown }).__viewer = undefined;
    };
  }, [level]);

  // ---- follow loadout changes (preview, equip, appearance) --------------------------------------
  useEffect(() => {
    void sessionRef.current?.setPlan(plan);
  }, [plan]);
  useEffect(() => {
    if (focus) sessionRef.current?.focus(focus);
  }, [focus]);

  const play = useCallback((logical: LogicalAnimation) => {
    setAnimation(logical);
    sessionRef.current?.setAnimation(logical);
  }, []);

  const unavailable = state === 'error' || state === 'unsupported';
  const retry = onRetry;

  return (
    <div
      className={['viewer-shell', className].filter(Boolean).join(' ')}
      data-viewer-state={state}
      data-quality={level}
    >
      <div
        ref={hostRef}
        className="viewer-stage"
        tabIndex={unavailable ? -1 : 0}
        role="group"
        aria-roledescription="3D viewer"
        aria-label={`3D preview of ${playerName}. Drag to rotate, scroll or pinch to zoom, or use the buttons below. Arrow keys rotate and plus and minus zoom.`}
        aria-describedby="viewer-description"
        hidden={false}
      >
        <canvas
          ref={canvasRef}
          className="viewer-canvas"
          aria-hidden="true"
          style={{ visibility: unavailable ? 'hidden' : 'visible' }}
        />
        {state === 'loading' ? (
          <div className="viewer-overlay" role="status">
            <svg
              className="viewer-silhouette"
              viewBox="0 0 120 160"
              aria-hidden="true"
            >
              <circle cx="60" cy="40" r="22" />
              <rect x="32" y="66" width="56" height="62" rx="16" />
              <rect x="38" y="124" width="16" height="32" rx="6" />
              <rect x="66" y="124" width="16" height="32" rx="6" />
            </svg>
            <p>Preparing your cricketer…</p>
          </div>
        ) : null}
        {unavailable ? (
          <div className="viewer-overlay">
            <PortraitFallback
              loadout={loadout}
              label={`Portrait of ${playerName}`}
            />
            <p role="status">
              {failure ? FAILURE_MESSAGES[failure] : '3D preview unavailable.'}
            </p>
            {state === 'error' ? (
              <button type="button" className="button" onClick={retry}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p id="viewer-description" className="sr-only">
        {description}
      </p>
      {warning ? (
        <p role="status" className="hint">
          {warning}
        </p>
      ) : null}
      {state === 'ready' ? (
        <div
          className="viewer-controls"
          role="toolbar"
          aria-label="3D view controls"
        >
          <button
            type="button"
            className="button"
            onClick={() => sessionRef.current?.rotate(-0.5)}
          >
            Rotate left
          </button>
          <button
            type="button"
            className="button"
            onClick={() => sessionRef.current?.rotate(0.5)}
          >
            Rotate right
          </button>
          <button
            type="button"
            className="button"
            onClick={() => sessionRef.current?.zoom(0.8)}
          >
            Zoom in
          </button>
          <button
            type="button"
            className="button"
            onClick={() => sessionRef.current?.zoom(1.25)}
          >
            Zoom out
          </button>
          <button
            type="button"
            className="button"
            onClick={() => sessionRef.current?.resetView()}
          >
            Reset view
          </button>
          {(
            ['camera.full_body', 'camera.upper_body', 'camera.face'] as const
          ).map((id) => (
            <button
              key={id}
              type="button"
              className="button"
              onClick={() => sessionRef.current?.focus(id)}
            >
              {id === 'camera.full_body'
                ? 'Full body'
                : id === 'camera.upper_body'
                  ? 'Upper body'
                  : 'Face'}
            </button>
          ))}
          {showAnimationControls ? (
            <>
              <button
                type="button"
                className="button"
                aria-pressed={animation === 'idle'}
                onClick={() => play('idle')}
              >
                Idle
              </button>
              <button
                type="button"
                className="button"
                aria-pressed={animation === 'idle_bat'}
                onClick={() => play('idle_bat')}
              >
                Hold bat
              </button>
              <button
                type="button"
                className="button"
                aria-pressed={animation === 'batting_stance'}
                onClick={() => play('batting_stance')}
              >
                Batting stance
              </button>
            </>
          ) : null}
          {IS_DEV ? (
            <button
              type="button"
              className="button"
              aria-pressed={debug}
              onClick={() => setDebug((v) => !v)}
            >
              Debug
            </button>
          ) : null}
        </div>
      ) : null}
      {IS_DEV && debug ? (
        <DevStatsOverlay getSession={() => sessionRef.current} />
      ) : null}
    </div>
  );
}
