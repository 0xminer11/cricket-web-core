# Batting: overview (Module 10)

Module 10 puts the player at the crease. When your Cricketer is on strike you read the ball the AI bowler
bowls, choose a shot and a direction, time the swing, and watch your Cricketer play it. Module 9 let you bowl; Module 8
is still the only thing that decides what happens.

**The one rule, unchanged:** Module 8 decides, Module 10 presents.

```text
tap / key / button  ->  shot + direction + timing error  ->  POST /matches/:id/shots
                                                         ->  Module 8 engine  ->  contact quality, runs, wicket
                    <-  result  <-  BatBallContactPresenter + ball path + HUD show it
```

The browser sends three numbers and a shot id. It cannot send, and the server refuses, a contact quality, a run, a
wicket or an exit speed. The batter's bat is never allowed to _decide_ contact by touching the ball: the engine
decides, and the animation is bent a small, capped amount so that what you see agrees with it.

## The feeling it is built for

> "I chose the right shot and timed it reasonably well, so my Cricketer helped complete the shot."

Not "I mashed a button and the game did it", and not "I did everything right and my bat went through the ball".
A good decision with so-so timing still makes contact (skill forgives a little); a terrible decision is not rescued
by perfect timing.

## What you can do

- Career Home -> Prepare match -> Team sheets -> Toss; your side bats first or second (the toss and its decision, Module 11: [toss](../match-flow/toss.md)).
- If you bat later in the order, press **SIMULATE TO MY TURN**; after your wicket, **SIMULATE REST** plays out the innings.
- On strike: **FACE NEXT BALL**, the AI bowler runs in and releases, you choose **Defend / Drive / Leg side / Cut or
  back foot / Loft**, lean it toward the leg or off side, and **SWING** (tap the pitch, press Space or the button).
- Optional: pick any of the 12 shots by hand (advanced), and a batting assist level Off / Normal / High / Auto.
- See PERFECT / GOOD / EARLY / LATE / EDGE / MISS feedback with the result, the score, the over, and your figures on
  the result page.

## Not in this module

Fielding, running between the wickets, multiplayer, commentary, DRS. A non-striker is not animated.

## Map of these docs

| Topic        | Pages                                                                                                                                                                                                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure    | [architecture](architecture.md), [batting-state-machine](batting-state-machine.md), [engine-integration](engine-integration.md), [server-authority](server-authority.md)                                                                                                                                              |
| Player       | [input-system](input-system.md), [shot-selection](shot-selection.md), [shot-direction](shot-direction.md), [timing-system](timing-system.md), [player-attributes](player-attributes.md), [shot-suitability](shot-suitability.md)                                                                                      |
| Animation    | [animation-system](animation-system.md), [animation-metadata](animation-metadata.md), [contact-assist](contact-assist.md), [hip-shoulder-adjustments](hip-shoulder-adjustments.md), [bat-contact](bat-contact.md), [ball-exit-trajectories](ball-exit-trajectories.md), [left-handed-support](left-handed-support.md) |
| Presentation | [camera](camera.md), [hud](hud.md), [accessibility](accessibility.md), [performance](performance.md)                                                                                                                                                                                                                  |
| Quality      | [testing](testing.md), [animation-asset-guide](animation-asset-guide.md)                                                                                                                                                                                                                                              |
