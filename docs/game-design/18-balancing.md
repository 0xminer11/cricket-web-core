# 18 — Balancing and Headless Simulation

## Headless requirement
The match resolver must run with no DOM, canvas, Phaser scene or animation. Inputs are config + seeded RNG + teams/players + command policies; output is match state/results/events. Rendering subscribes to outcomes rather than creating them.

## Simulation suites
1. **10,000 deliveries** across skill/style/pitch matrices.
2. **1,000 two-over matches** using representative Academy/Club/District profiles.
3. **1,000 five-over matches** with the same matrices.
4. Progression/economy Monte Carlo over at least 100 simulated careers to level 20 before launch balancing.

## Initial target ranges — not statistically final
### Delivery-level aggregate
- Dot: 25–42%
- Single: 22–34%
- Two/three combined: 8–16%
- Four: 10–18%
- Six: 5–12%
- Wicket: 4–9%
- Extras: 2–7% of deliveries depending difficulty/style

### Short-match scoring targets
- 2-over average first-innings score: roughly 16–28 at mid skill.
- 5-over average first-innings score: roughly 42–65 at mid skill.
- Runs per over: roughly 7.5–12.5 depending tier/pitch/AI aggression.

These ranges are fun-first short-format targets, not real-cricket statistical claims.

## Fairness metrics
Track win distribution by equivalent team strength, first/second batting, pitch, AI mode and role. Equivalent teams should converge close to 50/50 across large samples, with no material systematic advantage unexplained by format rules.

## Progression/economy metrics
Track matches to level milestones, sessions to +1 skill, Coins earned/spent per hour, purchase affordability, upgrade pacing and wallet inflation. Flag any path where paid cosmetics affect win rate.
