# Scorecards and performance

Batters: runs, balls faced (no-balls included, wides excluded), fours, sixes and dismissal. Bowlers: legal balls, charged runs, charged extras, wickets, dots and maidens. Byes/leg-byes do not spoil a bowler's maiden. Rates are derived, not authoritative stored scores.

`legalBallsToOvers`, `strikeRate`, `economyRate`, `currentRunRate`, `requiredRate` and `formatScore` are renderer-free. Required rate is null when a positive target remains with no balls; never Infinity. Other zero-denominator rates return zero.

`playerPerformances` blends batting contribution, bounded rate, survival, bowling wickets/economy/dots, involvement and result. Rating is 0–10, rounded to one decimal. Super Overs do not inflate regulation individual ratings. Unused participants receive zero, not invented contributions. `matchSummary` combines scorecards, rates, result and performance. No XP, currency, career stats or other rewards are mutated here.
