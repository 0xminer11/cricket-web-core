'use client';

import type { StepErrors } from '../schemas/steps';
import { ChoiceCard, ChoiceGroup, StatGroup } from '../components/primitives';
import type { CreationOptions, PlayerCreationDraft } from '../types';
import { previewFor, roleOf } from '../utils/draft';

const HAND_LABEL: Record<string, string> = {
  right: 'Right-handed',
  left: 'Left-handed',
};

export function StyleStep({
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
  const role = roleOf(options, draft.primaryRoleId);
  const preview = previewFor(options, draft);
  const styles = role
    ? options.bowlingStyles.filter((s) =>
        role.allowedBowlingStyles.includes(s.id),
      )
    : [];
  return (
    <div className="stack">
      <ChoiceGroup
        legend="Role"
        hint="Your role shapes your starting strengths. You can still improve any skill later."
        error={errors.primaryRole}
        columns="wide"
      >
        {options.roles.map((r) => {
          const descId = `role-${r.id}`;
          return (
            <ChoiceCard
              key={r.id}
              name="role"
              value={r.id}
              checked={draft.primaryRoleId === r.id}
              describedBy={descId}
              title={r.name}
              onSelect={(id) => {
                const next = roleOf(options, id);
                const keep =
                  draft.bowlingStyleId !== null &&
                  next?.allowedBowlingStyles.includes(draft.bowlingStyleId);
                onChange({
                  primaryRoleId: id,
                  bowlingStyleId: keep ? draft.bowlingStyleId : null,
                });
              }}
            >
              <span id={descId} className="choice-detail">
                {r.description}
                <br />
                <strong>Best at:</strong> {r.strengths.join(', ')}
                <br />
                <strong>Typical position:</strong> {r.typicalPosition}
                <br />
                <strong>Bowling:</strong> {r.bowlingExpectation}
              </span>
            </ChoiceCard>
          );
        })}
      </ChoiceGroup>

      <ChoiceGroup legend="Batting hand" error={errors.battingHand}>
        {options.battingHands.map((h) => (
          <ChoiceCard
            key={h}
            name="battingHand"
            value={h}
            checked={draft.battingHand === h}
            title={HAND_LABEL[h] ?? h}
            onSelect={(v) => onChange({ battingHand: v })}
          />
        ))}
      </ChoiceGroup>

      {role ? (
        <ChoiceGroup
          legend="Bowling style"
          hint={
            role.bowling === 'required'
              ? 'This role bowls: choose a style.'
              : 'Optional. Batters can bowl a few part-time overs, or skip bowling altogether.'
          }
          error={errors.bowlingStyle}
        >
          {role.bowling !== 'required' ? (
            <ChoiceCard
              name="bowlingStyle"
              value="none"
              checked={draft.bowlingStyleId === null}
              title="No bowling"
              onSelect={() => onChange({ bowlingStyleId: null })}
            />
          ) : null}
          {styles.map((s) => (
            <ChoiceCard
              key={s.id}
              name="bowlingStyle"
              value={s.id}
              checked={draft.bowlingStyleId === s.id}
              title={s.name}
              onSelect={(v) => onChange({ bowlingStyleId: v })}
            />
          ))}
        </ChoiceGroup>
      ) : null}

      {role && preview ? (
        <section
          className="preview-panel"
          aria-live="polite"
          aria-label="Starting strengths"
        >
          <h3>
            Starting strengths{' '}
            <span className="badge">Overall {preview.overall.player}</span>
          </h3>
          <p className="hint">
            These are fixed starting values for this choice; you grow them in
            your career.
          </p>
          <div className="stat-columns">
            <StatGroup
              title="Batting"
              values={preview.attributes.batting}
              only={['timing', 'power', 'placement', 'defence']}
            />
            {draft.bowlingStyleId ? (
              <StatGroup
                title="Bowling"
                values={preview.attributes.bowling}
                only={['pace', 'spin', 'accuracy', 'control']}
              />
            ) : null}
            <StatGroup
              title="Physical"
              values={preview.attributes.physical}
              only={['fitness', 'reflex', 'stamina']}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
