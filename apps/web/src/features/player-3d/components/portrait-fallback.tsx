import { APPEARANCE_BY_ID } from '@the-cricketer/game-core';
import type { CharacterLoadout } from '../types';

/**
 * 2D stand-in shown when WebGL is unavailable or the base character cannot load. It uses the same
 * saved appearance ids, so the player still sees themselves; all information stays in the page.
 */
export function PortraitFallback({
  loadout,
  label,
}: {
  loadout: CharacterLoadout;
  label: string;
}) {
  const skin =
    APPEARANCE_BY_ID.get(loadout.appearance.skinToneId)?.swatch ?? '#b9805a';
  const hair =
    APPEARANCE_BY_ID.get(loadout.appearance.hairColorId)?.swatch ?? '#14110f';
  const bald = loadout.appearance.hairStyleId.includes('bald');
  const beard = !loadout.appearance.beardStyleId.endsWith('.none');
  return (
    <svg
      className="portrait-fallback"
      viewBox="0 0 120 160"
      role="img"
      aria-label={label}
    >
      <rect x="30" y="92" width="60" height="68" rx="14" fill="#2b4a5c" />
      <circle cx="60" cy="62" r="28" fill={skin} />
      {bald ? null : (
        <path
          d="M32 58a28 28 0 0 1 56 0c-8-10-16-14-28-14s-20 4-28 14z"
          fill={hair}
        />
      )}
      {beard ? (
        <path d="M38 70c4 22 40 22 44 0-6 10-38 10-44 0z" fill={hair} />
      ) : null}
      <circle cx="50" cy="64" r="2.4" fill="#101b22" />
      <circle cx="70" cy="64" r="2.4" fill="#101b22" />
    </svg>
  );
}
