'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Spinner } from '@the-cricketer/ui';
import {
  DRESSING_ROOM_SLOTS,
  SLOT_CAMERA_FOCUS,
} from '@the-cricketer/game-core';
import type { CameraPresetId } from '@the-cricketer/game-core';
import type { CreationOptions } from '@the-cricketer/shared-types';
import { useRequireAuth } from '../../auth/hooks/use-auth';
import { ApiClientError } from '../../../services/api';
import { playerClient } from '../../player-creation/api/player-client';
import {
  ChoiceCard,
  ChoiceGroup,
} from '../../player-creation/components/primitives';
import { loadoutApi } from '../api/loadout-api';
import { toLoadout, useLoadoutData } from '../hooks/use-loadout';
import type { ViewerSession } from '../renderer/viewer-session';
import {
  compareModifiers,
  formatBonus,
  itemDefinition,
  itemIcon,
  itemName,
  modifiersOf,
  RARITY_LABEL,
  statLabel,
} from '../utils/items';
import { DevAttachmentTuner } from './dev-attachment-tuner';
import { Player3DViewer } from './player-3d-viewer';
import { SLOT_LABEL } from './player-page';

const IS_DEV = process.env.NODE_ENV !== 'production';
type Tab = (typeof DRESSING_ROOM_SLOTS)[number] | 'look';
const TABS: readonly Tab[] = [...DRESSING_ROOM_SLOTS, 'look'];
const APPEARANCE_GROUPS = [
  { category: 'face', field: 'facePresetId', legend: 'Face' },
  { category: 'skin', field: 'skinToneId', legend: 'Skin tone' },
  { category: 'hairStyle', field: 'hairStyleId', legend: 'Hair style' },
  { category: 'hairColor', field: 'hairColorId', legend: 'Hair colour' },
  { category: 'beard', field: 'beardStyleId', legend: 'Beard' },
  { category: 'body', field: 'bodyPresetId', legend: 'Build' },
] as const;

const apiMessage = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    if (error.code === 'ITEM_NOT_OWNED') return 'You no longer own that item.';
    if (error.code === 'ITEM_REQUIREMENT_NOT_MET')
      return 'Your level is too low for that item.';
    if (
      error.code === 'ITEM_SLOT_MISMATCH' ||
      error.code === 'INVALID_EQUIPMENT_SLOT'
    )
      return 'That item does not fit this slot.';
    if (error.code === 'ITEM_UNAVAILABLE')
      return 'That item cannot be equipped right now.';
    if (error.code === 'INVALID_APPEARANCE_OPTION')
      return 'One of those looks is not available.';
    if (error.code === 'NETWORK_ERROR')
      return 'Could not reach the server. Try again.';
    if (error.code === 'RATE_LIMITED')
      return 'Too many changes. Try again shortly.';
  }
  return 'Something went wrong. Please try again.';
};

/**
 * /dressing-room: preview owned gear on the 3D character, then equip it. Previews change only what
 * is drawn; nothing is saved until EQUIP (which asks the server) or SAVE APPEARANCE. The server's
 * answer is the truth: if it refuses, the preview is dropped and the saved kit returns.
 */
