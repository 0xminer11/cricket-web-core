# Accessibility

Bowling must not depend on precise dragging, colour, sound or animation alone.

- **Aim without dragging**: line and length preset buttons, four fine-aim buttons, and arrow keys (Shift for larger
  steps); an optional snap-to-zone in assisted mode.
- **Timing without speed**: assisted timing widens the window and removes the penalty; it is the default under
  `prefers-reduced-motion`.
- **Text for every result**: "FOUR", "WICKET - Bowled" and so on appear in a persistent line and in an
  `aria-live="polite"` region with a full sentence. The over summary and last-delivery readout are text.
- **Not colour alone**: zones use labels, dashed/dotted boundaries and a highlighted band; the selected delivery,
  line and length show a check mark and a heavier outline; the wicket chip is outlined.
- **Keyboard**: Space/Enter bowls, arrows aim, `1`-`9` choose a delivery, native buttons for everything else.
- **Touch**: targets are at least 44 px; the canvas has `touch-action: none` and no text selection so a drag does not
  scroll or select.
- **Canvas hidden from assistive technology**; every control and number exists as DOM.
- **Reduced motion**: no camera movement, no ball trail, shorter walk-back and run-up, a shorter result hold and no
  scale animation on the result flash.
- **Orientation**: landscape is preferred but portrait works (stage above controls); orientation is never locked.

An axe (WCAG 2.0/2.1 A and AA) test runs on the aiming screen; it passed with no violations.
