'use client';

import { normalizeDisplayName } from '@the-cricketer/shared-types';
import { PlayerAvatar } from '../components/player-avatar';
import { StatGroup } from '../components/primitives';
import type { CreationOptions, PlayerCreationDraft } from '../types';
import { countryName, previewFor, roleOf } from '../utils/draft';

export function ReviewStep({
  draft,
  options,
}: {
  draft: PlayerCreationDraft;
  options: CreationOptions;
}) {
  const role = roleOf(options, draft.primaryRoleId);
  const preview = previewFor(options, draft);
  const personality = options.personalities.find(
    (p) => p.id === draft.personalityArchetypeId,
  );
  const style = options.bowlingStyles.find(
    (s) => s.id === draft.bowlingStyleId,
  );
  if (!role || !preview || !personality)
    return (
      <p role="alert">Some choices are missing. Go back to complete them.</p>
    );
  return (
    <div className="stack">
      <section className="review-head" aria-label="Your cricketer">
        <PlayerAvatar
          options={options}
          appearance={draft.appearance}
          label="Your cricketer"
        />
        <div>
          <h3>{normalizeDisplayName(draft.displayName)}</h3>
          <dl className="summary-list">
            <div>
              <dt>Country</dt>
              <dd>{countryName(draft.countryCode)}</dd>
            </div>
            <div>
              <dt>Jersey</dt>
              <dd>#{draft.jerseyNumber}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{role.name}</dd>
            </div>
            <div>
              <dt>Batting</dt>
              <dd>
                {draft.battingHand === 'left' ? 'Left-handed' : 'Right-handed'}
              </dd>
            </div>
            <div>
              <dt>Bowling</dt>
              <dd>{style?.name ?? 'No bowling'}</dd>
            </div>
            <div>
              <dt>Personality</dt>
              <dd>{personality.name}</dd>
            </div>
            <div>
              <dt>Starting overall</dt>
              <dd>{preview.overall.player}</dd>
            </div>
          </dl>
        </div>
      </section>
      <div className="stat-columns">
        <StatGroup
          title="Batting"
          values={preview.attributes.batting}
          only={['timing', 'power', 'placement', 'defence', 'footwork']}
        />
        {draft.bowlingStyleId ? (
          <StatGroup
            title="Bowling"
            values={preview.attributes.bowling}
            only={['pace', 'spin', 'accuracy', 'control', 'variation']}
          />
        ) : null}
        <StatGroup
          title="Physical"
          values={preview.attributes.physical}
          only={['fitness', 'reflex', 'stamina', 'agility']}
        />
        <StatGroup title="Personality" values={personality.traits} />
      </div>
      <section aria-labelledby="kit-heading">
        <h3 id="kit-heading">Starter equipment</h3>
        <ul className="kit-list">
          {options.starter.loadout.map((i) => (
            <li key={i.slot}>
              <span className="kit-slot">{i.slot.replace('_', ' ')}</span>{' '}
              {i.name}
            </li>
          ))}
        </ul>
        <p className="hint">Equipped for you from day one.</p>
      </section>
      <section aria-labelledby="career-heading">
        <h3 id="career-heading">Career start</h3>
        <p>
          You begin in the <strong>{options.starter.careerTier}</strong> tier
          with <strong>{options.starter.teamName}</strong>, at level{' '}
          {options.starter.level}, with {options.starter.coins.toLocaleString()}{' '}
          coins and {options.starter.gems} gems.
        </p>
      </section>
    </div>
  );
}
