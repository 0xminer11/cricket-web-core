# Match feature (Modules 9, 10 and 11)

The visual match: Phaser scene, bowling input, batting input, ball flight and HUD (batting: Module 10, see [docs/batting](../../../../../docs/batting/overview.md)). See [docs/match-visual](../../../../../docs/match-visual/overview.md).

- `core/` is pure TypeScript (no Phaser, no DOM) and holds all logic that can be unit tested.
- `phaser/` is a thin rendering layer, imported only through a dynamic `import()` from `components/match-view.tsx`, never from the root layout or any other route.
- The server (Module 8 engine) decides every result; this feature only sends intent and presents the response. No match state is stored in the browser.
- Every art asset is a TEMPORARY PLACEHOLDER drawn procedurally; see [the asset guide](../../../../../docs/match-visual/asset-guide.md).

- Batting (Module 10) lives in `core/batting-*.ts`, `core/contact-assist.ts`, `core/ball-path.ts`, `config/batting-animations.ts` and `components/batting-panel.tsx`. The browser sends a shot, a direction and a timing error; it never sends or computes a result. `/dev/batting` is the development lab (404 in production).

- Module 11 wraps this feature: `/match/[matchId]` is `features/match-flow/components/match-flow-page.tsx`, which shows the team sheets, toss and toss decision (driven by `MatchFlowController`) and then this feature's `MatchView`. `MatchView` adds the scorecard overlay, over summary, innings break (target), simulation panel with Normal/Fast/Instant speeds, turn banners, pause menu with Save & exit and the comfort settings (kept in memory for the visit: the web app never touches browser storage). The result and scorecard pages are in `features/match-flow`. See [docs/match-flow](../../../../../docs/match-flow/overview.md).
