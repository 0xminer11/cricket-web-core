# 15 — Progression, Overall, Fitness and Objectives

## Player level
Initial cap: **50**. Level is a broad career/progression indicator and unlock gate; it is not the source of cricket strength.

`xpToNextLevel(level) = round(120 × level^1.45 + 80)`

Sample XP to next: L1 200, L2 408, L5 1,318, L10 3,462, L20 9,320, L30 16,714, L40 25,325, L50 34,969 (L50 is cap; value shown for curve inspection only).

Sources: match participation/performance, wins, milestones, training, achievements and events. Anti-farm multipliers reduce repeated low-risk opponent loops, impossible completion-time patterns and duplicated reward submissions.

## Individual skill progression
Skills have their own Skill XP. Training and relevant match actions award targeted Skill XP. On threshold crossing, that stat increases by one. Skill cap is 100. High stats require more XP through the quadratic skill curve in `player.config.ts`.

## Overall ratings
Overall is display/selection support, not a hidden gameplay input.

**Batting Overall:** weighted mean of Timing 18%, Technique 16%, Shot Selection 15%, Placement 14%, Footwork 12%, Defence 10%, Power 8%, Consistency 7%.

**Bowling Overall:** first select weights by bowling style. Example fast: Pace 30%, Accuracy 20%, Seam 14%, Swing 10%, Control 12%, Variation 8%, Consistency 6%, Spin 0%. Spin styles shift weight to Spin/Control/Variation.

**Physical Overall:** Stamina 22%, Fitness 20%, Reflex 17%, Agility 16%, Strength 14%, Recovery 11%.

**Player Overall:** role-specific weighted average defined in `ROLE_WEIGHTS`. It may draw directly from underlying stats rather than averaging the three sub-overalls. This prevents a specialist bowler from being penalized for low batting Power.

## Fitness and fatigue
Fitness = stable physical capacity stat (1–100). Fatigue = temporary state (0–100).

Suggested fatigue penalty multiplier:
- 0–49: 1.00
- 50–64: linearly 1.00→0.98
- 65–79: 0.98→0.94
- 80–94: 0.94→0.90
- 95–100: 0.88 and training blocked

Stamina reduces match/training fatigue gain; Recovery improves fatigue reduction after rest/match cycle. No real-time energy gate is required.

## Daily/weekly objectives
Optional examples: score 30 runs, hit 3 fours, win one match, complete one training session. Reward only modest Coins/XP/cosmetic progress. Objectives may never gate career tier promotion.
