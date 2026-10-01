# Dressing room

Route: `/dressing-room` (requires an account with a cricketer; otherwise redirects to sign-in or creation). `/player` is the read-only showcase with a link into it. The career page links to both.

## Flow

```text
tab (Bat, Helmet, Gloves, Pads, Shoes, Kit, Trousers, Look)
   → owned items for that slot (inventory)
   → select an item → PREVIEW on the character + stat comparison (nothing saved)
   → EQUIP  → server validates → character shows what the server returned
   → CANCEL → back to the equipped item
```

- Preview is a local overlay on the loadout; **the server is never told about previews**.
- The comparison table shows the **item modifiers** of the current vs previewed item. Base attributes never change; modifiers apply in matches on top of skills.
- Items above the player's level can be previewed but not equipped; the button is disabled with the requirement shown.
- With one owned item per slot the panel says more equipment unlocks through the career.
- Look tab: see [appearance-system.md](appearance-system.md).

## Server rules (`PUT /api/v1/player/equipment/:slot`, body `{ inventoryItemId }`)

| Check                                      | Error code (HTTP)                |
| ------------------------------------------ | -------------------------------- |
| slot is one of the dressing-room slots     | `INVALID_EQUIPMENT_SLOT` (400)   |
| item is in **this player's** inventory     | `ITEM_NOT_OWNED` (404)           |
| item definition is active                  | `ITEM_UNAVAILABLE` (409)         |
| item fits the slot and is not a consumable | `ITEM_SLOT_MISMATCH` (409)       |
| player level ≥ item requirement            | `ITEM_REQUIREMENT_NOT_MET` (403) |
| body has no extra keys (strict schema)     | validation error (400)           |

Unknown and foreign inventory ids are indistinguishable (`ITEM_NOT_OWNED`), which avoids leaking other players' items. Equipping replaces the slot's occupant atomically; concurrent equips leave exactly one item per slot (tested). Mutating requests require the Module 3 CSRF/origin protections (PUT and PATCH are in the credentialed CORS methods).

Read endpoints: `GET /player/inventory`, `GET /player/equipment`, `GET /player/appearance`. Telemetry: `POST /player/viewer/events` (coarse client events only: opened, loaded with duration/bytes, load failed with a fixed reason enum, equipment previewed). Equipped and appearance-changed events are recorded by the server itself after a successful write.

## Development helper

`POST /api/v1/dev/player/grant-sample-gear` exists **only when `APP_ENV` is `development` or `test`** (404 otherwise; tested). It grants seven sample items idempotently and raises the level to 20 so the dressing room has alternatives while no shop exists. The page shows a **Dev: grant sample gear** button in non-production builds only. Remove both when the shop module lands.

## Accessibility

Tabs use `role="tablist"`; the item grid uses `aria-pressed` buttons; results are announced in a `role="status"` region (`role="alert"` for errors); every orbit action has a button (rotate, zoom, reset, camera presets) in addition to drag/pinch/wheel/keyboard (arrow keys and +/-). The canvas has a descriptive label and a text description. Layout was checked at 320 and 390 px with no horizontal scrolling.
