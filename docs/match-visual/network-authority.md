# Network authority

Production flow:

```text
client DeliveryIntent -> POST /api/v1/matches/:matchId/deliveries -> authoritative engine -> BallResult DTO -> scene
```

## Endpoints

| Route                                   | Purpose                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `POST /career/matches/:fixtureId/start` | create (or return the existing) match for the player's fixture            |
| `GET /matches/:matchId`                 | current match state for a participant                                     |
| `POST /matches/:matchId/advance`        | start the next innings (idempotent)                                       |
| `POST /matches/:matchId/deliveries`     | bowl one delivery                                                         |
| `POST /matches/:matchId/simulate`       | play steps the human does not control: `until_my_turn`, `over`, `innings` |
| `POST /matches/telemetry`               | client analytics (an allow-list)                                          |
| `POST /dev/bowling-lab`                 | development only (disabled in deployed environments)                      |

## Request

```json
{
  "actionId": "9f1c...",
  "expectedSequence": 4,
  "bowlerId": "...",
  "deliveryIntent": {
    "variationId": "delivery.fast.outswing",
    "target": { "x": 0.27, "y": 0.48 },
    "executionInput": 0.82
  }
}
```

The schema is strict: runs, wickets, extras, speed, a shot or any unknown field returns 400. `bowlerId` is needed only
when a new over starts.

## Authority and ownership

Only a participant of the match can read or act on it (anything else is "not found", the same answer as a missing
match). Your side must be bowling (`NOT_YOUR_TURN_TO_BOWL`). The seed, the replay and the opponents' snapshots are
never returned.

## Sequence validation

`expectedSequence` must equal the server's next sequence; otherwise `409 STALE_SEQUENCE` and nothing is resolved.

## Idempotency

`actionId` identifies one delivery. The same id with the same intent returns the **stored** ball with `replayed: true`
and changes nothing (also under four concurrent submissions: exactly one ball is bowled); the same id with a
different intent is `409 ACTION_ID_REUSED`. A reply lost after the server bowled the ball is therefore safe to retry.

## Persistence

Every ball is persisted atomically with its over and innings aggregates, the match state and the engine session
(`match_engine_sessions`, versioned replay + checkpoint). If anything fails the transaction rolls back and the match
does not advance. Training done in another tab never changes a match that has started: the snapshot was taken at
start.

## Known limit

Execution timing is measured in the browser and cannot be verified by the server, so a modified client could always
send `1.0`. The engine bounds the effect (at most a 35% smaller miss, never a replacement for the bowler's skill), the
server never trusts a result, and a future competitive mode would validate timing or remove it.
