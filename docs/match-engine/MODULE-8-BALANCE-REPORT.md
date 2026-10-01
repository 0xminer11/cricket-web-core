# MODULE 8 BALANCE REPORT

Source: `pnpm simulate:balance`, `pnpm simulate:deliveries`, `pnpm simulate:matches` (raw numbers in `reports/module8-*.json`). Fixed seeds, Node 24.21.0. Targets are Module 0's (see [balancing.md](balancing.md)). No balance numbers were changed to produce this report.

## 10,000-ball distribution, equal players (55 across the board, pace bowler, Hard pitch)

| Outcome   | Measured | Module 0 target | Verdict |
| --------- | -------- | --------------- | ------- |
| Dot       | 32.2%    | 25–42%          | PASS    |
| Single    | 26.7%    | 22–34%          | PASS    |
| Two+Three | 10.3%    | 8–16%           | PASS    |
| Four      | 15.0%    | 10–18%          | PASS    |
| Six       | 5.8%     | 5–12%           | PASS    |
| Wicket    | 7.6%     | 4–9%            | PASS    |
| Extras    | 2.3%     | 2–7%            | PASS    |

Runs per ball 1.50. All six contact bands are reachable across the matchups below (no band is permanently unreachable); `perfect` and `miss` are rare for equal players and common only at the skill extremes, as intended.

## Match scores (1,000 matches each)

| Format | Average | Median | P10 | P90 | Avg wickets | Chase wins | Ties | Super overs | Target      | Verdict |
| ------ | ------- | ------ | --- | --- | ----------- | ---------- | ---- | ----------- | ----------- | ------- |
| 2-over | 19.1    | 19     | 11  | 28  | 0.80        | 49.3%      | 0    | 42          | 16–28 first | PASS    |
| 5-over | 47.4    | 47     | 34  | 61  | 2.13        | 52.0%      | 1    | 34          | 42–65 first | PASS    |

Chase success sits near 50%, so neither innings is structurally favoured.

## Skill matchups (10,000 balls each)

| Matchup (batter / bowler) | Runs per ball | Wicket % | Six % | Verdict          |
| ------------------------- | ------------- | -------- | ----- | ---------------- |
| Weak 30 / Strong 80       | 0.84          | 15.3     | 1.5   | PASS (direction) |
| Equal 55 / 55             | 1.50          | 7.6      | 5.8   | PASS             |
| Strong 80 / Weak 30       | 2.25          | 3.8      | 12.6  | PASS (direction) |
| Elite 90 / Elite 90       | 2.26          | 4.0      | 12.6  | NEEDS TUNING     |

Skill clearly matters and never wins every ball. **Finding:** elite vs elite scores as much as strong vs weak. Equal-rated players should look like the equal row, so the formulas respond to absolute batting level more than to the batter-vs-bowler gap. Not blocking for Module 9 (it only affects very high-skill matches, which Module 7 progression will not reach for a long time), but it must be tuned before the late career tiers. Fix by raising the weight of bowling skill in the contact score, which is a balance change (bump `GAME_BALANCE_VERSION`).

## Pitch comparison (pace and spin bowler, 10,000 balls each)

| Pitch | Bowler | Runs per ball | Wicket % | Mean seam | Mean spin |
| ----- | ------ | ------------- | -------- | --------- | --------- |
| Green | Pace   | 1.493         | 7.70     | 0.030     | 0         |
| Hard  | Pace   | 1.499         | 7.64     | 0.028     | 0         |
| Dry   | Pace   | 1.504         | 7.60     | 0.027     | 0         |
| Green | Spin   | 1.607         | 6.54     | 0         | 0.100     |
| Hard  | Spin   | 1.607         | 6.55     | 0         | 0.101     |
| Dry   | Spin   | 1.601         | 6.66     | 0         | 0.113     |

Direction is correct (Green has the most seam, Dry the most spin, Hard the most pace) and matches Module 0. **Finding: NEEDS TUNING.** The movement values change by 10–20% but the effect on runs and wickets is under 1%, so a player would not feel the pitch. This is within the brief's "do not create extreme arcade differences", but it is too subtle; raise how strongly seam/spin movement feeds the contact difficulty. Balance change, not a rules change.

## Shot risk and reward

| Scenario             | Runs per ball | Wicket % | Boundary % | Verdict |
| -------------------- | ------------- | -------- | ---------- | ------- |
| Cover drive, full    | 1.54          | 5.5      | 19.7       | PASS    |
| Cover drive, bouncer | 0.96          | 11.9     | 9.8        | PASS    |
| Pull, short          | 1.60          | 6.4      | 21.5       | PASS    |
| Pull, yorker         | 0.97          | 13.8     | 10.7       | PASS    |
| Defensive (equal)    | 0.42          | 2.3      | 0.1        | PASS    |
| Lofted (equal)       | 1.59          | 14.1     | 25.4       | PASS    |

Defence almost never reaches four or six and rarely loses a wicket; lofted shots roughly double the wicket rate for a modest scoring gain. Mismatched shots stay risky.

## Performance

| Run                     | Time     | Heap delta |
| ----------------------- | -------- | ---------- |
| 10,000 deliveries       | 34 ms    | 0.19 MB    |
| 1,000 two-over matches  | 990 ms   | 0.71 MB    |
| 1,000 five-over matches | 2,125 ms | 0.76 MB    |

Measured on the development machine; heap deltas were taken after a forced GC and show no leak.

## Summary

PASS: aggregate delivery distribution, 2-over and 5-over scores, shot matchups, defensive and lofted behaviour, determinism and performance.
NEEDS TUNING (non-blocking, balance-only): elite-vs-elite scoring level, and pitch effect strength.
