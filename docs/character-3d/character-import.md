# Importing a new character (checklist)

Use this when final character art replaces the placeholder base (`asset.character.base.player_01`) or a new body type is added.

## Before export

- [ ] Units are metres, Y up, character faces +Z, feet on y = 0, origin between the feet.
- [ ] Height is 1.6 to 2.1 m at rest (the game applies `heightScale` 0.92 to 1.08 on top).
- [ ] Rest pose: arms down, legs straight (A-pose or T-pose is fine if the rig and clips agree; the contract is "consistent with the clips").
- [ ] Skeleton has the 23 logical bones. Names either match `CANONICAL_SKELETON_MAP` or you add a `CharacterSkeletonMap` for your vendor names.
- [ ] No duplicate bone names; every skinned vertex has at most 4 influences; weights sum to 1.
- [ ] Body is split into the named meshes `Body_Head`, `Body_Torso`, `Body_Arms`, `Body_Hands`, `Body_Legs`, `Body_Feet` (clothing hides the matching part).
- [ ] Morph targets `build_lean`, `build_sturdy`, `face_wide`, `face_narrow`, `jaw_strong` are declared on every skinned mesh in that order.
- [ ] Skin material is one material (colour is applied at runtime from the skin-tone option).
- [ ] Clips: `Idle`, `Idle_Bat_R`, `Idle_Bat_L`, `Batting_Stance_R`, `Batting_Stance_L` (left clips are true mirrors, not a flipped character).

## Export and optimize

- [ ] glTF 2.0 binary (`.glb`), no cameras or lights, apply transforms, Y up.
- [ ] Meshopt (or quantization) compression; textures ≤ 2048 px (KTX2 if used; the loader supports it when the manifest says `ktx2`).
- [ ] File name `player_base_v<N>.glb` (bump `N`, never overwrite a version).

## In the repo

- [ ] Put the file under `apps/web/public/game-assets/characters/`.
- [ ] Update the manifest entry (path, version, `sizeBytes`, `checksumSha256`, `compression`).
- [ ] `pnpm assets:validate` is green (it checks every item above that is machine-checkable).
- [ ] Open `/player` and `/dressing-room`; toggle **Debug** (dev builds) to see the skeleton and axes; step through Idle, Hold bat, Batting stance for a right- and a left-hander.
- [ ] Re-tune the attachment tuner values for bat and helmet if the hand/head bone orientations differ ([equipment-attachments.md](equipment-attachments.md)).
- [ ] Run `pnpm test` and `pnpm test:e2e`.

## Common failures

| Symptom                                    | Likely cause                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Validator: "joint order differs"           | Clothing exported against a different skeleton export; re-export all against one rig |
| Clothing stretches or floats               | Different rest pose between base and clothing                                        |
| Character sinks into or floats above floor | Feet not at y = 0 (validator reports the offset)                                     |
| Bat in the wrong place after import        | Hand-bone roll differs; adjust `BAT_ATTACHMENT` with the dev tuner                   |
| Left-hander looks wrong                    | Left clips are not mirrors of the right clips                                        |
