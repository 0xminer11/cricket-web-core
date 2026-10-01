# Career progression UI

## Career path

`tierPath(current)` (game-core) returns the six real tiers with `completed | current | locked`. `TierPath` renders it as an ordered list with ● (completed/current) and ○ (locked) **plus** text for state ("(current)", "(completed)", "(locked)") so colour and shape are never the only cue. The path is data driven: a new tier needs no UI change.

## Reputation, selector interest, fans

- **Reputation**: shown as a number with a bar toward the **next tier's `minReputation`** (Module 0: club 80, district 200, domestic 380, franchise 620, international 820). The stored cap is 1000 (`LIMITS.reputationMax`); the UI never invents a different one. At the top tier there is no bar.
- **Selector interest**: 0-100 (`LIMITS.selectorInterestMax`) shown as a percentage with the line "Perform consistently to attract higher-level selectors." Nothing implies guaranteed promotion; the progression page adds "nothing is guaranteed".
- **Fans**: exact value kept; display compacts (`1,248`, `18.4K`, `1.5M`) with the exact figure in the hint once it is abbreviated.

## Level and XP

`xpProgress(level, currentXp)`: current XP toward `xpToNextLevel(level)` (Module 0 curve). At the level cap (50) the bar is full, the label reads **MAX LEVEL** and no next target is shown. `ProgressBar` clamps every input (never NaN, Infinity or a negative percentage) and exposes `aria-valuetext` like "420 / 1,300 XP".

## Form and fatigue

Form shows the number and band ("50 · Average", optional ↑ / ↓ / — only with history). Fatigue shows a percentage, a bar that turns amber then red (with a text label: Fresh / Tired / Exhausted) and, from the Module 0 soft warning, the sentence "Your fatigue is high. Consider recovery before intensive training." Fatigue never prevents play.

## Promotion

Module 6 **presents** progression. It does not evaluate or perform promotions; that belongs to the Career Engine module. Nothing here states hidden formulas: locked tiers show only the configured reputation requirement.

## `/career/progression`

Career path, reputation toward the next tier, selector interest, and a "Right now" line (level, form, fans).
