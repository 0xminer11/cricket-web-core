'use client';

import { PlayerAvatar } from '../components/player-avatar';
import { ChoiceCard, ChoiceGroup } from '../components/primitives';
import type { StepErrors } from '../schemas/steps';
import type { CreationOptions, PlayerCreationDraft } from '../types';

const GROUPS = [
  { category: 'face', field: 'facePresetId', legend: 'Face' },
  { category: 'skin', field: 'skinToneId', legend: 'Skin tone' },
  { category: 'hairStyle', field: 'hairStyleId', legend: 'Hair style' },
  { category: 'hairColor', field: 'hairColorId', legend: 'Hair colour' },
  { category: 'beard', field: 'beardStyleId', legend: 'Beard' },
  { category: 'body', field: 'bodyPresetId', legend: 'Build' },
] as const;

export function AppearanceStep({
  draft,
  options,
  errors,
  onChange,
}: {
  draft: PlayerCreationDraft;
  options: CreationOptions;
  errors: StepErrors;
  onChange: (patch: Partial<PlayerCreationDraft>) => void;
}) {
  const set = (patch: Partial<PlayerCreationDraft['appearance']>) =>
    onChange({ appearance: { ...draft.appearance, ...patch } });
  const { min, max, step } = options.heightRange;
  return (
    <div className="appearance-layout">
      <div className="appearance-preview">
        <PlayerAvatar
          options={options}
          appearance={draft.appearance}
          label="Preview of your cricketer's look"
        />
        <p className="hint">
          A simple preview. The full 3D look arrives later.
        </p>
      </div>
      <div className="stack">
        {GROUPS.map(({ category, field, legend }) => {
          const group = options.appearance.find((g) => g.category === category);
          return (
            <ChoiceGroup key={category} legend={legend} error={errors[field]}>
              {group?.options.map((o) => (
                <ChoiceCard
                  key={o.id}
                  name={field}
                  value={o.id}
                  checked={draft.appearance[field] === o.id}
                  title={o.name}
                  swatch={o.swatch}
                  onSelect={(id) => set({ [field]: id })}
                />
              ))}
            </ChoiceGroup>
          );
        })}
        <div className="field">
          <label htmlFor="height">
            Height: {Math.round(draft.appearance.heightScale * 100)}% of average
          </label>
          <input
            id="height"
            type="range"
            min={min}
            max={max}
            step={step}
            value={draft.appearance.heightScale}
            onChange={(e) =>
              set({ heightScale: Number(Number(e.target.value).toFixed(2)) })
            }
          />
        </div>
      </div>
    </div>
  );
}
