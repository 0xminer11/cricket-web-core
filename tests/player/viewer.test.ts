import { describe, expect, it, vi } from 'vitest';
import {
  ASSET_MANIFEST,
  BASE_CHARACTER_ASSETS,
  BASE_MORPH_TARGETS,
  EQUIPMENT_VISUALS,
  FALLBACK_SLOT_ITEMS,
  HAIR_VISUALS,
  QUALITY_PROFILES,
  BEARD_VISUALS,
  validateAppearanceChoice,
} from '../../packages/game-core/src/index';
import { AssetRegistry } from '../../apps/web/src/features/player-3d/assets/asset-registry';
import { AssetCache } from '../../apps/web/src/features/player-3d/character/asset-cache';
import {
  diffParts,
  planCharacter,
  resolveAttachment,
} from '../../apps/web/src/features/player-3d/character/plan';
import type { CharacterLoadout } from '../../apps/web/src/features/player-3d/types';

const registry = new AssetRegistry(ASSET_MANIFEST, '');

const loadout = (over: Partial<CharacterLoadout> = {}): CharacterLoadout => ({
  appearance: {
    bodyPresetId: 'appearance.body.athletic_01',
    facePresetId: 'appearance.face.preset_01',
    skinToneId: 'appearance.skin.tone_04',
    hairStyleId: 'appearance.hair.short_01',
    hairColorId: 'appearance.haircolor.black',
    beardStyleId: 'appearance.beard.none',
    heightScale: 1,
  },
  equipment: {
    bat: 'item.bat.street_willow_01',
    helmet: 'item.helmet.core_guard_01',
    gloves: 'item.gloves.starter_01',
    pads: 'item.pads.starter_01',
    shoes: 'item.shoes.starter_01',
    jersey: 'item.jersey.starter_01',
    pants: 'item.pants.starter_01',
  },
  battingHand: 'right',
  jerseyNumber: 18,
  ...over,
});

describe('asset registry', () => {
  it('resolves a known asset with a versioned, cache-keyed URL', () => {
    const r = registry.resolve(BASE_CHARACTER_ASSETS.viewer, ['character']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.asset.url).toMatch(/^\/game-assets\/.+_v\d+\.glb$/);
      expect(r.asset.cacheKey).toBe(`${r.asset.assetId}@${r.asset.version}`);
    }
  });
  it('degrades gracefully for an unknown id and for the wrong kind', () => {
    expect(registry.resolve('asset.nope')).toEqual({
      ok: false,
      reason: 'unknown_asset',
    });
    const icon = ASSET_MANIFEST.find((a) => a.category === 'ui');
    expect(icon).toBeDefined();
    expect(registry.resolve(icon!.assetId, ['character', 'kit'])).toEqual({
      ok: false,
      reason: 'wrong_type',
    });
  });
  it('prefixes a CDN base URL but only from trusted configuration', () => {
    const cdn = new AssetRegistry(ASSET_MANIFEST, 'https://cdn.example.test');
    const r = cdn.resolve(BASE_CHARACTER_ASSETS.viewer);
    expect(r.ok && r.asset.url.startsWith('https://cdn.example.test/')).toBe(
      true,
    );
    // An id that looks like a URL is simply unknown: arbitrary URLs cannot be loaded.
    expect(cdn.resolve('https://evil.example/x.glb').ok).toBe(false);
  });
  it('falls back to the generic slot model when an item model is retired', () => {
    const retired = new AssetRegistry(
      ASSET_MANIFEST.filter(
        (a) => a.assetId !== 'asset.model.bat.pro_willow_01',
      ),
      '',
    );
    const pro = EQUIPMENT_VISUALS.find(
      (v) => v.itemId === 'item.bat.pro_willow_01',
    );
    expect(pro).toBeDefined();
    const found = retired.visualForItem('item.bat.pro_willow_01', 'bat');
    expect(found?.fellBack).toBe(true);
    expect(found?.visual.itemId).toBe(FALLBACK_SLOT_ITEMS.bat);
  });
  it('refuses a visual used in the wrong slot', () => {
    const found = registry.visualForItem('item.bat.street_willow_01', 'helmet');
    expect(found?.fellBack).toBe(true);
    expect(found?.visual.slot).toBe('helmet');
  });
  it('every manifest entry the visuals reference exists', () => {
    for (const v of EQUIPMENT_VISUALS)
      expect(registry.has(v.assetId)).toBe(true);
    for (const h of HAIR_VISUALS)
      if (h.assetId) expect(registry.has(h.assetId)).toBe(true);
    for (const b of BEARD_VISUALS)
      if (b.assetId) expect(registry.has(b.assetId)).toBe(true);
  });
});

