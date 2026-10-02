# Result screen

`/match/:id/result` is built from `GET /matches/:id/result` (`MatchResultDto`), which reads the stored summary.

## Layout

1. **Outcome** (VICTORY / DEFEAT / TIE), the result text (`result-text`), the innings scores with overs, a Super Over
   note when it applies, and the Player of the Match when one is awarded (never automatically the player).
2. **Your performance** (`your-performance`): batting (runs, balls, fours, sixes, strike rate, how out / not out),
   bowling (overs-maidens-runs-wickets, economy), match rating, milestones ("Career-best score", "Half-century",
   "3-wicket haul"). A player who did not bat or bowl sees a plain sentence instead of empty numbers.
3. **Rewards** (`rewards`): XP, coins, fans, reputation; **LEVEL UP** with before → after; level, XP to next level,
   form before → after with its label, fatigue added and now; a collapsible "how these were worked out";
   achievements unlocked.
4. Actions: **CONTINUE** (Career Home), **VIEW SCORECARD** (`/match/:id/scorecard`), Training.

If the career effects are still being applied (`processed: false`) the rewards panel says so and a refresh shows them.
If the match is not finished, the page offers **Resume match** instead of a result.

## Behaviour

- The Phaser scene is destroyed when leaving the match page (the match view unmounts and calls `game.destroy()`), so the
  result screen runs without a canvas or a running game loop.
- Opening a finished match's live URL redirects to its result.
- Colour is never the only carrier of the outcome: the word is shown, with a coloured border as reinforcement.
- Works on a phone: the reward grid becomes two columns; buttons are at least 44 px high.
- Analytics: `match_result_viewed` (outcome), `scorecard_viewed`.
