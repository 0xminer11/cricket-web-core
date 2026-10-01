# Creation flow

## Wizard (client)

Five steps, kept in one component's state: **Identity → Cricket style → Appearance → Personality → Review**. Back and Next never lose choices, and **nothing is saved until START MY CAREER** (no draft table; a refresh before the end restarts the wizard, which the brief allows). Wizard state holds no secrets; no storage API is used.

| Step            | Fields                                              | Notes                                                                                                                                                                                                  |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Identity      | name, country, jersey                               | Name is normalised on blur; country list comes from the options endpoint (names via `Intl.DisplayNames`); jersey 0–99 (cosmetic, not unique)                                                           |
| 2 Cricket style | role card, batting hand, bowling style              | Only styles compatible with the role are offered; **No bowling** only for non-bowling roles; a live **Starting strengths** panel shows the exact starting stats and overall for the chosen combination |
| 3 Appearance    | face, skin, hair, hair colour, beard, build, height | Registry-driven cards; locked options are never sent to the client. A 2D placeholder avatar (`PlayerAvatar`) shows the look; Module 5 swaps it for a 3D viewer behind the same props                   |
| 4 Personality   | one of six archetypes                               | Trade-offs shown plainly; none is labelled best or recommended                                                                                                                                         |
| 5 Review        | everything, stat bars, starter kit, career start    | START MY CAREER                                                                                                                                                                                        |

Behaviour details:

- **Validation per step.** Next shows field errors (`aria-invalid`, `aria-describedby`, an alert summary receiving focus) instead of advancing. The server validates again; it is authoritative.
- **Focus management.** The step heading takes focus after each navigation.
- **Retry safety.** One Idempotency-Key is generated per wizard and reused for every submit; double clicks are blocked while pending; a network failure keeps every choice and the same key. `CRICKETER_ALREADY_EXISTS` (another tab won) refreshes the account and goes to `/career`.
- **Stale config.** The wizard submits `gameBalanceVersion` for information only. The server always applies current rules and only fails if a _choice_ became invalid (the specific code is returned, so the player can review).
- **After success.** The wizard hands the new cricketer to the page, which shows "WELCOME TO YOUR CAREER" and ENTER CAREER → `/career`. `hasCricketer` flips via an account refresh _after_ the welcome is shown, so the page's own redirect cannot swallow it.

## Route guards (no loops)

Both pages decide from the same `hasCricketer` flag from `GET /api/v1/me`:

- `/create-player`: signed out → `/`; has cricketer → `/career`.
- `/career`: signed out → `/`; no cricketer → `/create-player`.
- `/login`, `/register`, `/`: signed-in players go to `/career` or `/create-player` by the same rule (`destinationFor`).

## Server flow (`PlayerCreationService.create`)

1. Normalise and validate the name (3–24 code points, Unicode, reserved/blocked checks).
2. `buildStarterPlayer` (game-core) validates country, jersey, hand, role, style compatibility, appearance ids/unlock state/height and archetype, then returns the full starting state, deterministically.
3. Hash the canonical request (for idempotency).
4. If the user already has a cricketer → replay (same key + same hash) or `CRICKETER_ALREADY_EXISTS`.
5. One transaction: `createPlayerFoundationIn` + `audit_logs` row ([transaction-design](transaction-design.md)).
6. After commit: `player.created` domain event and analytics (`cricketer_creation_completed`, `player_created`, `career_started`).
7. Return the sanitised profile (`created: true`, HTTP 201).
