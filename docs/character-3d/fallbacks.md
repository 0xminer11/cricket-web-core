# Fallbacks and failure handling

Principle: **the page is never blocked by the 3D view.** Account, stats, equipment lists, equip buttons and appearance saving all work without WebGL or models.

| Situation                                  | What the player sees                                                                         | Telemetry (`viewer_load_failed.reason`) |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------- |
| Browser has no WebGL                       | 2D portrait + "3D preview is not available on this device…"; no camera buttons               | `webgl_unsupported`                     |
| Base GLB download fails / times out (20 s) | 2D portrait + message + **Retry**; page remains usable                                       | `base_asset_failed`                     |
| Base GLB is corrupt / fails to parse       | same as above                                                                                | `base_asset_failed`                     |
| Optional asset (hair, beard, gear) fails   | character still shown; hint "Some equipment could not be shown in 3D."                       | (partial failure, not a load failure)   |
| Item has no visual or its model is retired | the slot's generic starter model, plan warning (no error shown)                              | none                                    |
| Unknown appearance id                      | that part is skipped with a warning; character renders                                       | none                                    |
| WebGL context lost                         | "The 3D preview was interrupted. Reconnecting…", viewer remounts after ~0.8 s                | `context_lost`                          |
| Unexpected render exception                | `ViewerErrorBoundary` portrait; rest of the page unaffected                                  | none (boundary only)                    |
| Equip/save request fails (network, server) | an inline alert ('Could not reach the server. Try again.' etc.); the loadout stays as it was | n/a                                     |

## The portrait

`PortraitFallback` is an inline SVG built from the same loadout (skin tone, hair colour, bald or not, beard or not), so even the fallback reflects the player's choices. It carries an `aria-label` and works with no JavaScript beyond React.

## Retry

Retry remounts the inner viewer through a React `key`, giving it fresh state, a new WebGL context and a clean load. Failed loads are never cached (the in-flight entry is removed on rejection), so a retry after the network returns genuinely re-downloads.

Bug found by this suite: the orbit camera captured the pointer for any press inside the stage, so the Retry button inside the overlay never received its click. Presses that start on buttons, links or inputs are now ignored by the orbit controller (regression covered by the "retry recovers" E2E test).

## Tested

`e2e/player-3d.spec.ts`: base GLB aborted (portrait, usable page, equip still works, Retry recovers); hair GLB aborted (character still ready, no hair part); corrupt GLB; WebGL disabled; tampered equip request; tab hidden stops the render loop. Unit tests cover unknown ids and retired assets in `planCharacter` and the registry.
