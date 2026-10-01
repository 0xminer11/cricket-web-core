'use client';

import { ChoiceCard, ChoiceGroup } from '../components/primitives';
import type { StepErrors } from '../schemas/steps';
import type { CreationOptions, PlayerCreationDraft } from '../types';

export function PersonalityStep({
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
  return (
    <ChoiceGroup
      legend="Personality"
      hint="Every personality is a trade-off and none is better than another. Your choices in your career will shape who you become."
      error={errors.personality}
      columns="wide"
    >
      {options.personalities.map((p) => {
        const id = `personality-${p.id}`;
        return (
          <ChoiceCard
            key={p.id}
            name="personality"
            value={p.id}
            checked={draft.personalityArchetypeId === p.id}
            describedBy={id}
            title={p.name}
            onSelect={(v) => onChange({ personalityArchetypeId: v })}
          >
            <span id={id} className="choice-detail">
              {p.description}
              {p.leansToward.length > 0 ? (
                <>
                  <br />
                  <strong>Leans toward:</strong> {p.leansToward.join(', ')}
                </>
              ) : null}
              {p.givesUp.length > 0 ? (
                <>
                  <br />
                  <strong>Gives up a little:</strong> {p.givesUp.join(', ')}
                </>
              ) : null}
            </span>
          </ChoiceCard>
        );
      })}
    </ChoiceGroup>
  );
}
