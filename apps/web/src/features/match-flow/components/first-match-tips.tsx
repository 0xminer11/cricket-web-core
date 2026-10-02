'use client';

import { useState } from 'react';

/** The first match only: one short line on what to do, per end of the pitch. Not repeated once the match is over. */
export function FirstMatchTips({ mode }: { mode: 'bowling' | 'batting' }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <p className="first-match-tip hint" data-testid="first-match-tip">
      <strong>Your first match.</strong>{' '}
      {mode === 'bowling'
        ? 'Aim at a spot on the pitch → choose a delivery → press BOWL when the marker is in the window.'
        : 'Choose a shot → choose a direction → swing when the bar fills.'}{' '}
      <button
        type="button"
        className="link-button"
        onClick={() => setHidden(true)}
      >
        Got it
      </button>
    </p>
  );
}
