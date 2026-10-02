# Innings transitions

## The innings break

When the first innings ends the engine status is `innings_break` and the screen shows:

- the team that batted and its score and overs,
- **Target N** (runs scored + 1),
- "{chasing team} need N from M balls to win",
- **VIEW SCORECARD** (the live scorecard overlay) and **START THE CHASE**.

Starting the chase calls `POST /advance` (idempotent: `startNextInnings` is only valid at the break), which swaps the
sides, resets the scene and shows the chase HUD (need X from Y balls, required rate).

## Ending the chase

The second innings ends on: target reached, all out, overs finished. The result text is the engine's
("won by 4 wickets", "won by 12 runs"). The margin is derived by the engine, never by the browser.

## A tie

If the format's tie rule is a Super Over and the chase finishes level, the match goes to another break labelled
**SCORES LEVEL**, then a Super Over (one over, two wickets), where the original chasing side bats first. If the Super Over
is also level the match is recorded as a tie. A tie pays the tie multiplier (see [rewards](match-rewards.md)) and is a
`tie` outcome in the stored result; it is never shown as a win or loss.

## Edge cases covered

Final-ball win, last-wicket win, defended total, all-out in the first innings, wides and no-balls in the last over,
and an innings that ends on the first ball of an over (no empty over summary is shown for a finished match).
