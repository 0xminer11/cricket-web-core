# Asset optimization

Order of work when an asset is too heavy: **geometry, then textures, then compression, then loading strategy.** Measure with `pnpm assets:validate` (per-asset size, triangles, materials, textures) before and after.

## Geometry

- Budgets: see [performance.md](performance.md). Spend triangles where the silhouette needs them (head, hands, bat edge); keep torsos, thighs and pads low.
- Merge meshes that share a material; fewer draw calls beat fewer triangles on phones.
- Remove hidden geometry: the base body parts that clothing covers are hidden at runtime, but do not model interiors of closed garments.
- Weld vertices, remove unused vertices and nodes, limit skin influences to 4 per vertex.

## Materials and textures

- ≤ 4 materials per asset; prefer factor colours (the placeholders use none). Recolourable items must expose the named materials in [materials.md](materials.md).
- Textures ≤ 2048 px (validator warns), power-of-two when possible, KTX2/Basis for GPU-compressed delivery (`compression: 'ktx2'` in the manifest; the loader fetches the transcoder from `/basis/` only when an asset needs it).

## Compression

| Technique | Use                                 | Loader behaviour                                        |
| --------- | ----------------------------------- | ------------------------------------------------------- |
| Meshopt   | **default for placeholders**        | decoder imported lazily only if an asset says `meshopt` |
| Draco     | alternative for large static meshes | decoder path `/draco/` (ship the files if used)         |
| KTX2      | textures                            | transcoder path `/basis/`, needs the renderer           |

Meshopt keeps skinned and morphed meshes decoding fast on the main thread, which is why it is the default. Declare the technique in the manifest; the loader never guesses.

## Current results (placeholders)

| Group                 | Files | Raw GLB size                 | Notes                                               |
| --------------------- | ----- | ---------------------------- | --------------------------------------------------- |
| Base character        | 1     | 100.6 KB                     | 2,504 triangles, 23 bones, 5 morph targets, 5 clips |
| Starter clothing/gear | 7     | 144.6 KB (incl. bat, helmet) | 6,076 triangles dressed in total                    |
| Hair (6 with mesh)    | 6     | 88.9 KB (all styles)         | 648 to 1,608 triangles                              |
| Beards                | 5     | 26.5 KB                      | 160 to 224 triangles                                |
| Icons (SVG)           | 16    | ≈ 5 KB                       | separate from 3D, used by item cards                |

Total manifest: **490.5 KB** in 42 assets. A cold `/player` transfers about 80 KB of GLB (gzip/brotli on the wire; 9 files) because only the base, seven starter items and the chosen hair load.

## Loading strategy

- Only what the plan needs is fetched. Alternates in the dressing room load on first preview and are cached (64 entries / 32 MB LRU).
- One in-flight download per file, shared by all requests.
- Versioned file names + `immutable` caching in production; a CDN prefix is `NEXT_PUBLIC_ASSET_BASE_URL`.
- Preload hooks exist (`CharacterAssetLoader.preload`) but are not used aggressively: bandwidth matters more than a faster second preview for placeholder-size assets.

## Pre-merge checklist for new art

- [ ] `pnpm assets:validate` has 0 errors and no new warnings.
- [ ] Triangle/size/material numbers recorded in the PR.
- [ ] Looks correct at the `low` quality profile (`?quality=low` in dev).
- [ ] Cold-load transfer for the starter outfit still reasonable on a throttled connection.
