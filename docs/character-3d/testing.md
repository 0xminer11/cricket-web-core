# Testing the 3D feature

## Commands

```bash
pnpm assets:validate        # file/contract/coverage/budget checks (fast, no browser)
pnpm test                   # unit tests (incl. tests/player/viewer.test.ts)
pnpm test:integration       # + database and API integration (needs docker compose up -d)
pnpm test:e2e               # Playwright (starts pnpm dev if nothing is running)
```

## Layers

| Layer     | File                             | Covers                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit (26) | `tests/player/viewer.test.ts`    | asset registry (valid, unknown, wrong kind, CDN prefix, retired fallback), `planCharacter`/`diffParts`/`resolveAttachment` (assembly, helmet hair rules, hidden parts, handedness mirror, unknown ids, determinism, no stat data in plans), shared appearance validation, `AssetCache` (shared in-flight load, hits, LRU, ref-count safety, byte budget, failed loads, trim), quality profile ordering |
| API (8)   | `tests/player/equipment.test.ts` | inventory/equipment listing, equip + base attributes unchanged, every refusal code, level requirement, concurrent equips, appearance edit/rejection, CSRF + CORS for PUT/PATCH, viewer telemetry, dev route absent in production                                                                                                                                                                       |
| Asset     | `scripts: assets:validate`       | skeleton, skins, morph targets, clips, scale/ground, budgets, manifest checksums                                                                                                                                                                                                                                                                                                                       |
| E2E (18)  | `e2e/player-3d.spec.ts`          | see below                                                                                                                                                                                                                                                                                                                                                                                              |

E2E scenarios: viewer reaches `ready` and controls work; left-hander bat attachment; no-cricketer and signed-out redirects; preview → cancel → preview → equip → refresh persists, base attributes unchanged; every slot tab; appearance edit persists and cancel discards; rapid item switching ends on the last choice with no page errors; base-model failure → portrait → Retry recovers; optional asset failure; corrupt GLB; WebGL unavailable; tampered equip request; no horizontal scroll at 320 and 390 px; touch action `pan-y`; 20 open/close cycles with flat geometry/texture/cache counts and bounded heap; render loop stops when hidden.

## How the browser tests render WebGL

Headless Chromium renders through SwiftShader, so the real viewer runs in CI-like environments. In non-production builds `window.__viewer` exposes the session (`attachedParts`, `stats`, `engineRunning`) for assertions. The sample-gear dev endpoint stands in for a shop; it is absent in production.

## Gotchas

- Playwright treats `aria-disabled` buttons as not clickable (an existing Module 4 note); use real `disabled` or always-enabled buttons in new UI.
- Clear leftover rate-limit keys if you see unexpected 429s: `redis-cli --scan --pattern 'cricketer:auth:rl:*' | xargs redis-cli del`.
- A stuck `next dev` can hang Playwright; stop old servers before running.
- `tests/auth/recovery.test.ts` (concurrent token use) was observed to fail once under full-suite load right after `docker compose up`, and passed on rerun and in isolation. Treat a first-run failure there as load sensitivity, but investigate if it repeats.

## What is not tested

Real-GPU frame rate and visual regression of the placeholder art (screenshots were reviewed manually during development). Add pixel-diff tests only when final art lands.
