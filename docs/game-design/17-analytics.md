# 17 — Analytics Event Model

Do not collect unnecessary sensitive personal data. Use internal player/session/match IDs and coarse technical metadata.

## Core events
| Event | Required properties |
|---|---|
| `player_created` | playerId, battingHand, primaryRole, gameBalanceVersion |
| `career_started` | playerId, startingTier, starterArchetype |
| `training_started` | playerId, trainingId, fatigueBefore, coinCost |
| `training_completed` | trainingId, grants, fatigueAfter, skillPointsGained |
| `match_started` | matchId, formatId, pitchId, careerTier, opponentTeamId, versions |
| `ball_completed` | matchId, innings, over, legalBall, deliveryId, line, length, shotId?, contactQuality?, runs, extras, wicket |
| `match_completed` | matchId, result, score, opponentScore, performanceRating, durationSec, versions |
| `reward_granted` | sourceType, sourceId, coins, playerXp, reputation, fans |
| `item_equipped` | itemId, slot, upgradeLevel |
| `item_purchased` | itemId, currency, price, balanceAfter |
| `item_upgraded` | itemId, fromLevel, toLevel, coinCost |
| `career_promoted` | fromTier, toTier, reputation, selectorInterest |
| `contract_signed` | contractId, teamId, tier, expectedRole |
| `career_event_choice` | eventId, choiceId, tier |
| `achievement_unlocked` | achievementId |
| `objective_completed` | objectiveId, cadence |

## Analytics invariants
- Every economy source/sink has an event with a unique transaction ID server-side.
- `ball_completed` can be sampled for product analytics, but full server match logs may be stored separately for integrity/replay.
- Versions are mandatory on match/progression events so balance changes can be segmented.
