# Training API

Base `/api/v1`, cookie session, `Cache-Control: no-store`, standard envelope `{ success, data }` / `{ success: false, error: { code, message, requestId } }`. All routes require an authenticated user **with a cricketer** (`requirePlayer`); the player comes from the session. No route accepts a player id.

| Method and path                      | Purpose                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /training`                      | the whole hub: readiness, recommendation, development summary, every drill with availability and preview, rest, last session |
| `GET /training/:trainingId`          | one drill with full preview (`DrillDto`)                                                                                     |
| `POST /training/:trainingId`         | complete a training or rest. Requires `Idempotency-Key`. **Body must be empty**                                              |
| `GET /training/history?limit&cursor` | completed sessions, newest first, keyset paginated (limit ≤ 50)                                                              |
| `POST /training/telemetry`           | `training_hub_viewed` / `training_selected` (strict body)                                                                    |

Rest uses the same route: `POST /training/training.physical.rest`.

## Starting a training

```http
POST /api/v1/training/training.batting.timing
Idempotency-Key: 3f9c...32 hex
```

Success: `{ result: { sessionId, trainingId, name, kind, completedAt, replayed, playerXp {gained, levelBefore, levelAfter, xpBefore, xpAfter, xpToNext}, skills [{statKey, label, xpGained, xpBefore, xpAfter, xpToNextAfter, valueBefore, valueAfter, maxed}], fatigue {before, after}, currency {type, spent, balanceAfter} | null, overall {player}, balanceVersion } }`.

A repeat of the same key returns the stored result with `replayed: true` and changes nothing. The same key for a **different** training is `422 TRAINING_ALREADY_PROCESSED`.

## Drill availability reasons

`locked_level`, `locked_role`, `locked_style`, `cooldown`, `maxed_skill`, `blocked_fatigue`, `already_fresh`, `insufficient_coins`, `unsupported_requirement`, each with detail (required level, coins needed/have, fatigue, matches remaining).

## Errors

| Code                         | HTTP | Meaning                                           |
| ---------------------------- | ---- | ------------------------------------------------- |
| `TRAINING_NOT_FOUND`         | 404  | unknown or malformed id                           |
| `TRAINING_LOCKED`            | 403  | level (or unsupported requirement)                |
| `TRAINING_ROLE_RESTRICTED`   | 403  | role                                              |
| `TRAINING_STYLE_RESTRICTED`  | 403  | bowling style                                     |
| `TRAINING_ON_COOLDOWN`       | 409  | cooldown (matches)                                |
| `FATIGUE_TOO_HIGH`           | 409  | fatigue 95+, drills blocked                       |
| `ALREADY_FRESH`              | 409  | rest at zero fatigue                              |
| `INSUFFICIENT_CURRENCY`      | 409  | not enough coins                                  |
| `SKILL_MAXED`                | 409  | every skill of the drill is at 100                |
| `TRAINING_ALREADY_PROCESSED` | 422  | idempotency key reused for another training       |
| `TRAINING_CONFLICT`          | 409  | concurrent change; nothing applied, retry is safe |
| `TRAINING_FAILED`            | 500  | unexpected; generic message, nothing applied      |
| `CRICKETER_NOT_FOUND`        | 404  | no cricketer (guard)                              |
| validation                   | 400  | missing/invalid key, non-empty body, bad query    |

## Client rules

One Idempotency-Key per attempt, reused for retries of an unknown outcome (network error), replaced after success or a definite refusal. The web client does exactly that.
