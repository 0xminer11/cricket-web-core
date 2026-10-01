'use client';

import { TextField } from '../../auth/components/fields';
import { normalizeDisplayName } from '@the-cricketer/shared-types';
import type { StepErrors } from '../schemas/steps';
import type { CreationOptions, PlayerCreationDraft } from '../types';
import { countryName } from '../utils/draft';

export function IdentityStep({
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
  const priority = options.countries.priority;
  const rest = options.countries.all
    .filter((c) => !priority.includes(c))
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));
  return (
    <div className="form">
      <TextField
        label="Player name"
        name="displayName"
        autoComplete="off"
        hint={`${options.nameRules.minLength}-${options.nameRules.maxLength} characters. Any language is welcome.`}
        value={draft.displayName}
        onChange={(e) => onChange({ displayName: e.target.value })}
        onBlur={() =>
          onChange({ displayName: normalizeDisplayName(draft.displayName) })
        }
        error={errors.displayName}
        required
      />
      <div className="field">
        <label htmlFor="country">Country</label>
        <p id="country-hint" className="hint">
          Your cricketing identity. It does not decide which team you play for.
        </p>
        <select
          id="country"
          name="country"
          className="input"
          aria-describedby="country-hint"
          value={draft.countryCode}
          onChange={(e) => onChange({ countryCode: e.target.value })}
        >
          <optgroup label="Popular">
            {priority.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
          </optgroup>
          <optgroup label="All countries and regions">
            {rest.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <TextField
        label="Jersey number"
        name="jerseyNumber"
        type="number"
        inputMode="numeric"
        min={options.jerseyRange.min}
        max={options.jerseyRange.max}
        step={1}
        hint={`${options.jerseyRange.min}-${options.jerseyRange.max}. Cosmetic: other players may wear the same number.`}
        value={draft.jerseyNumber === null ? '' : String(draft.jerseyNumber)}
        onChange={(e) =>
          onChange({
            jerseyNumber: e.target.value === '' ? null : Number(e.target.value),
          })
        }
        error={errors.jerseyNumber}
        required
      />
    </div>
  );
}
