# Resync and recovery

`resyncMatchState()` throws away any local divergence and rebuilds from `GET /matches/:matchId`.

## When it runs

- `STALE_SEQUENCE`, `ACTION_ID_REUSED`, `BOWLER_NOT_ELIGIBLE`, `INVALID_DELIVERY`, `NOT_YOUR_TURN_TO_BOWL`,
  `MATCH_FINISHED` from a delivery: the run-up is cancelled, the match is reloaded and a notice says why.
- A load failure: a retryable error with a "Try again" button.

## Failures

| Failure                                 | Behaviour                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Network error before the server answers | The run-up is cancelled, nothing is shown, "Try the same delivery again" re-sends the **same** `actionId` |
| Reply lost after the server resolved    | The retry returns the stored ball (`replayed`), and exactly one ball exists                               |
| Server rejects the delivery             | No visual result is ever played; the match is reloaded                                                    |

## Refresh and resume

The server persists after every ball, so a refresh reloads the authoritative state at the next delivery: same score,
same over, correct sequence (end-to-end tested after three balls). Mid-flight recovery is not attempted: if the page
is refreshed during an animation, the persisted result is shown and the next ball is offered. Leaving the match
never deletes progress; "Resume match" on the preparation screen returns to the same match.

## Lifecycle

`destroy()` cancels late replies (a generation token), detaches the scene and stops the controller; it can be
re-activated, so React StrictMode's mount-unmount-mount cycle in development is safe.
