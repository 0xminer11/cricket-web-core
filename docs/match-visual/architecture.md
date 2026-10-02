# Architecture

```text
apps/web/src/features/match/
├── api/            match-client.ts (the only module that talks to the match API)
├── config/         visual-config.ts (every presentation constant), palette.ts
├── core/           pure TypeScript: no Phaser, no DOM, fully unit tested
│   ├── coordinates.ts          normalized target <-> metres <-> screen (and the inverse)
│   ├── pitch-target-controller.ts, bowling-input-controller.ts, timing-meter.ts
│   ├── bowling-state-machine.ts
│   ├── bowling-animation.ts    rigs, clips, release marker, BowlingAnimator
│   ├── batter-animation.ts     shot -> clip, contact presentation, batter rig
│   ├── trajectory.ts           BallTrajectory planner
│   ├── camera-controller.ts    MatchCameraController + framing check
│   ├── visual-events.ts        event queue, schedule, result banner
│   ├── gameplay-controller.ts  MatchGameplayController (orchestrator)
│   ├── scene-port.ts           the contract between controller and scene
│   └── assets.ts               match asset registry and fallbacks
├── phaser/         thin rendering layer (loaded lazily)
│   ├── game.ts                 createMatchGame, resize, visibility, cleanup
│   ├── render.ts, zones.ts     drawing helpers
│   └── scenes/                 boot, preload, match (world), match-ui (overlay)
├── components/     React: match view, HUD, delivery panel, meter, phase panels, result, lab
└── hooks/
```

## Layers

1. **Server authority**: `MatchPlayService` runs the Module 8 engine, persists every ball, and returns a
   presentation-ready DTO (`DeliveryResultDto`).
2. **Controller** (`MatchGameplayController`): loads the authoritative state, collects intent, sends it, sequences the
   presentation and keeps three kinds of state apart:
   - `authoritative`: what the server decided (may be ahead of the screen while a ball plays out),
   - `display` (presentation): what the HUD currently shows; catches up at the `SCORE_UPDATE` moment,
   - `input`: what the player is choosing right now.
3. **Scene** (Phaser): draws the world and reports milestones back through `ScenePort` events.
4. **DOM**: HUD, delivery cards, presets, meter, bowler selection, banners and the live region. The canvas is
   `aria-hidden`; everything a player needs also exists as real DOM.

The controller talks to the scene through the `ScenePort` interface, so the same controller runs against a fake scene
in unit tests and against Phaser in the browser. There is no global mutable match state: a controller is created per
match view and destroyed (and re-activated, for React StrictMode) with it.

## Dependency rules

The web app depends only on `shared-types`, `game-core`, `config` and `ui` (enforced by `pnpm lint`). It cannot import
the engine or the database. Cricket geometry (line/length classification, labels, speed conversion) lives in
`game-core/src/match-geometry.ts` so the engine and the screen classify a target identically. Phaser is imported
only under `phaser/` and only through a dynamic `import()` from `match-view.tsx`, so no other route downloads it.
