# 03 — Batting System

## Contact quality
Contact score is normalized to 0..1 from weighted factors:

`C = .27 timing + .18 shotFit + .16 lineLengthFit + .16 battingSkill + .09 bowlerChallenge + .04 pitch + .04 form + .04 fatigue + .02 pressure`

All factors are normalized so higher is better for batter; `bowlerChallenge` is pre-inverted. Clamp C to 0..1.

Initial bands: Perfect 0.88–1.00, Good 0.72–0.8799, Okay 0.56–0.7199, Poor 0.40–0.5599, Edge 0.24–0.3999, Miss <0.24.

## Outcome resolution
Contact quality does not directly equal runs. A second resolver considers shot direction, power, field model abstraction, risk, ball speed and match context. MVP outcomes: dot, 1, 2, 3, 4, 6, wicket, edge, miss. A miss can still become a wide/bye depending on delivery result.

## Shot taxonomy
Initial 12 shots: Forward Defensive, Back-foot Defensive, Straight Drive, Cover Drive, On Drive, Flick, Cut, Pull, Hook, Lofted Straight, Lofted Off Side, Lofted Leg Side. Each is defined by machine ID, category, ideal lines/lengths, preferred foot, risk, power multiplier, timing difficulty, direction range and animation key.

Future definitions may add Sweep, Reverse Sweep, Scoop, Ramp and Upper Cut without changing the resolver interface.

## Design rule
User timing and correct shot selection must matter more than equipment. Poor shot selection should not be fully rescued by a high Overall.
