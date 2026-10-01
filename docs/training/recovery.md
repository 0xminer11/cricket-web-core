# Recovery (rest)

Training creates fatigue, so the game needs a way back. Module 0 says recovery "happens after matches/rest activities" and that no real-time energy gate is wanted. Module 7 provides the **rest activity** `training.physical.rest`: free, instant, available whenever fatigue is above zero.

## How much it recovers

```text
reduction = max(3, round(25 × restMultiplier × recoveryStatFactor)),  never more than the current fatigue
recoveryStatFactor = 0.90 .. 1.20 across the Recovery stat 1..100      (Module 0: Recovery improves fatigue reduction)
restMultiplier     = 1.0 for the first 2 rests of the UTC day, 0.7 (3rd), 0.4 (4th), 0.2 from the 5th on
```

So early rests are strong, repeated rests recover less, and **every rest recovers at least 3** while there is fatigue to remove: recovery can never become useless, hence no deadlock. At zero fatigue rest is "already fresh" (`ALREADY_FRESH`).

## Why the diminishing steps

Free instant recovery plus unlimited drills would be infinite progress. The safeguard is deliberately soft (never a timer, never a paywall): drills cost coins, the daily load lowers the value of a day's later drills, and rest recovers less each time. Measurements are in [balancing.md](balancing.md).

## Behaviour details

- Rest is a normal session: same endpoint (`POST /training/training.physical.rest`), same idempotency, same transaction, recorded in history as "Rest and Recovery", cost 0 (no ledger row), `fatigue_added` 0 and the real before/after in the stored result.
- Rests do not count toward the daily drill load; drills do not count toward the rest steps.
- The hub offers rest in its own card with the expected recovery ("recovers about 25 fatigue"), and the recommendation becomes REST from fatigue 75, or when no drill is affordable or available.
- The **Recovery Work** drill (`training.physical.recovery_work`) trains the Recovery _skill_ and is separate from resting.
