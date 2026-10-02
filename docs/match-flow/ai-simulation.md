# AI simulation

`POST /matches/:id/simulate` plays balls the player does not control. Modes: `until_my_turn`, `over`, `innings`.

## What the server does

- Each simulated ball is the engine's real ball (same resolver, same seed stream) and is persisted as its own
  transaction step, so a dropped connection mid-simulation leaves a valid match.
- `until_my_turn` stops at: the innings break (if balls were simulated), the ball your Cricketer is to face, the start of
  an over they may bowl, or mid-over when they are the bowler, whichever comes first.
- `over` plays exactly one over; on the bowling side the request may name the bowler (`bowlerId`), otherwise the
  engine picks the first eligible one.
- The response lists every ball played (`simulated[]`: sequence, innings, over, label, headline, the score after it)
  plus the new authoritative state.

## What the browser does

The state in the response is already final. The browser only chooses how fast to **watch** it:

| Speed   | Behaviour                              |
| ------- | -------------------------------------- |
| Normal  | One ball every ~0.7 s                  |
| Fast    | One ball every ~0.16 s (default)       |
| Instant | No feed; the new state appears at once |

"Skip to the end" shows everything now. The feed announces politely; nothing in it is invented (every line is a ball
the server played). The speed is a comfort setting kept in memory for the visit (see [resume](resume.md)); the match
never depends on it.

## Why this cannot desync

Reveal is cosmetic, the authoritative state is applied once, and every later action carries the sequence it expects.
A refresh during a reveal simply loads the final state.
