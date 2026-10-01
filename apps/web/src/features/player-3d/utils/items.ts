import { ITEMS } from '@the-cricketer/game-core';
import type { EquipmentItem } from '@the-cricketer/game-core';
import { assetRegistry } from '../assets/asset-registry';

const BY_ID = new Map<string, EquipmentItem>(ITEMS.map((i) => [i.id, i]));
export const itemDefinition = (itemId: string): EquipmentItem | undefined =>
  BY_ID.get(itemId);
export const itemName = (itemId: string): string =>
  BY_ID.get(itemId)?.name ?? 'Unknown item';
export const itemIcon = (itemId: string): string | undefined =>
  assetRegistry.iconUrl(BY_ID.get(itemId)?.iconAssetId);

const STAT_LABEL: Record<string, string> = {
  'batting.power': 'Power',
  'batting.timing': 'Timing',
  'batting.placement': 'Placement',
  'batting.defence': 'Defence',
  'physical.reflex': 'Reflexes',
  'physical.agility': 'Agility',
  'physical.recovery': 'Recovery',
};
export const statLabel = (stat: string): string => STAT_LABEL[stat] ?? stat;

/** Module 0 modifiers as `{ stat: bonus }` (never recomputed or rebalanced in the client). */
export function modifiersOf(
  itemId: string | undefined,
): Record<string, number> {
  const def = itemId ? BY_ID.get(itemId) : undefined;
  const out: Record<string, number> = {};
  for (const m of def?.baseModifiers ?? [])
    out[m.stat] = (out[m.stat] ?? 0) + m.flatBonus;
  return out;
}

/** Side-by-side rows for the stats either item touches. No "better/worse" verdict is implied. */
export function compareModifiers(
  current: string | undefined,
  preview: string | undefined,
) {
  const a = modifiersOf(current);
  const b = modifiersOf(preview);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].map((stat) => ({
    stat,
    label: statLabel(stat),
    current: a[stat] ?? 0,
    preview: b[stat] ?? 0,
  }));
}

export const formatBonus = (n: number): string => (n > 0 ? `+${n}` : String(n));
export const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};
