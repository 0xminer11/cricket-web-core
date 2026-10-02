# Player stat updates

`deriveStatsDelta(figures, won)` (`game-core/src/match-progression/player-match-stats.ts`) is a pure function from the
player's match figures to a delta:

| Group   | Fields                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------- |
| Matches | matches played, matches won                                                                        |
| Batting | innings batted, runs, balls faced, fours, sixes, highest score, not-outs, ducks, fifties, hundreds |
| Bowling | innings bowled, legal balls, runs conceded, wickets, maidens, best bowling                         |

`PlayerStatsDelta` is applied with `repos.players.applyStatsDelta` in the completion transaction. Rules:

- A player who did not bat gets no batting innings; one who did not bowl gets no bowling innings.
- Highest score and best bowling compare the new figures with the stored ones (`isBetterBowling`: more wickets, then
  fewer runs).
- Career averages shown on Career Home are derived at read time from these counters (null, never NaN, when there are no
  dismissals or balls).
- Stats apply exactly once per match (see [idempotency](idempotency.md)); the result screen shows the stats after the
  update, from the stored summary.
