# Outcomes and field regions

The resolver samples dismissal, then contact-conditioned weights for 0/1/2/3/4/6. Shot risk and loft category alter risk/reward. Defence lowers wickets and strongly suppresses boundaries. Power, modest strength, placement, pitch movement and abstract sector coverage affect boundary probability. All weights live in game-core `engine.config.ts` alongside existing Module 0 data.

Field sectors: straight, cover, point, third man, mid-wicket, square leg, fine leg. This is a fixed abstract field, not movable fielders. Exit speed, launch angle, direction and distance class are rendering hints. Distance class distinguishes infield/outfield/boundary/six without pretending to know an exact boundary distance.

Match decisions and scoring are independent of player identity. No difficulty stat multipliers or losing-side boosts exist. AI decision policy is external to resolution.
