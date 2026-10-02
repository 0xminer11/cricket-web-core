# Engine integration

The match runs on the Module 8 `HeadlessMatchEngine`. Module 9 adds three small, backward-compatible pieces to the
engine package and one service in the API.

## Engine package additions

1. `DeliveryIntent.executionInput?: number` (0..1). Absent or `0.5` changes nothing: all Module 8 replays and the
   golden match are byte-for-byte unchanged. Present values scale the error radius by `1 - 0.35 * (2i - 1)` and shift
   the execution quality by `0.12 * (2i - 1)`; the two constants live in `ENGINE_BALANCE.execution`. `validateAction`
   rejects values outside 0..1 and non-numbers. No extra random draw is made, so determinism is preserved.
   `MATCH_ENGINE_VERSION` stays `2`: every input valid under version 2 produces the same output.
2. `lateralDirection` / `signedMovement` / `bowlingArm` give movement a batter-relative sign.
3. `aiShotIntent` is the AI batter used when a human bowls (see below).

`game-core/src/match-geometry.ts` now owns line/length classification and labels so the engine and the screen use the
same boundaries (the engine re-exports them).

## `MatchPlayService` (apps/api)

- `state` (read only), `advance` (start the next innings, idempotent), `deliver`, `simulate`, and a development
  `lab`. Everything runs inside one transaction with the match row locked.
- `deliver` validates ownership and that your side is bowling, validates the sequence, selects the bowler if a new
  over starts, validates the delivery against the bowler's style, **derives line and length from the target with the
  engine's own classification**, asks the AI batter for a shot, resolves the ball with the engine, persists the
  ball, over, innings and (when finished) the result, and saves the engine session.
- The response is a presentation DTO: signed movement, speed in km/h, intended and actual target with labels,
  execution rating (poor/average/good/excellent, never the raw formula inputs), shot, contact, runs, extras, wicket,
  a headline and a detail sentence, and the new match state.

## The AI batter and fairness

`aiShotIntent(seed, batter, {variation, line, length}, sequence, context)` sees only what a batter sees when the
bowler runs in: the declared variation, the line and length that were aimed at, and the match situation (runs needed,
balls left in a chase). It never sees the resolved execution error, the delivery's random stream or the outcome, and
has no hidden skill boost: the same attributes and formulas apply to a human. It has its own seeded stream, so the
same (seed, sequence, intent) always gives the same shot, which is what makes replays and retries reproducible. It
chases harder when the required rate climbs and defends more when it does not. Timing comes from the engine's own
headless timing (Timing, Reaction, Consistency, delivery difficulty), so the batter is not perfect.

## What the engine does not produce

The engine's AI batters almost never "miss" (a clean miss needs a weak batter and a strong bowler), so bowled and LBW
dismissals are rare in play and most wickets are "caught". The scene presents all three; the dev lab can preview the
rare ones with a clearly labelled synthetic preview.
