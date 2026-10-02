# Toss

## Rules

- The **away side calls** (the career team is home or away as the fixture says; `callerTeamId` is stored when the match
  is created). If the AI side calls, its call is stored as `aiCall`; if you call, you choose HEADS or TAILS.
- The coin is `MatchRandom(`${seed}:toss:coin`).next() < 0.5 ? 'heads' : 'tails'`: a pure function of the match seed.
- The caller wins when their call equals the coin.
- The winner chooses bat or bowl. **If the AI wins, it decides immediately** (`aiTossDecision`: deterministic, from the AI side's batting and bowling strength, the pitch and the format; a green pitch leans to bowling first, a hard or dry one to batting first) and the match starts. If you win, the match waits for `POST /toss/decision`.

## API

| Endpoint                          | Body                            | Result                            |
| --------------------------------- | ------------------------------- | --------------------------------- |
| `POST /matches/:id/toss/call`     | `{ call?: "heads" or "tails" }` | The flow with the toss result     |
| `POST /matches/:id/toss/decision` | `{ decision: "bat" or "bowl" }` | The flow, with the engine started |

Both bodies are strict zod schemas (`.strict()`): a client cannot send a winner, a coin, a seed or a result.

## Guarantees

- **Persisted, no reroll.** The result is written to `flow.toss` in the same transaction that starts the engine
  (for an AI winner) or once, before the decision (for you). A second `call` returns the stored result, whatever the
  request says; concurrent calls are serialized by the match lock.
- **The decision is once, only for the winner, only before the first innings exists.** Otherwise
  `INVALID_TOSS_DECISION` (409). Before the toss, a decision is `INVALID_TOSS_STATE`.
- **Refresh safe.** After the toss the screen shows the stored result; after the decision it goes to the match.
- The engine is started with `engine.startMatch(undefined, { winnerTeamId, decision })`, so the replay holds exactly one
  `start` command carrying the toss and the engine's own state agrees with the toss record.
- The coin animation is decoration (it lands on the stored face). Under reduced motion there is no animation.
- Analytics: `toss_completed`, `toss_decision_selected`.
