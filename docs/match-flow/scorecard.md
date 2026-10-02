# Scorecard

`GET /matches/:id/scorecard[?timeline=1]` builds the scorecard from the engine state, so it is correct for a match
in progress, at the break and when finished. `buildScorecard` (`apps/api/.../match-scorecard.ts`) is a pure function of
the engine snapshot.

## Contents (per innings)

- Batting rows in batting order: runs, balls, fours, sixes, strike rate, dismissal text, `isYou`, whether still batting.
- **DNB**: the players who have not batted.
- Extras with breakdown (wides, no-balls, byes, leg byes) and total.
- Bowling: overs, maidens, runs, wickets, economy, `isYou`.
- **Fall of wickets**: `wicket-score (batter, over)`.
- Total, wickets, overs.
- With `timeline=1`: ball-by-ball.

Match-level: toss text, result text, format, pitch.

## Rules the screen follows

- **Overs in cricket notation**: 8 legal balls is `1.2`, never `1.67`.
- **Dismissal text never invents a fielder.** The engine does not model fielders, so a caught dismissal reads
  `caught b Surname` (the bowler is known), bowled `b Surname`, lbw `lbw b Surname`, stumped `stumped b Surname`,
  hit wicket `hit wicket b Surname` and run out `run out`. No fielder name is fabricated.
- Rows are keyed by player id (names are unique per match anyway), so two players with similar names never merge.
- Totals equal the sum of the rows plus extras; a test asserts `total = Σ batter runs + extras` for every innings of
  a live and a finished match.

## Screens

The live overlay (during the match, pausing the presentation while open), the break, and `/match/:id/scorecard`
share one `ScorecardView`: an innings selector and three tabs (Batting, Bowling, Match summary) with proper
`tablist`/`tabpanel` roles, real `<table>` markup with captions and `scope`, and a horizontally scrolling panel on
narrow phones. Esc closes the overlay and focus returns to the match.
