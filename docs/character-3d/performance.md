# Performance

All numbers below were **measured** on the placeholder assets (production build, headless Chromium with SwiftShader software WebGL on a developer laptop, 2026-10-01). Headless software rendering is far slower than a phone GPU, so frame rate is a lower bound, not a device claim. Re-measure on real devices before shipping final art.

## INITIAL PERFORMANCE BUDGET (warnings from `pnpm assets:validate`)

| Budget                            | Value     | Current (placeholders)  |
| --------------------------------- | --------- | ----------------------- |
| Base character triangles          | ≤ 60,000  | 2,504                   |
| Hair triangles                    | ≤ 10,000  | 648 to 1,608            |
| Other item triangles              | ≤ 6,000   | 160 to 784              |
| Fully dressed character triangles | ≤ 100,000 | 6,076 (starter outfit)  |
| File size per GLB                 | ≤ 1.5 MB  | largest 100.6 KB (base) |
| Materials per asset               | ≤ 4       | 1 to 3                  |
| Texture size                      | ≤ 2048 px | none (factor colours)   |

These are deliberately generous initial numbers for final art; tighten them after profiling real assets on target phones.

## Quality profiles (`QUALITY_PROFILES`)

| Profile | Pixel ratio cap | Antialias | Shadows (map) | FPS cap | Texture cap |
| ------- | --------------- | --------- | ------------- | ------- | ----------- |
| low     | 1               | off       | off           | 30      | 512         |
| medium  | 1.5             | on        | on (1024)     | 60      | 1024        |
| high    | 2               | on        | on (2048)     | 60      | 2048        |

Chosen from coarse hints only (CPU threads, device memory, coarse pointer, data-saver); no fingerprinting. `?quality=low|medium|high` overrides in development builds only (production ignores it, so the three production samples below are repeat measurements of the same profile).

## Bundle (production build, gzip)

| Route                     | Initial JS (9 scripts) | Includes three.js? |
| ------------------------- | ---------------------- | ------------------ |
| `/play` (no 3D, baseline) | 264.0 KB               | no                 |
| `/career`                 | 267.4 KB               | no                 |
| `/player`                 | 265.8 KB               | **no**             |
| `/dressing-room`          | 265.8 KB               | **no**             |

Three.js and the GLTF loader live in three separate lazy chunks (381.4 KB, 237.3 KB and 44.9 KB raw; 91.6 + 62.5 + 13.0 = **167.1 KB gzip**), fetched only when a viewer mounts. Before Module 5 these routes were shell pages; they now cost about +2 KB gzip of initial JS, and the 3D code is paid for only by players who open the viewer.

## Runtime (starter outfit, `/player`, production build)

| Metric                                      | Cold cache      | Warm cache       |
| ------------------------------------------- | --------------- | ---------------- |
| Navigation to viewer `ready`                | 2.5 to 2.8 s    | 2.4 s            |
| Viewer self-reported load (`viewer_loaded`) | 1.5 to 1.7 s    | n/a              |
| GLB requests / transferred                  | 9 / 80 KB       | 9 / 0 KB (cache) |
| Parsed model bytes in the cache             | 262 KB          | same             |
| Initial JS transferred                      | 432 KB          | 0 KB             |
| Draw calls per frame                        | ≈ 39            | ≈ 39             |
| Triangles (starter outfit)                  | 6,076           | 6,076            |
| Frame rate (software GL, continuous)        | ≈ 31 fps        | ≈ 31 fps         |
| JS heap after load                          | 14.5 to 15.4 MB | same             |

Draw calls include the shadow pass. Production serves GLBs with `Cache-Control: public, max-age=31536000, immutable` (development uses `no-store`), so a returning player downloads no model bytes.

## Resource lifetime

The E2E suite opens and closes the viewer 20 times: geometry, texture and cache-entry counts after cycle 20 are no higher than after cycle 3, and JS heap growth over the last 17 cycles stays under the 25 MB test bound. Hidden tabs stop the render loop.

## Cheap by design

On-demand rendering (no idle loop), pause when hidden/off-screen, shared cache with one download per file, per-use material clones only, no environment-map download, no post-processing, `forceContextLoss` on dispose.

## Scaling to final art

Raise nothing until measured. If a phone struggles: lower `maxPixelRatio`, drop shadows, cap FPS, then add LODs (`BASE_CHARACTER_ASSETS.gameplay` is reserved for a lighter model on the same skeleton). KTX2 textures and Draco/meshopt are already supported by the loader through the manifest `compression` field.
