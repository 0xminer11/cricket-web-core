# 06 — Career System

## Career ladder
| Tier | Rep | Suggested OVR | Difficulty | Reward | Fan | Selector visibility | Matches/season |
|---|---:|---:|---:|---:|---:|---:|---:|
| Academy | 0 | 28–45 | .82 | .75x | .55x | .20 | 8 |
| Club | 80 | 38–55 | .90 | .90x | .70x | .35 | 10 |
| District | 200 | 47–64 | .98 | 1.00x | .90x | .50 | 12 |
| Domestic | 380 | 56–74 | 1.06 | 1.20x | 1.20x | .68 | 14 |
| Franchise | 620 | 66–84 | 1.14 | 1.50x | 1.65x | .82 | 16 |
| International | 820 | 76–95 | 1.22 | 1.90x | 2.20x | .95 | 18 |

Reputation threshold alone does not guarantee promotion. Promotion eligibility combines reputation, recent performance and selector interest; server chooses/validates resulting event.

## Reputation metrics
- **Career Reputation (0–1000):** durable career standing and tier gating.
- **Selector Interest (0–100):** short/medium-term selection attention.
- **Fans (unbounded integer):** popularity/economy/sponsor reach.
- **Team chemistry** is not a global stat in MVP; TeamMindset personality plus future relationship records cover this without duplicating a scalar.
- **Sponsor appeal** is derived from Fans + Professionalism + tier/performance, not stored independently.

## Gains/losses
Strong performances and milestones raise reputation/selector interest. Poor performance can lower selector interest quickly but career reputation only modestly. Reputation single-match loss should normally cap at 6; no career collapse after one bad match.
