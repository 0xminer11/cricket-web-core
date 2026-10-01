import type {
  AssetId,
  CurrencyCode,
  IsoDateTime,
  ItemId,
  Rarity,
} from './common.types';

export type EquipmentSlot =
  | 'bat'
  | 'helmet'
  | 'gloves'
  | 'pads'
  | 'shoes'
  | 'jersey'
  | 'pants'
  | 'wristband'
  | 'arm_guard'
  | 'glasses'
  | 'chain'
  | 'bat_grip'
  | 'bat_sticker';

export type ItemCategory = 'equipment' | 'cosmetic' | 'consumable';
export type EquipmentModifierKey =
  | 'batting.power'
  | 'batting.timing'
  | 'batting.placement'
  | 'batting.defence'
  | 'physical.reflex'
  | 'physical.agility'
  | 'physical.recovery';

export interface ItemModifier {
  readonly stat: EquipmentModifierKey;
  readonly flatBonus: number;
}

export interface EquipmentItem {
  readonly id: ItemId;
  readonly category: ItemCategory;
  readonly slot: EquipmentSlot;
  readonly name: string;
  readonly description: string;
  readonly rarity: Rarity;
  readonly levelRequirement: number;
  readonly purchasePrice?: {
    readonly currency: CurrencyCode;
    readonly amount: number;
  };
  readonly sellable: boolean;
  readonly cosmeticOnly: boolean;
  readonly maxUpgradeLevel: number;
  readonly baseModifiers: readonly ItemModifier[];
  readonly upgradeModifierPerLevel: readonly ItemModifier[];
  readonly iconAssetId: AssetId;
  readonly modelAssetId?: AssetId;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface InventoryItem {
  readonly instanceId: string;
  readonly itemId: ItemId;
  readonly quantity: number;
  readonly upgradeLevel: number;
  readonly acquiredAt: IsoDateTime;
  readonly acquisitionSource:
    'starter' | 'shop' | 'reward' | 'achievement' | 'contract' | 'sponsor';
}

export interface EquippedItems {
  readonly [slot: string]: string | undefined; // slot -> inventory instanceId, validated against EquipmentSlot
}