describe('character assembly plan', () => {
  it('plans all seven slots plus hair for the starter outfit', () => {
    const plan = planCharacter(loadout(), registry);
    expect(plan.warnings).toEqual([]);
    expect(plan.parts.filter((p) => p.role === 'equipment')).toHaveLength(7);
    expect(plan.parts.some((p) => p.key === 'hair')).toBe(true);
    expect(plan.animation).toBe('idle_bat');
    expect(plan.baseAssetId).toBe(BASE_CHARACTER_ASSETS.viewer);
    for (const t of BASE_MORPH_TARGETS)
      expect(plan.morphWeights[t]).toBeGreaterThanOrEqual(0);
  });
  it('hides hair that is incompatible with a helmet but keeps compatible hair', () => {
    const long = planCharacter(
      loadout({
        appearance: {
          ...loadout().appearance,
          hairStyleId: 'appearance.hair.long_01',
        },
      }),
      registry,
    );
    expect(long.parts.some((p) => p.key === 'hair')).toBe(false);
    const noHelmet = planCharacter(
      loadout({
        equipment: { ...loadout().equipment, helmet: undefined as never },
        appearance: {
          ...loadout().appearance,
          hairStyleId: 'appearance.hair.long_01',
        },
      }),
      registry,
    );
    expect(noHelmet.parts.some((p) => p.key === 'hair')).toBe(true);
  });
  it('hides the body parts a garment replaces', () => {
    const plan = planCharacter(loadout(), registry);
    expect(plan.hiddenBodyParts).toEqual(
      expect.arrayContaining(['hands', 'feet', 'torso', 'legs']),
    );
  });
  it('uses the dominant hand for the bat and mirrors the offset for left-handers', () => {
    const right = planCharacter(loadout(), registry).parts.find(
      (p) => p.slot === 'bat',
    );
    const left = planCharacter(
      loadout({ battingHand: 'left' }),
      registry,
    ).parts.find((p) => p.slot === 'bat');
    expect(right?.attachment?.bone).toBe('rightHand');
    expect(left?.attachment?.bone).toBe('leftHand');
    expect(left?.attachment?.rotation[1]).toBeCloseTo(
      -(right?.attachment?.rotation[1] ?? 0),
    );
    expect(left?.attachment?.position[0]).toBeCloseTo(
      -(right?.attachment?.position[0] ?? 0),
    );
  });
  it('resolveAttachment leaves explicit bones and non-mirrored offsets alone', () => {
    const def = {
      bone: 'head' as const,
      position: [0.1, 0.2, 0.3] as const,
      rotation: [0, 0.5, 0] as const,
      scale: 1,
    };
    expect(resolveAttachment(def, 'left')).toEqual({
      bone: 'head',
      position: [0.1, 0.2, 0.3],
      rotation: [0, 0.5, 0],
      scale: 1,
    });
  });
  it('warns, never throws, for unknown item and cosmetic ids', () => {
    const plan = planCharacter(
      loadout({
        equipment: { bat: 'item.bat.does_not_exist' },
        appearance: {
          ...loadout().appearance,
          hairStyleId: 'appearance.hair.zzz',
          bodyPresetId: 'appearance.body.zzz',
        },
      }),
      registry,
    );
    expect(plan.warnings.length).toBeGreaterThanOrEqual(2);
    // The unknown bat degrades to the generic bat rather than leaving the hands empty.
    expect(plan.parts.find((p) => p.slot === 'bat')).toBeDefined();
  });
  it('plans a naked base character when nothing is equipped', () => {
    const plan = planCharacter(loadout({ equipment: {} }), registry);
    expect(plan.parts.filter((p) => p.role === 'equipment')).toHaveLength(0);
    expect(plan.animation).toBe('idle');
    expect(plan.hiddenBodyParts).toEqual([]);
  });
  it('carries kit colours and the jersey number but never stat modifiers', () => {
    const plan = planCharacter(loadout(), registry);
    const jersey = plan.parts.find((p) => p.slot === 'jersey');
    expect(jersey?.kit?.primary).toMatch(/^#/);
    expect(plan.jerseyNumber).toBe(18);
    expect(JSON.stringify(plan)).not.toMatch(/modifier|attribute/i);
  });
  it('diffParts swaps only what changed', () => {
    const a = planCharacter(loadout(), registry);
    const b = planCharacter(
      loadout({
        equipment: { ...loadout().equipment, bat: 'item.bat.pro_willow_01' },
      }),
      registry,
    );
    const d = diffParts(a.parts, b.parts);
    expect(d.add.map((p) => p.key)).toEqual(['equipment:bat']);
    expect(d.remove.map((p) => p.key)).toEqual(['equipment:bat']);
    expect(d.keep.length).toBe(a.parts.length - 1);
    expect(diffParts(a.parts, a.parts).add).toEqual([]);
  });
  it('is deterministic', () => {
    expect(planCharacter(loadout(), registry)).toEqual(
      planCharacter(loadout(), registry),
    );
  });
});

describe('appearance validation shared by creation and the editor', () => {
  const ok = loadout().appearance;
  it('accepts a starter combination', () => {
    expect(validateAppearanceChoice(ok)).toBeNull();
  });
  it('rejects unknown ids, wrong categories and off-grid or out-of-range heights', () => {
    expect(
      validateAppearanceChoice({ ...ok, hairStyleId: 'appearance.hair.nope' }),
    ).not.toBeNull();
    expect(
      validateAppearanceChoice({ ...ok, hairStyleId: ok.skinToneId }),
    ).not.toBeNull();
    expect(validateAppearanceChoice({ ...ok, heightScale: 3 })).not.toBeNull();
    expect(
      validateAppearanceChoice({ ...ok, heightScale: Number.NaN }),
    ).not.toBeNull();
    expect(
      validateAppearanceChoice({ ...ok, heightScale: 1.013 }),
    ).not.toBeNull();
  });
});

describe('asset cache', () => {
  const make = (maxEntries = 2, maxBytes = 1000) => {
    const disposed: string[] = [];
    const cache = new AssetCache<string>({
      maxEntries,
      maxBytes,
      dispose: (v) => disposed.push(v),
    });
    const loader = (name: string, bytes = 10) =>
      vi.fn(async () => ({ value: name, bytes }));
    return { cache, disposed, loader };
  };
  it('shares one in-flight load between concurrent requests', async () => {
    const { cache, loader } = make();
    const load = loader('a');
    const [x, y] = await Promise.all([
      cache.acquire('a', load),
      cache.acquire('a', load),
    ]);
    expect([x, y]).toEqual(['a', 'a']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.stats().inUse).toBe(1);
  });
  it('serves cache hits without reloading', async () => {
    const { cache, loader } = make();
    const load = loader('a');
    await cache.acquire('a', load);
    cache.release('a');
    await cache.acquire('a', load);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('evicts the least recently used unreferenced entry and disposes it', async () => {
    const { cache, disposed, loader } = make(2);
    for (const k of ['a', 'b']) {
      await cache.acquire(k, loader(k));
      cache.release(k);
    }
    await cache.acquire('c', loader('c'));
    expect(disposed).toEqual(['a']);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
  });
  it('never evicts an asset that is still in use', async () => {
    const { cache, disposed, loader } = make(1);
    await cache.acquire('a', loader('a'));
    await cache.acquire('b', loader('b'));
    expect(disposed).toEqual([]);
    expect(cache.stats().entries).toBe(2);
    cache.release('a');
    expect(disposed).toEqual(['a']);
  });
  it('enforces the byte budget', async () => {
    const { cache, disposed, loader } = make(10, 25);
    await cache.acquire('a', loader('a', 20));
    cache.release('a');
    await cache.acquire('b', loader('b', 20));
    expect(disposed).toEqual(['a']);
  });
  it('does not cache a failed load and allows a retry', async () => {
    const { cache } = make();
    const bad = vi.fn(async () => {
      throw new Error('network');
    });
    await expect(cache.acquire('a', bad)).rejects.toThrow('network');
    expect(cache.stats().loading).toBe(0);
    await expect(
      cache.acquire('a', async () => ({ value: 'a', bytes: 1 })),
    ).resolves.toBe('a');
  });
  it('trim disposes everything not referenced', async () => {
    const { cache, disposed, loader } = make(5);
    await cache.acquire('a', loader('a'));
    await cache.acquire('b', loader('b'));
    cache.release('b');
    cache.trim();
    expect(disposed).toEqual(['b']);
    expect(cache.has('a')).toBe(true);
  });
});

describe('quality profiles', () => {
  it('get cheaper from high to low', () => {
    const { low, medium, high } = QUALITY_PROFILES;
    expect(low.maxPixelRatio).toBeLessThanOrEqual(medium.maxPixelRatio);
    expect(medium.maxPixelRatio).toBeLessThanOrEqual(high.maxPixelRatio);
    expect(low.maxTextureSize).toBeLessThanOrEqual(high.maxTextureSize);
  });
});
