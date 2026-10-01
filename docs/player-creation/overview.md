# Player creation overview (Module 4)

Module 4 turns an authenticated account (guest or registered) into a playable career: the player makes a handful of **decisions**, the server turns them into the complete **starting state** from Module 0 data, and everything is written in **one database transaction**.

```text
Authenticated? ── no ──> entry screen (Module 3)
      │ yes
Has cricketer? ── yes ──> /career
      │ no
/create-player  (Identity → Cricket style → Appearance → Personality → Review)
      │  START MY CAREER   POST /api/v1/player   (Idempotency-Key)
      ▼
validate → game-core builds starting state → ONE transaction → events after commit
      ▼
"WELCOME TO YOUR CAREER" → ENTER CAREER → /career
```

## Concepts and boundaries

| Concept   | Table / source               | Notes                                                                                          |
| --------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Account   | `users` (Module 3)           | Guest or registered. `userId` is never accepted from the client.                               |
| Cricketer | `player_profiles` (Module 2) | `player.id` ≠ `user.id`, always. One active cricketer per user for the MVP (unique `user_id`). |
| Career    | `careers`                    | Created with the player, `academy` tier, one `career_started` history row.                     |

A guest can create a cricketer before registering. The upgrade in Module 3 keeps `users.id`, so the cricketer, career, wallet and inventory follow automatically (tested end to end, including in a real browser).

## Where things live

| Area                  | Location                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Rules and data (pure) | `packages/game-core`: `config/starter-player.config.ts`, `config/overall.ts`, `config/countries.ts`, `seed/appearance.seed.ts`, `creation.ts` |
| Contracts             | `packages/shared-types/src/player.ts` (strict request schema, DTOs, error codes, name rules)                                                  |
| Persistence           | `packages/database`: migration `0004`, `createPlayerFoundationIn` (Module 2, reused unchanged)                                                |
| API                   | `apps/api/src/modules/player/` (controller, `PlayerCreationService`, read model, `requirePlayer`, name policy, events)                        |
| Web                   | `apps/web/src/features/player-creation/` + routes `/create-player` and `/career`                                                              |

Controller → `PlayerCreationService` → game-core → repositories. The route holds no rules and no SQL.

## What Module 4 does not do

No 3D rendering, GLB loading, training, career dashboard, matches, shop, rename, delete or reset. `/career` is a thin completion page (name, role, tier, a few stats) that Module 6 replaces.

## Conflicts with earlier modules (documented, minimal changes)

| #   | Conflict                                                                                                                                                                   | Resolution                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Module 0 items have no usable starter **gloves, pads, shoes, jersey or pants** (gloves/pads need level 4, shoes level 10, the only jersey costs gems, there are no pants). | Added five level-1, common, unsellable starter items (`item.{gloves,pads,shoes,jersey,pants}.starter_01`). They carry **no stat modifiers**, so starter gear never out-powers purchasable gear. The existing level-1 Street Willow bat and Core Guard helmet are reused. Additive; `GAME_BALANCE_VERSION` stays `1`. |
| 2   | Module 0 `PLAYER_ARCHETYPES` (5 role-bound templates) start at roughly 60–70 overall, far above the academy band (28–45) and `rookieBaseline` 35.                          | They remain dev/NPC seeds. Starter stats come from new per-role profiles tuned to overall **40** (inside the academy band).                                                                                                                                                                                          |
| 3   | The brief suggests names of 2–24 characters; the Module 2 CHECK (and `LIMITS`) is **3–24** code points, trimmed.                                                           | Kept 3–24 (no migration for a cosmetic nickname field); the check counts Unicode code points exactly like PostgreSQL.                                                                                                                                                                                                |
| 4   | The brief names a `CAREER_START_GRANT` ledger type; Module 2 defines `starter_grant`. Module 0 starts players with 2,500 coins **and 50 gems** (the brief allows 0).       | Use the existing `starter_grant` type and Module 0's wallet unchanged.                                                                                                                                                                                                                                               |
| 5   | Role ids: the brief shows `role.top_order_batter`; Module 0/2 persist `top_order_batter`.                                                                                  | Keep the Module 0 identifiers (no prefix).                                                                                                                                                                                                                                                                           |
| 6   | Module 2 test fixtures used unprefixed appearance ids (`face.preset_01`). The brief asks for `appearance.*` ids.                                                           | The registry uses `appearance.<category>.<name>`; the DB only checks id _shape_, so existing fixtures stay valid. Creation accepts registry ids only.                                                                                                                                                                |
| 7   | Module 0 does not say whether a new player starts attached to a team.                                                                                                      | Join the fictional **River Hawks Academy** (the only academy-tier team) via the existing `createPlayerFoundationIn` path; configured in `STARTER_CAREER`.                                                                                                                                                            |
| 8   | Module 0 defines no role ↔ bowling-style compatibility.                                                                                                                    | Defined in config (`STARTER_ROLES`); see [roles](roles.md).                                                                                                                                                                                                                                                          |
| 9   | The `player.created` domain event payload held only `playerId`.                                                                                                            | Extended with `userId`, `careerId`, `primaryRole`, `careerTier`, `accountType`, `balanceVersion` (nothing personal).                                                                                                                                                                                                 |
| 10  | `/career` was an application shell and part of the shell smoke test.                                                                                                       | `/career` is now authentication-guarded and shows the cricketer; the shell test no longer includes it, and `e2e/player-creation.spec.ts` covers it.                                                                                                                                                                  |
