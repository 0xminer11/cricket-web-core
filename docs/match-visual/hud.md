# HUD

Two layers. The DOM HUD is screen-space and independent of the camera; the Phaser overlay only flashes the result.

## DOM HUD (`ScoreHud`)

- team batting, score `24/1`, overs in cricket notation (`1.3`, never `1.5`), `/ N` overs,
- chase line `Need 12 from 9 · RRR 8.00` when there is a target, otherwise the run rate,
- previous innings scores,
- batter: name, runs, balls; bowler: name, overs-maidens-runs-wickets and style,
- this over as ball chips (`•`, `1`, `4`, `W`, `Wd`, `Nb+2`, `B1`, `Lb1`) with a text label for each, the wicket chip
  outlined,
- after each ball: speed (km/h), variation and where it pitched; at the end of an over "Over N complete 1 · • · 4 · W",
- a persistent result line and an `aria-live="polite"` region with a full sentence ("WICKET. Bowled - Cover Drive, a
  miss. Dismissal: Bowled. 0 runs added.").

Every number comes from the authoritative `MatchPlayStateDto`; nothing is computed in the browser. The HUD shows the
`display` state, which catches up at the `SCORE_UPDATE` presentation moment.

## Layout

Desktop and landscape tablets: the stage on the left and a controls panel on the right with a **sticky BOWL button**.
Phone landscape: the same two columns with a compact bar. Phone portrait: the stage above the controls, with a
sticky BOWL. The global header, nav and footer are hidden while a match is on screen; `← Career` leaves the match
(progress is saved). Touch targets are at least 44 px (asserted for the phone landscape layout).
