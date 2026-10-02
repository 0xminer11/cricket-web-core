# Bowling input

`BowlingInputController` collects the player's choices for one delivery: bowler, variation, aim and execution timing.
It owns no network, scene or scoring code, so the future bowling nets can reuse it.

## Delivery choices

Variations come from Module 0 (`DELIVERIES`) filtered by the bowler's style on the server; the controller shows
exactly what the server listed (`deliveryIds` per bowler, with a catalogue of cards). An off-spinner is never offered
an outswing. Picking a variation moves the aim to that variation's natural length (a yorker aims at the toes) and
keeps the chosen line.

## Execution meter

A cursor sweeps 0..1..0; pressing BOWL freezes it. The score is `1` inside the highlighted window and falls linearly
to `0` at the ends. The window half-width is
`0.05 + 0.13 * (accuracy + control + consistency) / 300 - difficultyPenalty (+0.08 with assist)`, clamped to
`0.02..0.30`, so training those skills makes the meter more forgiving. The sweep period is 1.9 / 1.5 / 1.2 s for easy,
medium and hard deliveries.

The score is sent as `executionInput` (0..1, 0.5 neutral). The engine uses it in a bounded way:

- error radius multiplied by `1 - 0.35 * (2 * input - 1)`,
- execution quality shifted by `0.12 * (2 * input - 1)`.

So perfect timing shrinks the miss by at most 35%; it cannot replace Accuracy or Control (a perfect press at
Accuracy 30 is still more than three times as wild as a neutral press at Accuracy 90; this is asserted in a test).
Fatigue still enlarges the miss. A client that always sends 1.0 gains at most that bounded advantage; see
[network-authority](network-authority.md).

## Assisted timing

Assist widens the window and sends **no** `executionInput` at all, which the engine treats as neutral. It never
gives an advantage; it removes the penalty for poor timing. It is the default under `prefers-reduced-motion`.

## Locking

`commit()` freezes the delivery and moves the state machine to `RUN_UP`; from then on `inputOpen` is false so the
delivery cards, presets, drag and BOWL are all inert. Repeated taps resolve to one intent.

## State machine

`PREPARING -> TARGETING -> READY -> RUN_UP -> RELEASED -> BALL_IN_FLIGHT -> PITCHED -> BATTER_ACTION -> RESULT -> RESETTING`.
Only listed transitions are legal (`RUN_UP -> TARGETING` is the abort for a failed request). Illegal transitions throw;
UI events that may race use `tryTransition`.

## Keyboard

Space or Enter bowls (unless a button has focus), arrows move the aim (Shift = coarse), `1`-`9` pick a delivery.
