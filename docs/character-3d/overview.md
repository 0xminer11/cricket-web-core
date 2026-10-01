# 3D cricketer viewer (Module 5)

Module 5 shows the player created in Module 4 as an interactive Three.js character, and lets the player change what the character wears from a Dressing Room. It is a **viewer and a wardrobe**, not gameplay: no match, batting or bowling mechanics, no shop, no physics.

```text
/player            read-only showcase: 3D character, details, equipped kit
/dressing-room     preview and equip owned gear, edit appearance
        │
        ▼
Player3DViewer ──(dynamic import, separate chunk)──> ViewerSession ──> Three.js
        ▲                                                  ▲
 planCharacter(loadout, AssetRegistry)             AssetCache (ref-counted LRU)
        ▲
 server state: appearance + equipment (authoritative)  ◄── API (ownership, slot, level checks)
```

## What is real and what is placeholder

| Piece                                                                                                               | Status                                                                               |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Pipeline: manifest, registry, loader, cache, skinning, attachment, morphs, animation, camera, fallbacks, API, tests | **Real**                                                                             |
| Character and gear meshes                                                                                           | **TEMPORARY PLACEHOLDER**, procedurally generated (low-poly, no third-party content) |
| Animations (`Idle`, `Idle_Bat_R/L`, `Batting_Stance_R/L`)                                                           | **TEMPORARY PLACEHOLDER**, keyframed procedurally on the real skeleton               |

Final art replaces placeholders by shipping optimized GLBs under the **same asset ids**; no code changes are needed ([owner-asset-guide.md](owner-asset-guide.md)).

## Where things live

| Area                                    | Location                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Skeleton, visuals, camera, quality data | `packages/game-core/src/character/` (pure, no three.js)                     |
| Asset manifest (generated)              | `packages/game-core/src/assets/character-assets.generated.ts`               |
| Runtime GLB/SVG files                   | `apps/web/public/game-assets/{characters,kits,bats,ui}/`                    |
| Generator and validator                 | `infrastructure/scripts/{generate,validate}-character-assets.mjs`           |
| Viewer feature                          | `apps/web/src/features/player-3d/`                                          |
| API                                     | `apps/api/src/modules/player/` (`equipment.service.ts`, controller, routes) |
| Contracts                               | `packages/shared-types/src/player.ts`                                       |

## Hard rules

1. Saves and definitions hold **ids**, never URLs. URLs come from the trusted manifest (`AssetRegistry`).
2. The client never sends model URLs or stat modifiers. It sends an inventory item id; the server decides.
3. Equipment never mutates base attributes. Modifiers are applied by the (future) match engine on top of skills.
4. Three.js is loaded only on viewer pages, in its own chunk.
5. A viewer failure never takes the page down: it degrades to a 2D portrait with a Retry button.

## Commands

```bash
pnpm assets:generate   # regenerate placeholder assets + manifest (deterministic)
pnpm assets:validate   # manifest vs files, GLB contract, coverage, budgets, size report
```

See also: [architecture](architecture.md), [testing](testing.md), [performance](performance.md).
