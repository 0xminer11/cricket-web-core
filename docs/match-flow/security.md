# Security

The browser is untrusted. For Module 11:

| Concern                | Control                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Who may act on a match | `requirePlayer` on every route; the match must belong to the signed-in player's career, else `MATCH_NOT_FOUND` (404) so ids cannot be probed |
| CSRF                   | `originGuard` on the whole matches scope; cookies are `SameSite`                                                                             |
| Request bodies         | zod `.strict()` schemas: a toss body can carry only `call`, a decision only `decision`; unknown keys are rejected                            |
| Toss                   | Winner, coin, seed, decision of the AI are server-side only; a repeated or conflicting call returns the stored result                        |
| Rewards                | Never read from the client; computed from the finished engine state; granted once                                                            |
| Result                 | `GET result` is read-only for a finished match; it cannot be used to finish a match                                                          |
| Hidden information     | The opposition's attributes are not in any DTO; the seed is never sent                                                                       |
| Replay of old requests | `actionId` + `expectedSequence`; stale actions are rejected                                                                                  |
| Rate limiting          | Per-route limits (toss 60/min, flow 240/min, scorecard 120/min, start 30/min)                                                                |
| Caching                | `cache-control: no-store` on every match response                                                                                            |
| Dev tools              | `/dev/match-flow` and the result-force tool exist only when `devTools` is on and never in production                                         |
| Errors                 | Typed error codes; messages never include stack traces, SQL or ids of other players                                                          |

Tests: another player's match (flow, toss, scorecard, result, simulate) returns 404; forbidden bodies return 400;
a toss decision by a non-winner is 409; no endpoint accepts a result; the production build has no dev routes.
