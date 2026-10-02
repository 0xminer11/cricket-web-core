'use client';

import { useEffect, useRef, useState } from 'react';
import type { MatchSettings } from '../state/settings';

/**
 * Pause menu: Resume, Scorecard, Settings and Save & Exit. Save & Exit is the way out: the match is already saved
 * between balls, so leaving never forfeits it, and there is deliberately no "quit match".
 */
export function PauseMenu({
  settings,
  onUpdate,
  onResume,
  onScorecard,
  onSaveAndExit,
  reducedMotionSystem,
}: {
  settings: MatchSettings;
  onUpdate: (patch: Partial<MatchSettings>) => void;
  onResume: () => void;
  onScorecard: () => void;
  onSaveAndExit: () => void;
  reducedMotionSystem: boolean;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onResume();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResume]);
  return (
    <div
      className="pause-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Paused"
      data-testid="pause-menu"
    >
      <p>Paused</p>
      <button
        ref={first}
        type="button"
        className="button button-primary"
        onClick={onResume}
        data-testid="pause-resume"
      >
        Resume
      </button>
      <button
        type="button"
        className="button"
        onClick={onScorecard}
        data-testid="pause-scorecard"
      >
        Scorecard
      </button>
      <button
        type="button"
        className="button"
        aria-expanded={showSettings}
        onClick={() => setShowSettings((v) => !v)}
        data-testid="pause-settings"
      >
        Settings
      </button>
      {showSettings ? (
        <div className="settings-panel" data-testid="settings-panel">
          <label className="assist-toggle">
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(e) => onUpdate({ sound: e.target.checked })}
            />{' '}
            Sound
          </label>
          <label className="assist-toggle">
            <input type="checkbox" checked={false} disabled readOnly /> Music{' '}
            <span className="hud-muted">(no music yet)</span>
          </label>
          <label>
            Quality{' '}
            <select
              value={settings.quality}
              onChange={(e) =>
                onUpdate({
                  quality: e.target.value as MatchSettings['quality'],
                })
              }
            >
              <option value="auto">Automatic</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            Reduced motion{' '}
            <select
              value={settings.reducedMotion}
              onChange={(e) =>
                onUpdate({
                  reducedMotion: e.target
                    .value as MatchSettings['reducedMotion'],
                })
              }
            >
              <option value="system">
                Follow my device ({reducedMotionSystem ? 'on' : 'off'})
              </option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label>
            Batting assist{' '}
            <select
              value={settings.battingAssist}
              onChange={(e) =>
                onUpdate({
                  battingAssist: e.target
                    .value as MatchSettings['battingAssist'],
                })
              }
            >
              <option value="off">Off</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="auto">Auto</option>
            </select>
          </label>
          <label className="assist-toggle">
            <input
              type="checkbox"
              checked={settings.bowlingAssist}
              onChange={(e) => onUpdate({ bowlingAssist: e.target.checked })}
            />{' '}
            Assisted bowling timing
          </label>
          <p className="hint">
            Quality and reduced motion apply from the next ball you play. These
            last for this visit; a reload returns to the defaults.
          </p>
        </div>
      ) : null}
      <button
        type="button"
        className="button"
        onClick={onSaveAndExit}
        data-testid="save-and-exit"
      >
        Save &amp; exit
      </button>
    </div>
  );
}
