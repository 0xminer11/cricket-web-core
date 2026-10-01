'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProgressBar, Spinner } from '@the-cricketer/ui';
import { APPEARANCE_BY_ID } from '@the-cricketer/game-core';
import { useRequireAuth } from '../../auth/hooks/use-auth';
import { loadoutApi } from '../api/loadout-api';
import { toLoadout, useLoadoutData } from '../hooks/use-loadout';
import {
  formatBonus,
  itemDefinition,
  itemIcon,
  modifiersOf,
  RARITY_LABEL,
  statLabel,
} from '../utils/items';
import { Player3DViewer } from './player-3d-viewer';

export const SLOT_LABEL: Record<string, string> = {
  bat: 'Bat',
  helmet: 'Helmet',
  gloves: 'Gloves',
  pads: 'Pads',
  shoes: 'Shoes',
  jersey: 'Kit',
  pants: 'Trousers',
};
const role = (id: string) =>
  id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
const optionName = (id: string) => APPEARANCE_BY_ID.get(id)?.name ?? '—';

/**
 * /player: the 3D cricketer plus everything the 3D scene shows, as text (name, role, kit,
 * appearance), so nothing essential lives only inside WebGL. The page shell renders first; the
 * viewer loads Three.js and the character afterwards.
 */
export function PlayerPage() {
  const auth = useRequireAuth('/');
  const router = useRouter();
  const { data, error, loading, refresh } = useLoadoutData();
  const loadout = useMemo(
    () => (data ? toLoadout(data.player, data.equipment) : null),
    [data],
  );

  const needsCreation =
    (auth.user && !auth.user.hasCricketer) || error === 'missing';
  useEffect(() => {
    if (needsCreation) router.replace('/create-player');
  }, [needsCreation, router]);

  if (auth.status === 'loading' || (loading && !data) || needsCreation)
    return <Spinner />;
  if (error || !data || !loadout)
    return (
      <div className="stack" role="alert">
        <p className="alert">
          We could not load your cricketer. Please try again.
        </p>
        <button type="button" className="button" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  const { player } = data;
  const s = player.summary;
  const a = player.appearance;
  const description = `${s.displayName}, ${role(s.primaryRole)}, ${s.battingHand}-handed, wearing number ${s.jerseyNumber}.`;
  return (
    <div className="player-layout">
      <Player3DViewer
        loadout={loadout}
        playerName={s.displayName}
        description={description}
        onEvent={(e) => loadoutApi.track(e)}
      />
      <div className="stack player-info">
        <section aria-labelledby="player-name">
          <h2 id="player-name">{s.displayName}</h2>
          <dl className="summary-list">
            <div>
              <dt>Role</dt>
              <dd>{role(s.primaryRole)}</dd>
            </div>
            <div>
              <dt>Batting</dt>
              <dd>
                {s.battingHand === 'left' ? 'Left-handed' : 'Right-handed'}
              </dd>
            </div>
            <div>
              <dt>Bowling</dt>
              <dd>{s.bowlingStyle ? role(s.bowlingStyle) : 'No bowling'}</dd>
            </div>
            <div>
              <dt>Jersey</dt>
              <dd>#{s.jerseyNumber}</dd>
            </div>
            <div>
              <dt>Level</dt>
              <dd>{s.level}</dd>
            </div>
            <div>
              <dt>Overall</dt>
              <dd>{s.overall}</dd>
            </div>
            <div>
              <dt>Career</dt>
              <dd>
                {player.career.tier} tier
                {player.career.teamName ? `, ${player.career.teamName}` : ''}
              </dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="look-heading">
          <h3 id="look-heading">Appearance</h3>
          <dl className="summary-list">
            <div>
              <dt>Face</dt>
              <dd>{optionName(a.facePresetId)}</dd>
            </div>
            <div>
              <dt>Skin tone</dt>
              <dd>{optionName(a.skinToneId)}</dd>
            </div>
            <div>
              <dt>Hair</dt>
              <dd>
                {optionName(a.hairStyleId)}, {optionName(a.hairColorId)}
              </dd>
            </div>
            <div>
              <dt>Beard</dt>
              <dd>{optionName(a.beardStyleId)}</dd>
            </div>
            <div>
              <dt>Build</dt>
              <dd>{optionName(a.bodyPresetId)}</dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="skills-heading">
          <h3 id="skills-heading">Skills</h3>
          {(['batting', 'bowling', 'physical'] as const).map((group) => (
            <details
              key={group}
              className="skill-group"
              open={group === 'batting'}
            >
              <summary>
                {group.charAt(0).toUpperCase() + group.slice(1)}
              </summary>
              {player.skills
                .filter((k) => k.group === group)
                .map((k) => {
                  const text = k.maxed
                    ? 'MAX'
                    : `${k.xp} / ${k.xpToNext ?? 0} XP`;
                  return (
                    <div key={k.statKey} className="skill-row">
                      <div className="skill-top">
                        <span>{k.label}</span>
                        <strong className="skill-value">{k.value}</strong>
                      </div>
                      <ProgressBar
                        label={`${k.label} progress to next point`}
                        current={k.maxed ? 1 : k.xp}
                        target={k.maxed ? 1 : (k.xpToNext ?? 1)}
                        valueText={text}
                      />
                      <span className="hint">{text}</span>
                    </div>
                  );
                })}
            </details>
          ))}
          <Link href="/training">Train your skills</Link>
        </section>
        <section aria-labelledby="kit-heading">
          <h3 id="kit-heading">Equipped kit</h3>
          <ul className="equipped-list">
            {data.equipment.map((e) => {
              const def = itemDefinition(e.itemId);
              const mods = Object.entries(modifiersOf(e.itemId));
              const icon = itemIcon(e.itemId);
              return (
                <li key={e.slot}>
                  {icon ? (
                    <img src={icon} alt="" width={36} height={36} />
                  ) : null}
                  <span>
                    <strong>{SLOT_LABEL[e.slot] ?? e.slot}:</strong>{' '}
                    {def?.name ?? 'Unknown item'}
                    {def ? (
                      <span className="hint">
                        {' '}
                        · {RARITY_LABEL[def.rarity]}
                      </span>
                    ) : null}
                    {mods.length ? (
                      <span className="hint">
                        {' '}
                        ·{' '}
                        {mods
                          .map(([k, v]) => `${statLabel(k)} ${formatBonus(v)}`)
                          .join(', ')}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <div className="actions">
          <Link className="button button-primary" href="/dressing-room">
            Open dressing room
          </Link>
          <Link className="button" href="/career">
            Back to career
          </Link>
        </div>
      </div>
    </div>
  );
}
