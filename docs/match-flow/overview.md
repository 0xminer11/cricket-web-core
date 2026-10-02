# Match flow: overview (Module 11)

Module 11 turns the separate pieces built before it (the engine of Module 8, human bowling of Module 9, human batting
of Module 10) into one complete, playable match:

```
Career Home → Match preparation → Team sheets → Toss → (toss decision)
  → First innings → Innings break (target) → Second innings (the chase)
  → Match complete → Result screen → Scorecard → Career Home
```

It works for both launch formats (2 over and 5 over), when the player's side bats first or bowls first, wins or loses
the toss, wins, loses or ties.

## What it adds

| Area            | What                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Pre-match       | Preparation screen, team sheets for both sides, a seeded toss with the player's call and bat/bowl choice    |
| Live match      | A flow controller on the client, control modes, SIMULATE UNTIL MY TURN at three speeds, turn banners        |
| Between balls   | Over summary card, innings break with the target, live scorecard (batting, bowling, summary)                |
| After the match | `MatchCompletionService`: stats, rating, form, fatigue, fans, reputation, XP, coins, level-up, achievements |
| Presentation    | Result screen (outcome, scores, your performance, rewards), full scorecard route                            |
| Safety          | Everything idempotent; Save & Exit, resume and refresh at every stage; multi-tab safe                       |

## What it deliberately does not do

It does not change the engine, the batting or bowling rules, or the balance (`MATCH_ENGINE_VERSION` is unchanged). It
does not add fielding, PvP, a season engine, voice commentary or a replay viewer. Those are later modules.

## Where things live

- Pure rules: `packages/game-core/src/match-flow` (toss, control mode, flow stages) and
  `packages/game-core/src/match-progression` (rewards, stat deltas, form, fatigue).
- Server: `apps/api/src/modules/matches` (`match-flow.service.ts`, `match-completion.service.ts`,
  `match-scorecard.ts`, `match-play.service.ts`).
- Persistence: `match_engine_sessions.flow` and the `match_career_results` table (migration `0008_match_flow`).
- Client: `apps/web/src/features/match-flow` (flow controller, screens) around `apps/web/src/features/match`
  (gameplay controller, Phaser scene).

Pages: [architecture](architecture.md) · [state machine](match-flow-state-machine.md) ·
[preparation](match-preparation.md) · [team sheets](team-sheets.md) · [toss](toss.md) ·
[human control](human-control.md) · [AI simulation](ai-simulation.md) · [innings transitions](innings-transitions.md) ·
[scorecard](scorecard.md) · [over summary](over-summary.md) · [match completion](match-completion.md) ·
[player stat updates](player-stat-updates.md) · [rewards](match-rewards.md) ·
[career progression](career-progression-effects.md) · [resume](resume.md) · [idempotency](idempotency.md) ·
[result screen](result-screen.md) · [security](security.md) · [performance](performance.md) · [testing](testing.md)
