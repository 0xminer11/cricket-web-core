# Batting HUD and controls

The Phaser canvas draws the world; **the HUD and the controls are DOM** (`components/batting-panel.tsx`,
`components/hud.tsx`), so they are real buttons with real labels, scale with the system font and work with a screen reader.

## Scoreboard (shared with bowling)

Score, overs, target and required rate, the striker (`Batting <name> 12 (9)`), the bowler's figures, the over so far.
All of it is the server's. During a ball the HUD shows the **old** score until the animation reaches the result
(`SCORE_UPDATE`); it never shows a wicket or a boundary before the bat has met the ball.

## Controls (panel)

1. Head: "<name> on strike · facing <bowler> · <speed> km/h" (speed after release) and, with the result, the engine's
   **feedback** chip: _Perfect/Good/Decent/Poor contact, Edged it, Missed it_ and the timing (_Perfect timing,
   Early, Late…_ or "timed for you" with Auto).
2. **Shot**: Defend, Drive, Leg side, Cut / back foot, Loft (radio group, keys 1–5, a dashed border marks the suggestion).
   Below it the chosen shot and, with assist, its hint.
3. **Direction**: Strong leg side … Strong off side.
4. **Choose the exact shot (advanced)**: all 12 shots in a select.
5. **Batting assist**: Off, Normal, High, Auto (disclosure; the current level is in its heading).
6. A timing cue (assist Normal/High), then **FACE NEXT BALL** / **SWING**.

The SWING button stays reachable on a phone in portrait (sticky at the bottom of the dock) and is at least 44 px tall.

## After the ball

Banner text in the live region (`FOUR`, `WICKET`, `WIDE`…) is always text, never only an animation. After your wicket the
dock turns into the simulate panel (**SIMULATE REST**); the batting controls disappear. When the match ends they are
gone and the result page shows **Your performance** (runs, balls, fours, sixes, strike rate, how you were out; and bowling figures).

## Simulation summary

After SIMULATE TO MY TURN / REST a notice says what happened, e.g. _Played 6 balls automatically: 9 runs, 1 wicket. You are on strike._
It reads two server states; it computes no cricket.

## Optional extras

- **First-ball tip** (brief 176): on a batter's very first ball of the match the head shows one line, _First ball:
  choose a shot, watch the ball, then swing when the bar is full._ It disappears with the first result. There is no
  separate tutorial match and nothing is stored.
- **Fast presentation** (brief 80): a checkbox that plays the part **after contact** (the ball's exit, the result and the
  reset) 2.2× faster; it is useful in 5-over matches. It never speeds up the approach, because the approach is the part being
  timed. It is a choice made on screen and is not stored; **Skip** still jumps to the end once the result is known (and
  never changes the score).
- **Sound** (brief 145–147): off by default, a checkbox turns it on (browsers require a gesture first). The cues are
  synthesised placeholders (`core/match-sound.ts`; no audio files exist yet): a clean, strong impact for Perfect, a solid
  one for Good/Okay, a dull one for Poor, a lighter glancing one for an Edge, a whoosh for a miss, the stumps, and a crowd
  for a boundary, a six or a wicket. **Sound follows the engine's result** (`cuesForResult` is a pure function of the
  contact quality and the outcome the server reported; it never detects anything in the scene). Tested.
- **Haptics** (brief 144): where the browser supports `navigator.vibrate`, a short pulse for a Perfect contact and a longer
  one for a wicket, never under reduced motion, never relied on.
