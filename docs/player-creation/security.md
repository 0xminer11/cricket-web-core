# Security (player creation)

Authority matrix (Module 0 chapter 16): the client may send **cosmetic selection requests**; everything of value is server-generated.

| Client wants to set                                                   | Result                                                                  |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `userId`, `playerId`, `accountType`                                   | `400 VALIDATION_ERROR` (strict schema); acting user is the session user |
| attributes / `power: 100` / `overall`                                 | `400`; the server derives all stats                                     |
| `level`, `xp`, `fans`, `reputation`, `selectorInterest`, `careerTier` | `400`; fixed by `STARTER_CAREER`                                        |
| `coins`, `gems`, `inventory`, `equipped`                              | `400`; wallet from Module 0 economy, kit from `STARTER_LOADOUT`         |
| a locked or unknown appearance id                                     | `400 INVALID_APPEARANCE_OPTION`                                         |
| an incompatible role/bowling style                                    | `400 ROLE_BOWLING_STYLE_MISMATCH`                                       |
| a second cricketer                                                    | `409 CRICKETER_ALREADY_EXISTS` (application check **and** unique index) |
| creation while signed out / suspended                                 | `401` / `403 ACCOUNT_SUSPENDED`                                         |

Further protections:

- **Mass assignment**: no request object is spread into persistence. `foundationInput` maps explicit fields.
- **Strict schemas** reject unknown fields (nested ones too); bodies are capped at 8 KiB; `Idempotency-Key` must match `[A-Za-z0-9_-]{16,128}`.
- **CSRF/CORS**: the Module 3 trusted-origin check and credentialed CORS cover `/api/v1/player*`; `Cache-Control: no-store`.
- **Rate limits**: route-level 20/min (creation) and 60/min (funnel events) per IP in staging/production; relaxed in development/test.
- **Ownership**: `GET /player` resolves the player from the session; there is no `:playerId` route, and a path id returns 404. `requirePlayer` (`PlayerContext {playerId, userId}`) is the guard future career routes use. Public profile access, when it exists, must be a separate route with its own rules.
- **Names**: Unicode-safe validation; control, zero-width, bidi-override and emoji characters are rejected; ZWJ/ZWNJ are allowed only between letters (needed by Indic/Persian scripts); at least one letter is required. `NamePolicy` blocks reserved staff/system names (exact match after folding case, diacritics and spacing) and an optional whole-word blocked-term list (`PLAYER_NAME_BLOCKED_TERMS`, `PLAYER_NAME_RESERVED`), so legitimate names such as "Dickson" are not blocked. A real moderation service can replace the policy behind one method.
- **Logging**: failures log `requestId`, `userId`, error type; never the request body, name or session data. The `player.created` audit row stores ids, tier, role, archetype and balance version, **not** the display name or country.
- **Analytics** are pseudonymous (`userId`), best-effort, strictly validated, and cannot modify state.

## Manual security review (Module 4)

| Check                                                 | Result | Evidence                                                     |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------ |
| User cannot specify user id                           | ✓      | strict schema; ownership test; manual curl                   |
| Cannot create a second player                         | ✓      | API test, concurrent test, DB unique violation test          |
| Cannot set attributes / XP / coins / inventory / tier | ✓      | 17 smuggling variants rejected; stored values server-derived |
| Cannot select locked or unknown cosmetics             | ✓      | API + unit tests                                             |
| Cannot bypass role compatibility                      | ✓      | full matrix unit test + API cases                            |
| Creation is transactional                             | ✓      | rollback test (zero rows, no event)                          |
| Creation is idempotent                                | ✓      | replay, key reuse, concurrent same-key tests                 |
| Other users cannot read a player                      | ✓      | `GET /player` is session-scoped; path ids 404                |