export function DressingRoom() {
  const auth = useRequireAuth('/');
  const router = useRouter();
  const { data, error, loading, refresh, setData } = useLoadoutData({
    inventory: true,
  });
  const [tab, setTab] = useState<Tab>('bat');
  const [preview, setPreview] = useState<{
    slot: string;
    itemId: string;
    inventoryItemId: string;
  } | null>(null);
  const [draftLook, setDraftLook] = useState<Record<
    string,
    string | number
  > | null>(null);
  const [options, setOptions] = useState<CreationOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'error' | 'ok';
    text: string;
  } | null>(null);
  const sessionRef = useRef<ViewerSession | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const needsCreation =
    (auth.user && !auth.user.hasCricketer) || error === 'missing';
  useEffect(() => {
    if (needsCreation) router.replace('/create-player');
  }, [needsCreation, router]);
  useEffect(() => {
    if (tab === 'look' && !options)
      playerClient
        .getCreationOptions()
        .then(setOptions)
        .catch(() =>
          setMessage({
            kind: 'error',
            text: 'Could not load appearance options.',
          }),
        );
  }, [tab, options]);

  const equipped = useMemo(
    () => new Map((data?.equipment ?? []).map((e) => [e.slot, e])),
    [data],
  );

  const loadout = useMemo(() => {
    if (!data) return null;
    const look = draftLook
      ? { ...data.player.appearance, ...draftLook }
      : data.player.appearance;
    return toLoadout(
      data.player,
      data.equipment,
      preview ? { [preview.slot]: preview.itemId } : {},
      look,
    );
  }, [data, preview, draftLook]);

  const focus: CameraPresetId | undefined = useMemo(() => {
    if (tab === 'look') return 'camera.face';
    return SLOT_CAMERA_FOCUS[tab];
  }, [tab]);

  const flash = useCallback(
    (m: { kind: 'error' | 'ok'; text: string } | null) => {
      setMessage(m);
      if (m?.kind === 'error') queueMicrotask(() => alertRef.current?.focus());
    },
    [],
  );

  if (auth.status === 'loading' || (loading && !data) || needsCreation)
    return <Spinner />;
  if (error || !data || !loadout)
    return (
      <div className="stack" role="alert">
        <p className="alert">
          We could not load your dressing room. Please try again.
        </p>
        <button type="button" className="button" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );

  const { player, inventory } = data;
  const level = player.summary.level;
  const slotItems =
    tab === 'look'
      ? []
      : inventory.filter((i) => itemDefinition(i.itemId)?.slot === tab);
  const currentEntry = tab === 'look' ? undefined : equipped.get(tab);
  const isPreviewing =
    preview !== null &&
    preview.slot === tab &&
    preview.inventoryItemId !== currentEntry?.inventoryItemId;
  const previewDef = isPreviewing ? itemDefinition(preview.itemId) : undefined;

  const select = (
    slot: string,
    item: { inventoryItemId: string; itemId: string },
  ) => {
    flash(null);
    if (equipped.get(slot)?.inventoryItemId === item.inventoryItemId)
      return setPreview(null);
    setPreview({
      slot,
      itemId: item.itemId,
      inventoryItemId: item.inventoryItemId,
    });
    loadoutApi.track({ event: 'equipment_previewed', slot });
  };

  const equip = async () => {
    if (!preview || busy) return;
    setBusy(true);
    flash(null);
    try {
      await loadoutApi.equip(preview.slot, preview.inventoryItemId);
      // Re-read the authoritative state; the server's answer decides what is equipped.
      const [equipment, inv] = await Promise.all([
        loadoutApi.getEquipment(),
        loadoutApi.getInventory(),
      ]);
      setData({ ...data, equipment, inventory: inv });
      setPreview(null);
      flash({ kind: 'ok', text: `${itemName(preview.itemId)} equipped.` });
    } catch (e) {
      setPreview(null); // revert the visual preview to the saved kit
      flash({ kind: 'error', text: apiMessage(e) });
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const saveLook = async () => {
    if (!draftLook || busy) return;
    setBusy(true);
    flash(null);
    try {
      const saved = await loadoutApi.updateAppearance(draftLook);
      setData({ ...data, player: { ...player, appearance: saved } });
      setDraftLook(null);
      flash({ kind: 'ok', text: 'Appearance saved.' });
    } catch (e) {
      setDraftLook(null);
      flash({ kind: 'error', text: apiMessage(e) });
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const grantSample = async () => {
    setBusy(true);
    try {
      await loadoutApi.grantSampleGear();
      await refresh();
      flash({ kind: 'ok', text: 'Sample gear granted (development only).' });
    } catch (e) {
      flash({ kind: 'error', text: apiMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dressing-layout">
      <div className="dressing-stage">
        <Player3DViewer
          loadout={loadout}
          playerName={player.summary.displayName}
          description={`Dressing room preview of ${player.summary.displayName}.`}
          {...(focus ? { focus } : {})}
          showAnimationControls={false}
          onEvent={(e) => loadoutApi.track(e)}
          onSession={(s) => {
            sessionRef.current = s;
          }}
        />
        {IS_DEV ? (
          <DevAttachmentTuner getSession={() => sessionRef.current} />
        ) : null}
      </div>

      <div className="stack dressing-panel">
        <div
          role="tablist"
          aria-label="Equipment categories"
          className="slot-tabs"
        >
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls="dressing-panel"
              className={
                tab === t ? 'button slot-tab is-active' : 'button slot-tab'
              }
              onClick={() => {
                setTab(t);
                setPreview(null);
                setDraftLook(null);
                flash(null);
              }}
            >
              {t === 'look' ? 'Look' : (SLOT_LABEL[t] ?? t)}
            </button>
          ))}
        </div>

        <div
          ref={alertRef}
          role={message?.kind === 'error' ? 'alert' : 'status'}
          tabIndex={-1}
          className={
            message
              ? message.kind === 'error'
                ? 'alert'
                : 'notice'
              : undefined
          }
        >
          {message?.text}
        </div>

        <div
          id="dressing-panel"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="stack"
        >
          {tab === 'look' ? (
            options ? (
              <div className="stack">
                {APPEARANCE_GROUPS.map(({ category, field, legend }) => (
                  <ChoiceGroup key={category} legend={legend}>
                    {options.appearance
                      .find((g) => g.category === category)
                      ?.options.map((o) => (
                        <ChoiceCard
                          key={o.id}
                          name={`look-${field}`}
                          value={o.id}
                          checked={
                            ((draftLook?.[field] ??
                              player.appearance[field]) as string) === o.id
                          }
                          title={o.name}
                          swatch={o.swatch}
                          onSelect={(id) =>
                            setDraftLook((d) => ({ ...(d ?? {}), [field]: id }))
                          }
                        />
                      ))}
                  </ChoiceGroup>
                ))}
                <div className="field">
                  <label htmlFor="look-height">
                    Height:{' '}
                    {Math.round(
                      Number(
                        draftLook?.heightScale ?? player.appearance.heightScale,
                      ) * 100,
                    )}
                    % of average
                  </label>
                  <input
                    id="look-height"
                    type="range"
                    min={options.heightRange.min}
                    max={options.heightRange.max}
                    step={options.heightRange.step}
                    value={Number(
                      draftLook?.heightScale ?? player.appearance.heightScale,
                    )}
                    onChange={(e) =>
                      setDraftLook((d) => ({
                        ...(d ?? {}),
                        heightScale: Number(Number(e.target.value).toFixed(2)),
                      }))
                    }
                  />
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={!draftLook || busy}
                    onClick={() => void saveLook()}
                  >
                    SAVE APPEARANCE
                  </button>
                  <button
                    type="button"
                    className="button"
                    disabled={!draftLook || busy}
                    onClick={() => setDraftLook(null)}
                  >
                    CANCEL
                  </button>
                </div>
                <p className="hint">
                  Changes are previewed on your cricketer and saved only when
                  you press Save.
                </p>
              </div>
            ) : (
              <Spinner />
            )
          ) : (
            <>
              <fieldset className="choice-group">
                <legend>{SLOT_LABEL[tab]} you own</legend>
                <div className="item-grid">
                  {slotItems.map((item) => {
                    const def = itemDefinition(item.itemId);
                    if (!def) return null;
                    const isEquipped =
                      currentEntry?.inventoryItemId === item.inventoryItemId;
                    const selected = isPreviewing
                      ? preview?.inventoryItemId === item.inventoryItemId
                      : isEquipped;
                    const locked = def.levelRequirement > level;
                    const mods = Object.entries(modifiersOf(item.itemId));
                    const icon = itemIcon(item.itemId);
                    return (
                      <button
                        key={item.inventoryItemId}
                        type="button"
                        className={
                          selected ? 'item-card is-selected' : 'item-card'
                        }
                        aria-pressed={selected}
                        onClick={() => select(tab, item)}
                      >
                        {icon ? (
                          <img src={icon} alt="" width={48} height={48} />
                        ) : null}
                        <span className="item-body">
                          <span className="choice-title">{def.name}</span>
                          <span className="hint">
                            {RARITY_LABEL[def.rarity]}
                            {isEquipped ? ' · Equipped' : ''}
                          </span>
                          <span className="hint">
                            {mods.length
                              ? mods
                                  .map(
                                    ([k, v]) =>
                                      `${statLabel(k)} ${formatBonus(v)}`,
                                  )
                                  .join(', ')
                              : 'Cosmetic or no stat change'}
                          </span>
                          {locked ? (
                            <span className="field-error">
                              Requires level {def.levelRequirement}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {slotItems.length <= 1 ? (
                  <p className="hint">
                    More equipment can be unlocked through your career.
                  </p>
                ) : null}
              </fieldset>

              {isPreviewing && previewDef ? (
                <section
                  aria-labelledby="compare-heading"
                  className="preview-panel"
                >
                  <h3 id="compare-heading">Previewing {previewDef.name}</h3>
                  <p className="hint">
                    Preview only. Nothing is saved until you press Equip. Item
                    modifiers apply in matches on top of your skills; your base
                    attributes never change.
                  </p>
                  <table className="compare-table">
                    <caption className="sr-only">Modifier comparison</caption>
                    <thead>
                      <tr>
                        <th scope="col">Stat</th>
                        <th scope="col">
                          {currentEntry
                            ? itemName(currentEntry.itemId)
                            : 'Current'}
                        </th>
                        <th scope="col">{previewDef.name}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareModifiers(
                        currentEntry?.itemId,
                        preview?.itemId,
                      ).map((r) => (
                        <tr key={r.stat}>
                          <th scope="row">{r.label}</th>
                          <td>{formatBonus(r.current)}</td>
                          <td>{formatBonus(r.preview)}</td>
                        </tr>
                      ))}
                      {compareModifiers(currentEntry?.itemId, preview?.itemId)
                        .length === 0 ? (
                        <tr>
                          <td colSpan={3}>No stat difference</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                  {previewDef.levelRequirement > level ? (
                    <p className="field-error" role="alert">
                      Requires level {previewDef.levelRequirement}. You can
                      preview it but not equip it yet.
                    </p>
                  ) : null}
                  <div className="actions">
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy || previewDef.levelRequirement > level}
                      onClick={() => void equip()}
                    >
                      {busy ? 'Equipping…' : 'EQUIP'}
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => setPreview(null)}
                    >
                      CANCEL
                    </button>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>

        <div className="actions">
          <Link className="button" href="/player">
            Back to my cricketer
          </Link>
          {IS_DEV ? (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void grantSample()}
            >
              Dev: grant sample gear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
