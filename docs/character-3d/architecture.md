# Viewer architecture

## Layers

| Layer          | Files (`apps/web/src/features/player-3d/`)                                                                               | Knows about three.js? |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| React shell    | `components/player-3d-viewer.tsx`, `player-page.tsx`, `dressing-room.tsx`                                                | No (lazy import only) |
| Planning       | `character/plan.ts` (`planCharacter`, `diffParts`, `resolveAttachment`)                                                  | **No**, pure          |
| Registry       | `assets/asset-registry.ts`                                                                                               | No                    |
| Cache/loader   | `character/asset-cache.ts`, `loader.ts`                                                                                  | Loader only           |
| Character      | `character-controller.ts`, `attachment-manager.ts`, `material-controller.ts`, `morph-controller.ts`, `jersey-texture.ts` | Yes                   |
| Animation      | `animation/animation-controller.ts`                                                                                      | Yes                   |
| Camera/light   | `camera/orbit-camera-controller.ts`, `lighting/studio-scene.ts`                                                          | Yes                   |
| Engine/session | `renderer/viewer-engine.ts`, `viewer-session.ts`                                                                         | Yes                   |

Because `planCharacter` is pure, the same plan can drive any renderer, and it is unit-tested without WebGL.

## Data flow

1. The page loads server state (`GET /player`, `/player/equipment`, `/player/appearance`) into a `CharacterLoadout`.
2. `planCharacter(loadout, registry)` returns a `CharacterPlan`: base asset id, parts (equipment, hair, beard) with resolved attachments and colours, hidden body parts, morph weights, skin/hair colour, height scale, animation, and non-fatal warnings (retired assets fall back to the slot's generic item).
3. `ViewerSession.setPlan(plan)` hands the plan to `CharacterController.apply`.
4. `apply` is **latest-wins**: it loads everything the new plan needs first, then swaps atomically. If a newer plan arrives mid-load, the older result is released and discarded, so rapid item switching ends on the last choice and never shows a half-dressed character.
5. Optional parts (gear, hair, beard) may fail without failing the character. Only the base character is mandatory.

## Rendering loop

`ViewerEngine` renders **on demand**. The loop runs while something changes (animation playing, camera damping, a plan swap) and sleeps otherwise. It also pauses when the tab is hidden (`visibilitychange`) or the canvas is off screen (`IntersectionObserver`), follows size with `ResizeObserver`, and handles WebGL context loss (the viewer remounts on restore). On dispose it calls `forceContextLoss`, so entering and leaving the viewer repeatedly cannot accumulate GPU contexts.

## Lazy loading

`player-3d-viewer.tsx` imports `../renderer/viewer-session` dynamically after mount; the pages themselves are loaded with `next/dynamic({ ssr: false })`. Measured result: `/player` initial JS is within 2 KB (gzip) of `/play`, and the three.js chunks are fetched only on viewer pages ([performance.md](performance.md)).

## Lifetime and disposal

- `AssetCache` is reference-counted with LRU eviction (64 entries / 32 MB). In-use assets are never evicted; unused ones are disposed (geometries, materials, textures) when over budget.
- Materials are **cloned per use**, so recolouring one character never mutates a cached asset.
- `CharacterController.dispose` releases every reference; `ViewerSession.dispose` disposes the engine, controls and observers.
- Opening and closing the viewer 20 times leaves geometry/texture/cache counts flat (E2E test).

## Error model

| Failure                           | Result                                                                  |
| --------------------------------- | ----------------------------------------------------------------------- |
| No WebGL                          | `data-viewer-state="unsupported"`, 2D portrait, page fully usable       |
| Base GLB missing/corrupt/timeout  | `error` state, portrait, **Retry** button (remounts a clean viewer)     |
| Optional asset fails (hair, gear) | Character still `ready`; a status line says some equipment is not shown |
| Render exception                  | `ViewerErrorBoundary` shows the portrait; the rest of the page stays    |
| Context lost                      | Reconnect message, automatic remount                                    |

Details: [fallbacks.md](fallbacks.md).
