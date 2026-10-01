# Routing and guards

| Route                                                                                    | Purpose                       | Notes                                      |
| ---------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------ |
| `/career`                                                                                | Career Home                   | default home; heading is the player's name |
| `/career/fixtures`, `/history`, `/progression`, `/objectives`, `/events`, `/events/[id]` | detail pages                  | share the "Career sections" sub-navigation |
| `/training`                                                                              | training hub (Module 7)       | server driven (`/training`)                |
| `/match/preparation`                                                                     | match preparation placeholder | `/play` redirects here                     |
| `/player`, `/dressing-room`                                                              | Module 5                      | linked from the hub                        |

## Guard behaviour (`RequirePlayer` + server `requirePlayer`)

| Visitor                          | Result                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Signed out                       | redirected to `/` (or `/login?expired=1` if the session just expired); no career request is made               |
| Signed in, no cricketer          | redirected to `/create-player` (also when the API answers `CRICKETER_NOT_FOUND`); the raw error is never shown |
| Signed in with cricketer         | page renders after one request                                                                                 |
| API unreachable during bootstrap | "We couldn't reach the game" with Try Again                                                                    |
| Ordinary API error               | "We couldn't load your career." + Try Again; session untouched                                                 |
| Session expired (401)            | auth state flips to signed out with `expired`                                                                  |
| Suspended account                | handled by the Module 3 middleware before any career code runs                                                 |

Guests behave exactly like registered players, plus the "Protect Progress" banner (dismissal is remembered until the app is fully reloaded; nothing is stored in the browser, per the project's storage rule). Refreshing `/career`, or opening it directly with a valid session, restores auth and the career.

## Server

Every `/api/v1/career/*` route has `preHandler: requirePlayer`: the player comes from the session. There is no player id, career id or user id in any self-service path, query or body, and unknown query parameters are rejected on the paginated routes.

## Navigation

Primary: Home, Play, Train, Player, Career (icon **and** text). Secondary destinations (Dressing Room, Fixtures, Objectives, History, Events) are reached from cards and the Career sub-navigation. The active section carries `aria-current="page"`. `/` redirects signed-in players to `/career`.
