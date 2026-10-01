# Overs and bowling selection

Six legal deliveries per over comes from `ballsPerOver`. Wides/no-balls are delivery events but do not consume legal balls. Sequences are independent of displayed overs. Domain and database over numbers are one-based; innings delivery sequence is one-based and includes extras. Global sequence spans the whole match.

Bowling order lists eligible participants. `eligibleBowlers()` filters the previous over's bowler and the configured cap. Caller/AI selects before the next ball. Two-over cap is one; five-over cap is two. Caps reset for the Super Over innings.

On an odd completed run swap batters; at over completion swap again. A one on the sixth legal ball therefore leaves the original striker facing next over. Wicket replacement happens before the over-end swap. An unfinished final over is closed in persistence when its innings ends; it is not a completed maiden.
