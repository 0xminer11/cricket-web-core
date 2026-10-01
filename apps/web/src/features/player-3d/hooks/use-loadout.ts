'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  EquipmentEntry,
  InventoryItemDto,
  PlayerProfileDto,
} from '@the-cricketer/shared-types';
import { playerClient } from '../../player-creation/api/player-client';
import { loadoutApi } from '../api/loadout-api';
import type { LoadoutApi } from '../api/loadout-api';
import type { CharacterLoadout } from '../types';

export interface LoadoutData {
  readonly player: PlayerProfileDto;
  readonly equipment: EquipmentEntry[];
  readonly inventory: InventoryItemDto[];
}

/**
 * The server-authoritative data both pages render from: profile, equipment, inventory. `refresh`
 * re-reads it (also when the tab regains focus, so changes made elsewhere show up).
 */
export function useLoadoutData(
  options: { inventory?: boolean; api?: LoadoutApi } = {},
) {
  const api = options.api ?? loadoutApi;
  const wantInventory = options.inventory ?? false;
  const [data, setData] = useState<LoadoutData | null>(null);
  const [error, setError] = useState<'missing' | 'failed' | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++generation.current;
    try {
      const [player, equipment, inventory] = await Promise.all([
        playerClient.getPlayer(),
        api.getEquipment().catch(() => null),
        wantInventory
          ? api.getInventory()
          : Promise.resolve<InventoryItemDto[]>([]),
      ]);
      if (mine !== generation.current) return; // a newer refresh is in flight
      if (!player || !equipment) {
        setError(player ? 'failed' : 'missing');
        setLoading(false);
        return;
      }
      setData({ player, equipment, inventory });
      setError(null);
    } catch {
      if (mine === generation.current) setError('failed');
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }, [api, wantInventory]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      generation.current += 1;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { data, error, loading, refresh, setData };
}

export function toLoadout(
  player: PlayerProfileDto,
  equipment: readonly { slot: string; itemId: string }[],
  overlay: Partial<Record<string, string>> = {},
  appearance = player.appearance,
): CharacterLoadout {
  const equipped: Record<string, string> = {};
  for (const e of equipment) equipped[e.slot] = e.itemId;
  return {
    appearance,
    equipment: { ...equipped, ...overlay },
    battingHand: player.summary.battingHand === 'left' ? 'left' : 'right',
    jerseyNumber: player.summary.jerseyNumber,
  };
}
