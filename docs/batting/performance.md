# Performance

Real values, measured on 2026-10-01 on the development Mac (Apple silicon, Node 24.21.0) against the **production
build** (`pnpm build`, `next start`) in **headless Chromium without a GPU** (software-rendered canvas). Numbers on a real
device with a GPU will be better; the shape (what costs what) is the useful part.

## Frame rate and frame stability (one whole delivery: run-up, flight, swing, result)

| Viewport                | Frames | p50 frame | p95     | p99     | max     | Frames > 33 ms | Average  |
| ----------------------- | ------ | --------- | ------- | ------- | ------- | -------------- | -------- |
| Phone landscape 844×390 | 465    | 16.7 ms   | 16.7 ms | 16.8 ms | 33.4 ms | 0              | 59.7 fps |
| Desktop 1280×720        | 349    | 33.2 ms   | 33.4 ms | 50 ms   | 83.3 ms | 40 (11 %)      | 38.5 fps |

The phone-sized canvas holds 60 fps with no dropped frame. The 1280×720 canvas runs at about 30 fps in this GPU-less
environment because drawing is software-rasterised (the cost scales with pixels); the logic is nowhere near the limit
(next section). DPR is capped by quality tier (`low` 1×, `medium` 1.5×, `high` 2×).

## What the code itself costs (Node, per call, micro-benchmark)

| Work                                                                          | Cost                            |
| ----------------------------------------------------------------------------- | ------------------------------- |
| `BattingPresentation.update + frame` (bowler, ball, swing, events), per frame | **11–18 µs** (budget 16,700 µs) |
| `presentContact` (the contact solver), once per ball                          | 64 µs                           |
| `selectShot`                                                                  | 0.1 µs                          |
| `commit` guard (a tap with no swing allowed)                                  | 0.1 µs                          |

## Input latency

The timing handler is lightweight on purpose: a tap on the canvas is a Phaser pointer event; the scene reads the
presentation clock and calls the controller directly. **No React render happens between the pointer event and the
recorded timing.** In the production run the browser's Event Timing API reported, for the swing's `pointerdown` /
`keydown`, a **handler time of 0.4 ms / 2–3 ms** (the keydown handler includes starting the request); the input
_delay_ (7.5 ms on the phone viewport, ~22 ms on the busy 1280×720 software canvas) is the main thread being in the
middle of a frame, not our code. Events faster than 16 ms are below the API's reporting floor. In development
`window.__cricketerMatch.swingLatencyMs()` returns the time from the scene event to the recorded swing.

## Request latency (local API and database, 74 balls)

| Request                       | p50     | p95     | max     |
| ----------------------------- | ------- | ------- | ------- |
| `POST /matches/:id/next-ball` | 11.5 ms | 16.5 ms | 18.6 ms |
| `POST /matches/:id/shots`     | 23.7 ms | 49.6 ms | 54.8 ms |

Reproduce with `node infrastructure/scripts/measure-batting-api.mjs --balls=80` against a running dev API.

The swing starts _before_ the request is sent and its contact frame is about 0.4 s later, so the answer arrives with a
margin of roughly 0.35 s; the tail (p95 50 ms) is far inside it. See [server-authority](server-authority.md#presentation-pipeline-single-player-and-request-latency).

## Bundle and assets

| Item                                                           | Size                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| Phaser chunk (lazy, loaded only on a match page)               | 326 KB gzip (1,225 KB raw)                                   |
| `/match/:id` JS on first load, including Phaser                | 600 KB encoded                                               |
| `/match/:id` JS before the scene loads (everything but Phaser) | ~274 KB                                                      |
| Art assets                                                     | **0 bytes**: every batting asset is a procedural placeholder |
| Scene ready after navigation (production, local)               | 0.64–1.0 s                                                   |

Phaser is imported only through a dynamic `import()` from `match-view.tsx`; no other route loads it.

## How to measure again

1. `pnpm build`, then `pnpm --filter @the-cricketer/api start` and `pnpm --filter @the-cricketer/web start`.
2. Frame times: a `requestAnimationFrame` loop recorded during one delivery (Playwright), plus the Event Timing API
   (`PerformanceObserver({ type: 'event', durationThreshold: 16 })`) for input.
3. Micro-benchmarks: time `presentContact` and `BattingPresentation.update/frame` in a loop under vitest.
4. `?debug=1` (development only) shows `fps`, the contact plan and the ball-to-bat distance on the canvas.
