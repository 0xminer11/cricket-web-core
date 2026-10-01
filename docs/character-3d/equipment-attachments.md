# Equipment, attachment and visibility rules

Gameplay items (`ITEMS`, Module 0) and visuals (`EQUIPMENT_VISUALS`, `packages/game-core/src/character/visuals.ts`) are separate. An item may have no visual; a visual never changes stats. `EQUIPMENT_VISUAL_BY_ITEM` links them by `itemId`.

## Two modes

| Mode       | Used for                           | How it is shown                                                          |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `skinned`  | jersey, pants, shoes, gloves, pads | Rebound to the base skeleton (same bones, same order); follows animation |
| `attached` | bat, helmet                        | Parented to a bone with an offset (`AttachmentTransform`)                |

## AttachmentTransform

`bone` is a logical bone or `dominantHand` / `offHand`; `position` (metres, bone space), `rotation` (Euler XYZ radians), `scale`, `mirrorForLeft`.

- Bat: `{ bone: 'dominantHand', position: [0, -0.04, 0.03], rotation: [π/2, 0, 0], scale: 1, mirrorForLeft: true }`. Origin is the grip centre, handle toward +Y, blade toward -Y.
- Helmet: `{ bone: 'head', offset 0 }`. Head pieces are authored in head-bone space.

## Handedness

`resolveAttachment(def, hand)` is the one place handedness is resolved. For a left-hander `dominantHand` becomes `leftHand`, and when `mirrorForLeft` is set x is negated and the y/z rotations are negated. The character is never flipped; left-handed clips (`*_L`) are used for animation.

## Hiding and hair

- `hideBodyParts` hides base meshes the garment replaces (gloves hide `hands`, shoes `feet`, jersey `torso`, pants `legs`), preventing z-fighting and poke-through.
- `hairVisibility` on a helmet is `compatible_only`: hair styles marked `helmetCompatible` (short crop, buzz) stay under the helmet; long or voluminous hair is hidden rather than clipping. Beards always show.

## Colours and the jersey

`materialSlots` / `defaultColors` recolour named materials (for example the bat `grip`). Colours come from trusted config, never from the client. Jerseys use **one model for every colour and number**: a canvas texture (`jersey-texture.ts`) draws base colour, pattern and the player's number on the back (middle of the texture, u = 0.5) and small on the chest.

## Fallbacks

`FALLBACK_SLOT_ITEMS` names a generic starter item per slot. If an item has no visual, or its model was retired from the manifest, the registry returns the slot's generic visual and the plan records a warning, so an old career always loads.

## Adding a new equipment item

1. Add the gameplay item (`seed/items.seed.ts`) with a `modelAssetId` and `iconAssetId`.
2. Add an `EQUIPMENT_VISUALS` entry (slot, assetId, mode, attachment or hide rules, kit style).
3. Export the GLB to the [skeleton contract](character-skeleton.md); add the manifest entry and icon.
4. `pnpm assets:validate`; test in the dressing room (grant via dev tool, preview, equip).
5. Add/adjust tests if the item introduces a new rule.

## Dev tools (non-production builds only)

- **Debug** button: skeleton helper, axes, stats overlay (FPS, frame ms, draw calls, triangles, geometries, textures, cache).
- **Attachment tuner**: nudge bat/helmet position and rotation live, copy the numbers into `visuals.ts`. Never shown in production and saves nothing.
- `window.__viewer` exposes the session to tests (`attachedParts`, `stats`, `engineRunning`).
