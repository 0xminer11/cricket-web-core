# Objectives

Module 0 has **no daily/rotating objective system**, only achievements (`ACHIEVEMENTS`, five today) with a metric, a target and a reward, plus per-player rows in `player_achievements` (progress, completed, reward claimed). Module 6 therefore presents objectives as **real, persisted progress toward those definitions**:

- every Module 0 achievement is an objective; a missing row means progress 0, not completed;
- progress is clamped to the target; completed objectives show full progress;
- the hub shows up to three active objectives ordered by closeness to completion (stable tie-break by id) and "Achievements n / total";
- `/career/objectives` lists active and completed objectives with rewards (coins, XP, fans, reputation) and "Reward collected" for claimed ones.

Nothing rotates, nothing is claimed here, and no progress is fabricated. Until the match engine writes progress, the bars stay at zero, which is the truth.

## Not built (deliberately)

Reward claiming, daily/weekly rotation and sponsor objectives belong to the progression and sponsor modules. The DTO already carries `reward` and `rewardClaimed`, so those modules only need to write the data.
