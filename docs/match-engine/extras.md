# Extras

Wide: one extra, no legal ball, no batter ball faced, no strike rotation. No-ball takes precedence over wide: one penalty plus possible bat runs, no legal ball, but counts as a batter ball faced. All three MVP dismissals are suppressed on a no-ball.

Byes and leg-byes are abstract single-run events on missed legal deliveries. They rotate strike and count as a ball faced but score no bat runs and concede no bowler runs. No-ball+byes and multi-run wides are deferred; one ExtraType matches the existing normalized schema.

Free hits are not specified by Module 0 and are deferred. There is no deliberate front-foot input. No-ball chance is execution-dependent. Wide classification comes from the actual normalized target.
