# Assets wanted for Module 5 (3D cricketer)

> **Superseded by Module 5.** The viewer is built and runs on generated placeholders; the current asset list, formats and delivery steps are in [docs/character-3d/owner-asset-guide.md](../character-3d/owner-asset-guide.md). The table below is kept as the original Module 4 hand-off.

Module 4 runs on placeholders and is not blocked by any of this. Every asset is addressed by an id in `seed/appearance.seed.ts` / `seed/items.seed.ts`, so files can be dropped in through the asset manifest without touching gameplay ids.

| Asset                                          | Referenced by                                                                                                                                   | Needed                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Base rigged cricketer (GLB, humanoid skeleton) | `asset.character.body.*`                                                                                                                        | 1 rig, shared by all presets                                                           |
| Body presets                                   | `asset.character.body.{athletic_01,lean_01,sturdy_01}` (+ locked `elite_01`)                                                                    | 3 meshes or morph variants                                                             |
| Head/face variants                             | `asset.character.face.preset_01 … 06`                                                                                                           | 6                                                                                      |
| Skin materials                                 | `asset.character.skin.tone_01 … 08`                                                                                                             | 8 (material/texture set)                                                               |
| Hair meshes                                    | `asset.character.hair.{short_01,short_02,buzz_01,curly_01,long_01,bald_01}` (+ `mohawk_01`)                                                     | 6 (+1 locked); recolourable material for `haircolor.*`                                 |
| Beard meshes                                   | `asset.character.beard.{stubble_01,short_01,full_01,moustache_01}` (+ `goatee_01`)                                                              | 4 (+1 locked)                                                                          |
| Starter kit models                             | `asset.model.{bat.street_willow_01,helmet.core_guard_01,gloves.starter_01,pads.starter_01,shoes.starter_01,jersey.starter_01,pants.starter_01}` | 7 (jersey/pants need left- and right-handed mirroring only if the rig does not mirror) |
| Item icons                                     | `asset.icon.*` for the same ids                                                                                                                 | 7                                                                                      |
| Idle pose / animation                          | rig                                                                                                                                             | at least one stance (left and right-handed)                                            |

Handedness: `battingHand` is persisted now; Module 5 should mirror stance and camera from it. Height: `heightScale` (0.92–1.08) is a uniform scale on the rig.

Future (not built): morph-target/DNA sliders can extend the same ids; premium cosmetics add `unlock` rules and shop ownership.

## Future work noted by Module 4

- **Rename**: not built. Likely a cooldown and/or coin/gem cost, re-running `NamePolicy`, with an audit row.
- **Delete/reset career**: not built. Needs economy and ledger design (never a plain delete).
- **Edit appearance/jersey**: Module 5 (dressing room); batting hand and primary role should be restricted, and role change needs a defined path (`secondary_roles` is reserved).
- **Multiple careers/characters**: drop the unique `user_id` index and pick a "current" player; `requirePlayer` then resolves the selected one.
- **Draft persistence**: a separate draft table if ever needed; the wizard deliberately never writes partial players.
