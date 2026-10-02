# Timing system

Timing is **how far the swing's contact frame is from the ball's arrival**, measured on the presentation clock.

## The clock

The presentation clock starts at 0 when the AI bowler releases the ball (it is negative before release so an early
tap can be buffered). The scene emits `BALL_TIMELINE { pitchTime, contactTime, speedKmh }` at release; the controller
hands it to `BattingTimingPredictor`. One presentation second is one real second; the _ball's_ flight is slowed
(2.4×) so it can be read, which is why the flight to the bat takes about 1.3–1.5 s for a fast ball.

## The number

```text
swingLead(shot)  = timeToContact(shot)              // seconds from swing start to its contact frame
idealTapTime     = contactTime − swingLead
error            = tapTime + swingLead − contactTime  // negative: bat would arrive BEFORE the ball
timingInput      = clamp(error / 0.3, −1, 1)           // BATTING_INPUT.windowSeconds
```

Labels (from `BATTING_INPUT.timingLabels`): |t| ≤ 0.14 **Perfect**, ≤ 0.5 **Early/Late**, beyond **Very early/very
late**. The label shown to the player is the **server's** (`result.batting.timing`).

## What happens to it

1. The swing starts _now_, before any network round trip, so the bat moves the moment the player acts.
2. The number is sent in the shot request.
3. The server scales it (assist level, batter skill) and hands it to the engine as `ShotIntent.timingInput`
   ([player-attributes](player-attributes.md)). The engine's contact formula weights timing at 0.27 of the contact
   score, so timing alone neither makes nor ruins a shot.
4. If the answer is not back by the contact frame, the swing and the ball **wait together on the contact frame** (up
   to 3 s) so the ball never slips past the bat before the umpire has spoken.

## Timing the picture to the result

The player's timing decides the _quality_ (through the engine); it must not decide whether the picture shows contact.
So once the server says the bat met the ball (anything but a miss), the swing's **contact frame is aligned to the ball's
arrival** whatever the tap was: a late swing hurries through its downswing (up to 3× speed) and an early one eases off
(down to 0.35×) and waits on the contact frame; after contact it plays at normal speed. How well the shot was timed
shows in the result (Perfect, Good, Edge, Poor, the feedback label) and in the ball's exit, not in the bat missing a ball
the engine says it hit.

A **miss is never aligned**: an early swing visibly passes before the ball and a late one after it, so a mistimed shot
reads as mistimed. The same holds for a swing made so late that the ball has gone (the bat arrives after it).

This replaced an earlier approach (a swing-speed warp of ±10 %) that left a 100 ms late tap with the bat arriving a metre
behind a ball the engine had called a good contact. It is tested at ±0.1–0.2 s for both hands and every contact quality.

## The optional cue

Assist Normal/High show a bar that fills toward the best moment to swing and falls after it, with text
(_Watch the ball / Wait for it… / SWING NOW / Too late_) so it never depends on colour or motion alone. It reads the
scene's own clock through `controller.battingCue()`, so what it shows is exactly what the swing is measured by.
Assist Off shows nothing. Assist Auto sends no timing at all: the engine times the ball like an AI batter.

## Leaving the ball

If no swing is made by `contactTime + 0.6 × window`, the scene emits `LATE_CUTOFF`; the controller sends the chosen
shot with `timingInput = 1` and the batter is seen playing it hopelessly late. The server still resolves the ball.
