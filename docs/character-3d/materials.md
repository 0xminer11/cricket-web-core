# Materials and colour

## Conventions

- glTF PBR metallic-roughness only; no custom shaders, no transparency sorting tricks.
- ≤ 4 materials per asset (validator warns above that); placeholders use 1 to 3.
- Named materials are the contract for runtime recolouring:

| Material name                          | Recoloured by                                   |
| -------------------------------------- | ----------------------------------------------- |
| `Skin` (base body parts)               | skin-tone option swatch                         |
| `Hair`, `Beard`                        | hair-colour option swatch                       |
| `Jersey_Body`, `Jersey_Sleeve`         | jersey canvas texture (colour, pattern, number) |
| `Jersey_Trim`, `Jersey_Collar` accents | kit `accent`                                    |
| `Bat_Grip`                             | `defaultColors.grip`                            |

## Per-use cloning

`MaterialController` clones each material when a part is attached and disposes the clone with the part. A cached GLB is therefore never mutated: two characters (or a preview and the equipped item) can share geometry while having different colours.

## Textures

Placeholders use **no image textures**; colour comes from material factors and the dynamic jersey canvas. The jersey texture is drawn at the quality profile's `maxTextureSize` (512 / 1024 / 2048 for low / medium / high), uses sRGB, `flipY = false` (glTF UVs start top-left; u grows toward the viewer's right on the outside of the surface, so a number on the back reads correctly) and is disposed with the part.

For final art: author base colour in sRGB, roughness/metalness packed per glTF, ≤ 2048 px, prefer KTX2 (declare `compression: 'ktx2'` and ship the transcoder under `/basis/`). Keep skin and hair as factor-driven so tone options stay free.

## Colour sources

Skin tones and hair colours are the `swatch` values of the appearance options (`seed/appearance.seed.ts`). Kit colours come from `KitStyle`. Locked or unknown ids never reach the renderer (validated server-side), and colours are never taken from request bodies.

## Lighting

`lighting/studio-scene.ts`: hemisphere + low ambient + warm key + cool fill + rim lights, a dark studio background with fog, and a soft contact shadow under the feet. Medium and high enable a key-light shadow map (1024 / 2048); low disables shadows and antialiasing. Lighting is identical across profiles apart from shadows, so colours look the same everywhere.
