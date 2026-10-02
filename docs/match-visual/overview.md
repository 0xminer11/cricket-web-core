# Match visual: overview (Module 9)

Module 9 is the first visual cricket gameplay. You open a scheduled match, aim a delivery on the pitch, time the
execution, watch the bowler run in and release, watch the ball follow the engine's flight, see the AI batter
respond and read the result on the HUD.

**The one rule:** Module 8 decides, Module 9 presents.

```text
player input -> Bowling UI -> DeliveryIntent -> Module 8 engine -> ResolvedDelivery + BallResult
             -> visualizer (animation, ball flight, HUD)
```

The visual layer never decides a run, a wicket, an extra, a contact quality or where the ball pitches. A ball that
visually hits the stumps does not bowl anybody; the engine said "bowled" and the scene draws the ball reaching the
stumps. The browser is also unable to claim a result: the request schema is strict and carries intent only.

## What you can do

- Career Home -> Prepare match -> **Start match** -> `/match/:matchId`.
- Choose a bowler for each over (the rules from Module 8: no consecutive overs, over caps).
- Choose a delivery your bowler's style allows (outswing, inswing, slower ball, cutter, bouncer, yorker; stock/arm
  ball/googly/top spinner for spinners).
- Aim at an exact point on the pitch (drag the marker, tap the line and length presets, or use the arrow buttons).
- Press BOWL when the execution cursor is inside the highlighted window (or switch on assisted timing).
- Watch the run-up, release, flight, bounce and the AI batter's shot; read the result as text.
- Finish the over, the innings and the match; open `/match/:matchId/result` for the scorecard.

## What is deliberately not here

Fielders, catches, run animations, umpires, DRS, commentary, multiplayer. They belong to later modules. Human batting is
Module 10 (see [../batting/overview.md](../batting/overview.md)): when your Cricketer is on strike you bat; the rest of
your innings can still be played for you (SIMULATE TO MY TURN / SIMULATE REST).

## Map of these docs

| Topic                | Page                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layers and data flow | [architecture](architecture.md), [engine-integration](engine-integration.md), [network-authority](network-authority.md), [resync](resync.md)                   |
| Phaser               | [phaser-scenes](phaser-scenes.md), [camera](camera.md), [hud](hud.md), [pitch-visuals](pitch-visuals.md)                                                       |
| Input                | [bowling-input](bowling-input.md), [pitch-targeting](pitch-targeting.md), [coordinate-system](coordinate-system.md)                                            |
| Animation and flight | [bowling-animations](bowling-animations.md), [release-events](release-events.md), [ball-trajectory](ball-trajectory.md), [swing-seam-spin](swing-seam-spin.md) |
| Quality              | [performance](performance.md), [accessibility](accessibility.md), [testing](testing.md)                                                                        |
| Assets               | [asset-guide](asset-guide.md)                                                                                                                                  |
