# Bat contact

## What "contact" means here

- **Engine contact** is a result: `contactQuality` from Module 8 (perfect, good, okay, poor, edge, miss).
- **Visual contact** is a picture: the bat's sweet spot (or an edge) is where the ball is at the contact frame.

The two are made to agree by [contact assist](contact-assist.md); nothing about the picture can change the result.

## The sweet spot

The bat is a handle (grip) and a toe (tip). The **sweet spot** sits at a fixed fraction along it, with an inside and
an outside **edge** half a blade-width (`EDGE_HALF_WIDTH`) to each side. The debug overlay draws all three.

## The visual contact point

`ContactPlan.ballPoint` is where the ball visibly meets the bat: the engine's incoming arrival point on the contact
plane (`v = 19.0 m`, 0.35 m in front of the batter) after at most a small nudge. The ball's single path switches from
**incoming** to **exit** exactly there (see [ball-exit-trajectories](ball-exit-trajectories.md)), so there is no jump.

## Sequence of events (all ordered, each exactly once)

`BALL_RELEASE -> BALL_TIMELINE -> SHOT_COMMITTED -> CONTACT_WINDOW -> BAT_CONTACT (made?, quality) -> CONTACT_PRESENTATION -> BALL_EXIT -> RESULT -> SCORE_UPDATE -> SEQUENCE_COMPLETE`

`CONTACT_PRESENTATION` fires when the ball reaches the visual contact point; a spark ring is drawn for a real contact.
A wide is never contact. A miss shows daylight (typically 0.2–0.7 m). The result and the score come **after**
contact, never before: no boundary or wicket is revealed before the bat is on the ball.

## Why a forced "Perfect" can be checked

In the batting lab, force **Perfect** and the debug readout shows `closestToSweetSpot` (sampled eight times per frame,
because the ball crosses the bat between two frames). It is ~0 for a perfect contact, ~5 cm from the middle and ~0 from
an edge for an edge, and > 15 cm for a miss; this is an automated end-to-end test, for both hands.
