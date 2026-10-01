# Responsive design

## Breakpoints

- **< 48rem (phones)**: single-column prioritised feed, fixed bottom navigation with five labelled items (safe-area aware), page padding reserved for the bar.
- **48rem+**: top navigation bar.
- **60rem+**: two columns (main + side). Content width is capped at the project's 72rem, so wide monitors do not stretch the layout (tested at 1920 px).

## Mobile feed order

Each card sits in a `Slot` with an explicit `order`; on phones the two desktop columns dissolve (`display: contents`) and the feed reads: header, intro, **next match**, primary actions, currencies, career/progression, event, objectives, upcoming, stats, recent, contract, personality. On desktop each column keeps the same relative order. No shop promotion exists above the next match.

## Robustness

- Names wrap (`overflow-wrap: anywhere`); team names wrap inside a three-part `A VS B` row; currency chips wrap; big numbers compact (`987.6M`).
- Verified at 320, 360, 390, 1280 and 1920 px with no horizontal scroll, including extreme data (level cap, 1.5M fans, 987M coins, bowler stats, pending event, very long names).
- Touch targets are at least 2.5-3.5 rem tall (nav items, buttons, links in cards).
- Skeletons mirror the real layout; nothing flashes "0 Coins" or "Level 0" before data arrives.

## Motion

Skeleton shimmer and progress transitions run only under `prefers-reduced-motion: no-preference`; with reduced motion bars render at their value immediately. No animated counters.

## Look and feel

Dark sports-game styling from the existing tokens: gradient hero for the player, a green "pitch" gradient for the next match, bold uppercase section labels, chips for OVR/LVL. No developer labels: tier ids, `player_state.form` and similar never appear (copy such as "Academy", "Form 50 · Average").
