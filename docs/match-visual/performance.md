# Performance

All numbers below were measured in this project's development environment (software-rendered headless Chromium on a
laptop, Next dev server, local PostgreSQL). Treat them as indicative, not as device guarantees.

| Metric                                                           | Result                                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Scene frame rate (headless, software GL)                         | 55-61 fps during a delivery                                                                                |
| `POST /deliveries`                                               | p50 20 ms, p95 44 ms (14 balls); response 4.1 KB                                                           |
| `GET /matches/:id`                                               | p50 7 ms, p95 29 ms                                                                                        |
| `planTrajectory`                                                 | 0.8 microseconds per plan; sampling a position 0.08 microseconds                                           |
| Initial JS (gzip, production build)                              | `/career` 277 KB, `/training` 278 KB, `/match/preparation` 280 KB, `/match/:id` 294 KB, result page 274 KB |
| Phaser chunk (loaded on demand only on the match and lab routes) | 321 KB gzip / 1.2 MB raw                                                                                   |

The previous `/career` figure (Module 7) was 274 KB; the +3 KB is the Start button and the match API client that the
preparation screen now needs. Phaser does not appear in any other route's initial JavaScript (asserted by a
hygiene test and visible in the table).

## Budgets and quality tiers

Quality comes from the Module 5 detector (`low`/`medium`/`high`, `?quality=` in development): low renders at 1x with no
ball trail and a simplified crowd, medium at up to 1.5x, high at up to 2x. Reduced motion removes the trail and holds
the camera. The scene draws about 150-300 primitives a frame; there are no image assets to download.

## Not measured

No device lab was available, so real phone frame rates, thermal behaviour and low-end Android results are unknown.
The 30 fps floor for low-end devices is a target, not a measurement.
