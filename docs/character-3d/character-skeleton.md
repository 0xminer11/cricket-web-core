# Character skeleton and coordinate standard

All characters, current and future, share one skeleton contract. Code never hardcodes a vendor bone name; it asks for a **logical bone** and a `CharacterSkeletonMap` translates it to the node name inside the GLB.

## Coordinate and scale standard

| Rule        | Value                                                           |
| ----------- | --------------------------------------------------------------- |
| Unit        | 1 unit = 1 metre                                                |
| Up          | +Y                                                              |
| Forward     | the character faces **+Z**; its left side is **+X**             |
| Ground      | feet rest on y = 0; the origin sits between the feet            |
| Height      | 1.6 to 2.1 m at `heightScale` 1 (tolerance 5 cm on the ground)  |
| Rest pose   | arms hanging straight down, legs straight, palms toward thighs  |
| Height edit | `heightScale` (0.92 to 1.08) is a **uniform** scale on the root |

Source of truth: `CHARACTER_CONVENTIONS` in `packages/game-core/src/character/skeleton.ts`.

## Logical bones (23)

```text
root → hips → spine → chest → upperChest → neck → head
                         upperChest → leftShoulder → leftUpperArm → leftLowerArm → leftHand
                         upperChest → rightShoulder → rightUpperArm → rightLowerArm → rightHand
        hips → leftUpperLeg → leftLowerLeg → leftFoot → leftToe
        hips → rightUpperLeg → rightLowerLeg → rightFoot → rightToe
```

## Bone mapping

`CANONICAL_SKELETON_MAP` uses PascalCase names (`Root`, `Hips`, `Spine`, `Chest`, `UpperChest`, `Neck`, `Head`, `LeftShoulder`, `LeftUpperArm`, `LeftLowerArm`, `LeftHand`, `RightShoulder`, …, `LeftToe`, `RightToe`). `MIXAMO_SKELETON_MAP` is a worked example of mapping another vendor's names (`mixamorig:Hips`, `mixamorig:Spine1`, `mixamorig:LeftArm`, …). To support a new rig, add a map; do not rename bones in code.

## Skinned clothing and the shared skeleton

Clothing (jersey, pants, shoes, gloves, pads) is **skinned to the same bones in the same order** as the base character. At load time the clothing mesh is rebound to the base skeleton (`mesh.bind(baseSkeleton, mesh.bindMatrix)`), so it follows every animation and morph without a second skeleton. A mismatch in joint order is a validation error.

## Rigid gear

Bats and helmets are not skinned. They are parented to a bone (hand or head) with an attachment transform ([equipment-attachments.md](equipment-attachments.md)). Head pieces (helmet, hair, beards) are authored in **head-bone space** so they need no offset.

## Morph targets

`BASE_MORPH_TARGETS`: `build_lean`, `build_sturdy`, `face_wide`, `face_narrow`, `jaw_strong`. Every skinned mesh declares all five in this order, even when a part does not need them, so weights apply uniformly. Body and face presets are weight tables (`BODY_VISUALS`, `FACE_VISUALS`).

## Gameplay compatibility

`BASE_CHARACTER_ASSETS.gameplay` is reserved for a lower-detail match model sharing this skeleton (not built). Because clips, attachments and morphs address logical bones, the match engine and game-server can reuse them. The viewer's animation names are logical (`idle`, `idle_bat`, `batting_stance`); future match clips extend `LOGICAL_ANIMATIONS` and `ANIMATION_CLIP_MAP`.
