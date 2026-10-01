import type { CreationOptions } from '../types';

/**
 * Placeholder 2D preview until Module 5. The wizard only depends on this component's props
 * (the appearance ids), so it can later be swapped for a 3D `Player3DViewer` with no changes to
 * the steps. It draws from option swatches only; no assets are loaded.
 */
export function PlayerAvatar({
  options,
  appearance,
  label,
}: {
  options: CreationOptions;
  appearance: {
    skinToneId: string | null;
    hairColorId: string | null;
    hairStyleId: string | null;
    beardStyleId: string | null;
    heightScale: number;
  };
  label: string;
}) {
  const swatch = (
    category: CreationOptions['appearance'][number]['category'],
    id: string | null,
  ) =>
    options.appearance
      .find((c) => c.category === category)
      ?.options.find((o) => o.id === id)?.swatch;
  const skin = swatch('skin', appearance.skinToneId) ?? '#b9805a';
  const hair = swatch('hairColor', appearance.hairColorId) ?? '#14110f';
  const bald = appearance.hairStyleId?.includes('bald') ?? false;
  const beard =
    appearance.beardStyleId && !appearance.beardStyleId.endsWith('.none');
  const scale = appearance.heightScale;
  return (
    <svg className="avatar" viewBox="0 0 120 160" role="img" aria-label={label}>
      <g transform={`translate(60 160) scale(${scale}) translate(-60 -160)`}>
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
      </g>
    </svg>
  );
}
