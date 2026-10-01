# Appearance

Module 2 already stores appearance as typed columns (`player_appearance`: body, face, skin tone, hair style, hair colour, beard, height scale). Module 4 keeps that model and adds a **registry of options** in game-core (`seed/appearance.seed.ts`).

## Registry

Each option has a stable id `appearance.<category>.<name>` (e.g. `appearance.hair.curly_01`, `appearance.haircolor.auburn`), a display name, an **`assetId`** (`asset.character.<kind>.<name>`, resolved later by Module 5 through the asset manifest; assets are still pending) and `unlock: 'starter' | 'locked'`. Colour-like options carry a UI swatch. No file path, URL or binary is stored in game data or player saves.

| Category       | Starter options                                                  | Locked (exist only to prove rejection) |
| -------------- | ---------------------------------------------------------------- | -------------------------------------- |
| Build (`body`) | athletic, lean, sturdy                                           | `elite_01`                             |
| Face           | six presets                                                      | —                                      |
| Skin tone      | eight tones                                                      | —                                      |
| Hair style     | short crop, side part, buzz, curly, long, shaved                 | `mohawk_01`                            |
| Hair colour    | black, dark brown, brown, auburn, blonde, grey                   | `neon_blue`                            |
| Beard          | clean shaven (`none`), stubble, short, full, moustache           | `goatee_01`                            |
| Height         | 92%–108% in 1% steps (default 100%); the database allows 85–115% | —                                      |

## Rules

- `GET /player/creation-options` lists **starter** options only; `buildStarterPlayer` re-checks every id on the server: it must exist, belong to the right category and be `starter`. Unknown, wrong-category, unprefixed and locked ids give `INVALID_APPEARANCE_OPTION`, even if a client forges the request.
- `beardStyleId` is stored as an id (`appearance.beard.none`), not null.
- Seeded/dev players created by Module 2 fixtures use older unprefixed ids; the database only checks id shape, so they remain readable.
- No premium shop exists; future premium cosmetics add `unlock` rules (owned/unlocked) without schema change.
- Real-player likenesses are not used; all options are fictional.

## Module 5 compatibility

The ids are the join keys the 3D character system needs: body preset → rig/mesh, face → head variant, skin tone → material, hair/beard → meshes and colour, kit → starter items' `modelAssetId`. A morph/DNA slider system is **not** built; `heightScale` is the only continuous value, and presets leave room to add morph targets later behind the same ids. `PlayerAvatar` is the only preview component and takes only appearance ids, so replacing it with `Player3DViewer` touches nothing else.
