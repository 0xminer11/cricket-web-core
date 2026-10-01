# Asset pipeline

```text
source art (Blender) ──export──> optimized GLB ──> apps/web/public/game-assets/…
                                         │
                       manifest entry (id, path, version, size, SHA-256, compression)
                                         │
             pnpm assets:validate  ──> contract + budgets + coverage ──> CI
```

## Ids, files, versions

- Logical id: `asset.<kind>.<name>` (for example `asset.model.bat.pro_willow_01`, `asset.character.hair.short_01`, `asset.icon.bat.pro_willow_01`).
- File: `<name>_v<version>.glb`. **A new version is a new file name**, so immutable caching can never serve stale bytes.
- The manifest entry (`AssetManifestEntry`, Module 0) holds `path`, `version`, `sizeBytes`, `checksumSha256`, `compression`, `platforms`, `dependencies`. Placeholder entries are produced by `pnpm assets:generate`; final entries are written by hand or by your own export script with the same shape.
- Folders: `characters/` (base, hair, beards), `kits/` (clothing, helmet, gloves, pads, shoes), `bats/`, `ui/icons/`.

## Current placeholder set (42 assets, 490.5 KB)

26 GLB + 16 SVG icons. Base character 100.6 KB / 2,504 triangles; starter outfit (base + 7 items) 245.1 KB / 6,076 triangles. Full per-asset report: `pnpm assets:validate`.

## What `assets:validate` enforces (errors fail the command)

- Every manifest file exists; size and SHA-256 match.
- Every GLB follows the [character skeleton contract](character-skeleton.md): all 23 canonical bones, no duplicate bone names, identical joint order on skinned clothing, skins present, ≤ 4 influences per vertex, scale/ground alignment (height 1.6 to 2.1 m, feet at y = 0).
- Base GLB has the required body-part meshes (`Body_Torso`, `Body_Legs`, `Body_Feet`, `Body_Hands`, `Body_Arms`, `Body_Head`), declares the five morph targets, and contains every clip in `ANIMATION_CLIP_MAP` (including mirrored left-hand clips).
- Skinned meshes declare morph targets in the shared order; bats expose a `Bat_Grip` material (recolourable).
- Coverage: every equipment visual, hair/beard option and item icon resolves to a manifest entry.

**Budget checks only warn** (see [performance.md](performance.md)): triangles per asset, file size, material count, texture size, total dressed triangles. The current set produces 0 warnings.

## Generating placeholders

`infrastructure/scripts/generate-character-assets.mjs` builds geometry (lathe/ellipsoid helpers), skeleton + skin + inverse bind matrices, morph targets, animation clips and icons with `@gltf-transform`, compresses with meshopt, and writes the manifest. Output is deterministic: the same script produces the same bytes. `assets:generate` also formats the generated TypeScript so `pnpm format:check` stays green.

## Replacing a placeholder with final art

Follow [owner-asset-guide.md](owner-asset-guide.md). In short: export to the contract, drop the file in with a bumped version, update the manifest entry, run `pnpm assets:validate`, check it in the dev-only bone debugger and attachment tuner ([equipment-attachments.md](equipment-attachments.md)).
