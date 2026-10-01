import {
  ASSET_MANIFEST,
  EQUIPMENT_VISUAL_BY_ITEM,
  FALLBACK_SLOT_ITEMS,
} from '@the-cricketer/game-core';
import type {
  AssetManifestEntry,
  EquipmentSlot,
  EquipmentVisualDefinition,
} from '@the-cricketer/game-core';

export type ResolveFailure = 'unknown_asset' | 'wrong_type';
export type ResolveResult =
  | { readonly ok: true; readonly asset: ResolvedAsset }
  | { readonly ok: false; readonly reason: ResolveFailure };

export interface ResolvedAsset {
  readonly assetId: string;
  readonly category: AssetManifestEntry['category'];
  readonly url: string;
  readonly version: string;
  readonly sizeBytes: number;
  readonly compression: AssetManifestEntry['compression'];
  /** Cache identity: a new version is a new key, so stale files can never be reused. */
  readonly cacheKey: string;
}

/**
 * Resolves logical asset ids to URLs. Saves and definitions only ever hold ids; the manifest says
 * where the bytes live and at which version. URLs come from this trusted manifest, never from user
 * input, and `baseUrl` is where a CDN prefix is configured (NEXT_PUBLIC_ASSET_BASE_URL).
 */
export class AssetRegistry {
  private readonly byId: ReadonlyMap<string, AssetManifestEntry>;

  constructor(
    manifest: readonly AssetManifestEntry[] = ASSET_MANIFEST,
    private readonly baseUrl = '',
  ) {
    this.byId = new Map(manifest.map((entry) => [entry.assetId, entry]));
  }

  has(assetId: string): boolean {
    return this.byId.has(assetId);
  }

  /** `expected` rejects an id of the wrong kind (e.g. an icon requested as a model). */
  resolve(
    assetId: string,
    expected?: readonly AssetManifestEntry['category'][],
  ): ResolveResult {
    const entry = this.byId.get(assetId);
    if (!entry) return { ok: false, reason: 'unknown_asset' };
    if (expected && !expected.includes(entry.category))
      return { ok: false, reason: 'wrong_type' };
    return {
      ok: true,
      asset: {
        assetId,
        category: entry.category,
        url: `${this.baseUrl}${entry.path}`,
        version: entry.version,
        sizeBytes: entry.sizeBytes,
        compression: entry.compression,
        cacheKey: `${assetId}@${entry.version}`,
      },
    };
  }

  /** Icon URL for 2D item cards (separate from the 3D model). Undefined if unknown. */
  iconUrl(iconAssetId: string | undefined): string | undefined {
    if (!iconAssetId) return undefined;
    const r = this.resolve(iconAssetId, ['ui']);
    return r.ok ? r.asset.url : undefined;
  }

  /**
   * The visual for an item, or the slot's generic starter visual when the item has none or its
   * model has been retired, so an old career always loads.
   */
  visualForItem(
    itemId: string,
    slot: EquipmentSlot,
  ): { visual: EquipmentVisualDefinition; fellBack: boolean } | null {
    const own = EQUIPMENT_VISUAL_BY_ITEM.get(itemId);
    if (own && own.slot === slot && this.has(own.assetId))
      return { visual: own, fellBack: false };
    const fallbackId = FALLBACK_SLOT_ITEMS[slot];
    const fallback = fallbackId
      ? EQUIPMENT_VISUAL_BY_ITEM.get(fallbackId)
      : undefined;
    if (fallback && this.has(fallback.assetId))
      return { visual: fallback, fellBack: true };
    return null;
  }
}

export const assetRegistry = new AssetRegistry(
  ASSET_MANIFEST,
  process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? '',
);
