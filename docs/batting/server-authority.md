# Server authority

**The client may never send a result.** Everything below is enforced on the server and tested over HTTP.

## Protocol

```text
POST /api/v1/matches/:id/next-ball      -> { preview }   what the AI bowler is about to bowl (no outcome)
POST /api/v1/matches/:id/shots          -> { delivery }  body: { actionId, expectedSequence, battingIntent }
POST /api/v1/matches/:id/simulate       -> SIMULATE TO MY TURN / REST   (Module 9, extended)
POST /api/v1/dev/batting-lab            -> development only
```

`battingIntent` is `{ shotId, direction (−1…1), timingInput (−1…1), assist (off|normal|high|auto) }` and the schema is
**strict**: an unknown field is a 400. `contactQuality`, `runs`, `wicket`, `outcome`, `exitSpeed` are all unknown fields.

## Guarantees

| Rule            | Behaviour                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth            | Sign-in required; only the match's player can shoot (someone else gets 403/404)                                                                                                 |
| Turn            | `NOT_YOUR_TURN_TO_BAT` unless your Cricketer is on strike                                                                                                                       |
| Sequence        | `expectedSequence` must equal the next ball or `STALE_SEQUENCE` (409): nothing is played                                                                                        |
| Idempotency     | the same `actionId` with the same intent returns the **stored** result (`replayed: true`), never a second ball; the same `actionId` with different intent is `ACTION_ID_REUSED` |
| Shot            | an unknown shot is `INVALID_SHOT` (400)                                                                                                                                         |
| One transaction | the ball, the innings state, the scorecard and the engine session are saved together, with an optimistic revision                                                               |
| Fairness        | the AI bowler's delivery is chosen before the shot and from its own stream                                                                                                      |
| No early reveal | `next-ball` returns the delivery only: no contact, runs, wicket, no-ball flag                                                                                                   |

The retry check rebuilds the engine intent from the request (`humanShotIntent`) and compares it with the stored
action, so a lost reply is safe to retry.

## What the client does with a failure

| Failure                                                                        | Client                                                                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Network error                                                                  | abandons the swing, shows nothing, offers **Try the same shot again** (same `actionId`)       |
| Lost reply after the server played it                                          | the retry returns the stored ball; exactly one ball is recorded (tested against the database) |
| `STALE_SEQUENCE`, `ACTION_ID_REUSED`, `NOT_YOUR_TURN_TO_BAT`, `MATCH_FINISHED` | reloads the match; **no fake result is ever played**                                          |

## Presentation pipeline (single player) and request latency

The server resolves the ball when it receives the shot, in tens of milliseconds, **while** the swing is already
moving; the swing is timed against the contact frame (about 0.4 s after the tap), so the answer almost always arrives
before the bat reaches the ball. If it does not, the bat and ball wait together on the contact frame (≤ 3 s).
Even when the server answers early, nothing is revealed before visual contact: the HUD, the banner and the feedback
wait for `RESULT` / `SCORE_UPDATE`. A future real-time mode will change this pipeline; the strict protocol will not.

## Development tools

`/dev/batting` is a 404 in production builds (`NODE_ENV === 'production'`), and its API endpoint is only registered when
the API's environment is `development` or `test` (the same `devTools` flag that protects the Module 9 bowling lab); both
need a signed-in player with a Cricketer. The lab's **forced results** (Perfect, Miss, Edge,
Bowled, Four, Six…) are synthetic, applied on the client to the scene only, and never sent anywhere.
