# Human control

The career player controls **their own Cricketer**, and mainly that. The rest is played by the AI so a match is not
a wall of waiting. Control mode comes from `getControlMode(phase)`.

| Mode             | When                                                                         | What the player does                |
| ---------------- | ---------------------------------------------------------------------------- | ----------------------------------- |
| `HUMAN_BATTING`  | Your Cricketer is on strike (`ready_to_bat`)                                 | Module 10 batting controls          |
| `HUMAN_BOWLING`  | You are the bowler, or choosing who bowls (`ready_to_bowl`, `bowler_select`) | Module 9 bowling controls           |
| `AI_SIMULATION`  | Your Cricketer is not involved (`simulate_required`)                         | SIMULATE UNTIL MY TURN, speed       |
| `INNINGS_BREAK`  | Between innings                                                              | Look at the target, start the chase |
| `MATCH_COMPLETE` | Match over                                                                   | Go to the result                    |

## Batting side

If your Cricketer is not on strike (a finisher at number 6, or at the non-striker's end) the screen shows the
simulate panel. SIMULATE UNTIL MY TURN plays balls until your Cricketer is on strike (the server stops there, never
past it). After your dismissal the panel says **You are out** and offers SIMULATE REST, with your innings figures
("YOUR INNINGS 32 (14)") read from the scorecard.

## Bowling side

At the start of each over the choice is yours: bowl it yourself (Module 9) when your Cricketer is eligible, or
**Simulate this over**, where an AI teammate bowls it. SIMULATE UNTIL MY TURN stops at the next over start your
Cricketer is eligible for (or mid-over if you are the bowler); overs you cannot bowl (just bowled, spell used up,
not a bowler) are bowled by a teammate the engine chooses. A pure batter is never made to bowl.

A banner announces the turn: **YOU'RE ON STRIKE**, **YOUR OVER**, or that you are at the non-striker's end. It is
announced politely to screen readers and never animates.

The server enforces everything the UI offers: a shot is only accepted for the batter your Cricketer is, a delivery only
from a bowler who is eligible, and each action carries `expectedSequence` so a stale tab cannot play a ball twice.
