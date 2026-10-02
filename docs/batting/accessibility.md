# Accessibility

Batting must be completable **without** a swipe, a gesture, a precise pointer, colour perception or motion.

| Need                   | How it is met                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| No gestures            | FACE NEXT BALL and SWING are buttons; Space does both; the shot and direction are radio groups                                                |
| Keyboard               | Space (face/swing), 1–5 (action), ←/→ (direction, mirrored for left-handers); nothing is trapped                                              |
| Screen readers         | real buttons with labels; `role="radiogroup"` with `aria-checked`; the result banner is in an `aria-live` region; the canvas is `aria-hidden` |
| Not colour alone       | selected radios get a check mark and a border; hints are words; the suggested action is a dashed border + "(suggested)" text                  |
| Timing without seeing  | assist **High** and **Auto** (Auto sends no timing at all: choose the shot, the system times it)                                              |
| Cue is not only motion | the cue bar has text (_Watch the ball / Wait for it… / SWING NOW / Too late_)                                                                 |
| Reduced motion         | the camera never moves (stays on BowlerView), no ball trail, shorter result hold                                                              |
| Touch targets          | ≥ 44 px (the swing button 72 px on the phone)                                                                                                 |
| Focus                  | Space/Enter are ignored while a button, link, radio or summary has focus so they activate that control                                        |
| Sound and vibration    | both optional and never the only signal: the result is always text; haptics are skipped under reduced motion; sound is off by default         |
| Reading size           | HUD and controls are DOM text and scale with the browser's font size                                                                          |
| No sideways scroll     | tested at 390 px wide                                                                                                                         |

Automated checks: `e2e/batting.spec.ts` runs axe (WCAG 2.0/2.1 A and AA) on the batting screen idle **and** with the ball
in flight, and completes deliveries through the button controls only (no swipe). Both pass with no violations.

Known limitation: the canvas itself is not described to a screen reader; the _result_ always is (banner and live
region), and the scoreboard is real text.
