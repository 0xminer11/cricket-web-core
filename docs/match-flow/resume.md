# Save & Exit, resume and refresh

There is no save button because **every ball is saved when it is played** (one transaction per ball). The menu's
**Save & exit** therefore only leaves the screen; there is deliberately no "quit match" that forfeits.

## Resuming

- Career Home's Next Match card and the preparation screen show **RESUME MATCH** while a match exists for the fixture.
- Opening `/match/:id` calls `GET /matches/:id/flow` and rebuilds the stage from the server:

| Server stage    | Screen after a refresh                                   |
| --------------- | -------------------------------------------------------- |
| `toss`          | Team sheets (then the toss, with no result yet)          |
| `toss_decision` | Bat / bowl choice (you won the toss; the result is kept) |
| `in_progress`   | The live match at the exact ball                         |
| `innings_break` | The break with the target                                |
| `completed`     | Redirect to `/match/:id/result`                          |

- A refresh in the middle of a ball (after the request, before the animation finished) shows the next state; the
  ball is never replayed or double counted because `next-ball` and delivery requests are deterministic from the seed
  and sequence, and each action carries `actionId` + `expectedSequence`.
- A refresh during a simulation reveal shows the final state.
- A refresh on the result screen shows the stored numbers (they were not recomputed).

## Two tabs

The server is the only authority, so two tabs cannot corrupt a match: the second tab's action is rejected with
`STALE_SEQUENCE` (409) and its controller re-syncs to the current state with a short notice. A toss made in one tab
shows as already made in the other. A completed match cannot be played further in any tab.

## No browser storage for game state

The web app never touches browser storage (a repo-wide rule enforced by `tests/auth-client.test.ts`). The comfort settings
(sound, quality, reduced motion, assist defaults, simulation speed) live in memory in
`features/match-flow/state/settings.ts`: they survive moving between the match, result and career within a visit and reset
to the defaults on a reload. They are never read as game state, so a reload cannot change a match.
