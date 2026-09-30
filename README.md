# The Cricketer — Module 0

Production-ready game design + data specification for the web-first cricket career RPG.

## Scope
This package intentionally contains **no frontend, Phaser scenes, networking, database migrations, or final gameplay rendering**. It defines the source-of-truth contracts future modules should consume.

## Structure
- `docs/game-design/00-game-vision.md` through `20-asset-requirements.md`
- `docs/game-design/MODULE-0-COMPLETION-REPORT.md`
- `packages/game-core/src/types/` — shared TypeScript contracts
- `packages/game-core/src/config/` — initial editable balance/configuration
- `packages/game-core/src/seed/` — shots, deliveries, teams, archetypes, items, events, achievements, contracts/sponsors

## Balance status
All numbers are **INITIAL BALANCE — SUBJECT TO PLAYTESTING**.

## Next module gate
Read `docs/game-design/MODULE-0-COMPLETION-REPORT.md`. It ends with `READY FOR MODULE 1: YES` and lists the exact Module 1 dependencies.
