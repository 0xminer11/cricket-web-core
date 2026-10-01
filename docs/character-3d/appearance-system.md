# Appearance system

Appearance is **cosmetic** and server-owned. It is stored on the player profile (Module 4 columns) and edited from the Look tab of the dressing room.

## Fields

| Field                         | Rendering                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `bodyPresetId`                | morph weights from `BODY_VISUALS` (`build_lean`, `build_sturdy`)             |
| `facePresetId`                | morph weights from `FACE_VISUALS` (`face_wide`, `face_narrow`, `jaw_strong`) |
| `skinToneId`                  | `Skin` material colour from the option swatch                                |
| `hairStyleId` / `hairColorId` | hair mesh (`HAIR_VISUALS`) + material colour                                 |
| `beardStyleId`                | beard mesh (`BEARD_VISUALS`); `none` has no asset                            |
| `heightScale`                 | uniform scale on the character root (0.92 to 1.08, step on the preset grid)  |

Presets are weights over shared morph targets, so adding a preset is data, not a new mesh. When body and face presets overlap on a target, the larger weight wins.

## Editing flow

1. The Look tab previews every change on the character immediately (a local draft).
2. **SAVE APPEARANCE** sends `PATCH /api/v1/player/appearance` with only the changed fields.
3. The server validates with the **same function used at creation** (`validateAppearanceChoice` in game-core): every id exists, belongs to its category and is a starter (unlocked) option, and the height is in range and on the step grid. Anything else returns `INVALID_APPEARANCE_OPTION` and nothing is written.
4. The response is the saved appearance; the page re-renders from it. **CANCEL** discards the draft.

Locked options (for example Mohawk, Goatee) are visible in config but refused by the server, so a forged request cannot unlock them. Batting hand and role are not editable here.

## Dressing room slots

Equipment tabs: Bat, Helmet, Gloves, Pads, Shoes, Kit, Trousers (`DRESSING_ROOM_SLOTS`). Selecting a tab moves the camera to the relevant body area (`SLOT_CAMERA_FOCUS`).

## Adding an option

1. Add the option to `seed/appearance.seed.ts` (`unlock: 'starter'` makes it selectable).
2. Hair/beard: add a `HAIR_VISUALS` / `BEARD_VISUALS` entry with `assetId`, and the GLB + manifest entry. Body/face: add morph weights to `BODY_VISUALS` / `FACE_VISUALS`.
3. `pnpm assets:validate` fails if a visual or option has no asset.
