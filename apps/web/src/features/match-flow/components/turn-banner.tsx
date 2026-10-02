'use client';

import { useEffect, useState } from 'react';
import type { ControlMode } from '@the-cricketer/game-core';

type Key = 'bat' | 'bowl' | 'non';

const TEXT: Record<Key, string> = {
  bat: 'YOU’RE ON STRIKE',
  bowl: 'YOUR OVER',
  non: 'You’re at the non-striker’s end',
};

/**
 * A short, non-blocking banner when control passes to the player: "YOU'RE ON STRIKE", "YOUR OVER", or a note that
 * they are waiting at the non-striker's end. Announced politely to screen readers; it simply appears and fades
 * (no movement), so reduced motion needs no special case.
 */
export function PlayerTurnBanner({
  mode,
  youStatus,
  side,
}: {
  mode: ControlMode;
  youStatus: string | null;
  side: 'batting' | 'bowling' | null;
}) {
  const key: Key | null =
    mode === 'HUMAN_BATTING'
      ? 'bat'
      : mode === 'HUMAN_BOWLING'
        ? 'bowl'
        : mode === 'AI_SIMULATION' &&
            side === 'batting' &&
            youStatus === 'non_striker'
          ? 'non'
          : null;
  // a new turn shows the banner again (state adjusted while rendering, the supported pattern for "reset on change")
  const [previous, setPrevious] = useState<Key | null>(null);
  const [hidden, setHidden] = useState(false);
  if (key !== previous) {
    setPrevious(key);
    setHidden(false);
  }
  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => setHidden(true), 2600);
    return () => clearTimeout(timer);
  }, [key]);
  return (
    <div className="turn-banner-slot" role="status" aria-live="polite">
      {key && !hidden ? (
        <p className="turn-banner" data-testid="turn-banner">
          {TEXT[key]}
        </p>
      ) : null}
    </div>
  );
}
