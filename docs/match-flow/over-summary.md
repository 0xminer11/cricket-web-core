# Over summary

After the last legal ball of an over the server returns an `overSummary` with the delivery result:

- over number and the score,
- the over ball by ball (`•`, `1`, `4`, `W`, `Wd`, `Nb`, …),
- the bowler's figures after the over,
- who is in (striker and non-striker),
- the chase line when chasing ("Need 14 from 12").

`MatchPlayService` builds it (`overSummaryFor`) from the same persisted balls the scorecard uses, so the two cannot
disagree. It is `null` for a ball that does not end an over and **never** for a finished match (the result takes over).

The card sits in the dock, does not cover the pitch, is dismissed by **Continue**, **Space/Enter**, or simply by the
next action, and is hidden while a ball is in play. The simulation feed shows over boundaries inline rather than
stacking cards.

Wides and no-balls do not end an over, so a long over (extras) shows more than six labels and still ends once.
