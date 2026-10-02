# Input system

`core/batting-input-controller.ts` collects the player's choices for one delivery and turns a swing into a request.
It owns no network, scene or scoring code.

## What the player controls

| Control    | Values                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Action     | Defend, Drive, Leg side, Cut / back foot, Loft                         |
| Direction  | Strong leg side, Leg side, Straight, Off side, Strong off side (−1…+1) |
| Exact shot | Optional: any of the 12 Module 0 shots (overrides the simple controls) |
| Assist     | Off, Normal, High, Auto                                                |
| Swing      | Tap on the pitch, **SWING** button, or Space                           |

Choices persist from ball to ball (the player is not asked again) but every swing is a fresh decision.

## Ways to play

- **Touch / mouse**: choose action and direction with the large buttons, then tap the pitch or press SWING.
- **Keyboard**: Space faces the ball and then swings; **1–5** choose the action; **←/→** lean the shot toward the side
  the arrow points to _on screen_ (mirrored for a left-hander).
- **Screen reader**: every control is a real button/radio with a label; the swing is a button, never a gesture.

## Timing is recorded against the ball, not the clock

`commit(now)` is called with `now` read from the scene's presentation clock at the moment of the event. The error is

```text
error = (tapTime + swingLead(shot) − contactTime) / windowSeconds   clamped to −1 … +1
```

with `windowSeconds = 0.3`, `swingLead` the time from the start of that shot's swing to its contact frame, and
`contactTime` when the ball reaches the bat. **No React render happens between the pointer event and the recorded
timing**: the pointer handler reads the clock and calls the controller directly (see [performance](performance.md)).

## One swing per ball

`commit` is the only way a swing starts. It transitions to `SWING_STARTED`; a second tap (a double tap, a key
repeat) finds the machine already committed and does nothing. A tap up to 0.15 s _before_ release is remembered
and honoured at release; a stale one is dropped.

## What is sent

```json
{
  "actionId": "…",
  "expectedSequence": 7,
  "battingIntent": {
    "shotId": "shot.cover_drive",
    "direction": 0.5,
    "timingInput": -0.12,
    "assist": "normal"
  }
}
```

Nothing else: not a contact quality, not a run, not a wicket, not an exit speed. `assist: "auto"` sends **no**
timing at all.
