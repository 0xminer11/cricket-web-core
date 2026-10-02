# Match flow state machine

`MatchFlowController` (client) walks the match through explicit states. The legal moves are one table,
`canFlowTransition`, in `packages/game-core/src/match-flow/flow-stages.ts`; a stale or duplicated event can never skip
a stage because an illegal move is ignored.

| State             | What the player sees                              | Server stage              |
| ----------------- | ------------------------------------------------- | ------------------------- |
| `PREPARATION`     | Preparation screen (before a match exists)        | none                      |
| `TEAM_SHEET`      | Both teams, batting order                         | `toss`                    |
| `TOSS`            | Coin; call or flip; result                        | `toss`                    |
| `TOSS_DECISION`   | Bat first / bowl first (only if you won the toss) | `toss_decision`           |
| `INNINGS_1_SETUP` | Scene loading                                     | `in_progress`             |
| `INNINGS_1`       | The live match                                    | `in_progress`             |
| `INNINGS_BREAK`   | Target, scorecard, start the chase                | `innings_break`           |
| `INNINGS_2_SETUP` | Scene reset for the chase                         | `in_progress`             |
| `INNINGS_2`       | The live chase                                    | `in_progress`             |
| `MATCH_COMPLETE`  | Brief hand-over to the result                     | `completed` / `abandoned` |
| `RESULTS`         | Result screen                                     | `completed`               |
| `EXITING`         | Save & Exit                                       | any                       |
| `RESUMING`        | Loading after a refresh / returning to the match  | any                       |

```
PREPARATION → TEAM_SHEET → TOSS → TOSS_DECISION → INNINGS_1_SETUP → INNINGS_1 → INNINGS_BREAK
        → INNINGS_2_SETUP → INNINGS_2 → MATCH_COMPLETE → RESULTS
                                  └─ tie → INNINGS_BREAK → (super over) → … → MATCH_COMPLETE
RESUMING → any of the above         anything → EXITING
```

An AI winner of the toss decides at once, so `TOSS` can lead directly to the first innings.

`MATCH_COMPLETE` hands over to the result route (`/match/:id/result`, a page of its own that reads the stored result and needs no
controller); `RESULTS` and `PREPARATION` are modelled so the table is complete and tested, but the two routes that show them are
plain pages: the preparation page before a match exists, the result page after it.

## Where the state comes from

`flowStateFor({ stage, inningsNumber, teamSheetSeen })` maps the **server's** persisted stage to a client state.
The only thing the browser adds is `teamSheetSeen` (whether this tab has looked at the sheets). After a refresh the
state is rebuilt from the server (`RESUMING`), so no route boolean or browser storage decides the stage.

## Control mode inside a live innings

`getControlMode` (`game-core`) maps the engine phase to who is in control: `HUMAN_BATTING` (`ready_to_bat`),
`HUMAN_BOWLING` (`ready_to_bowl`, `bowler_select`), `AI_SIMULATION` (the Cricketer is not involved: `simulate_required`),
`INNINGS_BREAK`, `MATCH_COMPLETE`. The HUD, the turn banner and the analytics events read it.
