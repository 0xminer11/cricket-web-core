# 05 — Match Rules

## MVP rules
- 6 legal balls per over.
- One innings per team for 2-over and 5-over formats.
- Strike changes after odd completed runs and at the end of each over.
- Innings ends at configured overs, configured wicket cap, or successful chase.
- Target = first-innings score + 1.
- Wides and no-balls add one extra and do not count as legal balls.
- Byes and leg byes are supported as score events but fielding/running is abstracted.
- Bowled, caught and LBW are MVP dismissal types; run-out/stumped/hit-wicket may be represented in schema and enabled later.
- Tie rule is format configuration. Initial 2-over/5-over use one Super Over; if implementation is deferred, unresolved ties may temporarily remain ties behind a feature flag.

## Format configuration
2-over: 2 overs, 5 wickets, one-over bowler cap, aggression modifier 1.12.  
5-over: 5 overs, 7 wickets, two-over bowler cap, aggression modifier 1.04.

The reduced wicket caps are an arcade-short-format choice, not a claim about formal cricket laws. Future T10/T20/ODI/Test-like definitions can use full wicket rules.
