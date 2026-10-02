# Team sheets

`GET /matches/:id/flow` returns both sides as `TeamSheetDto`: name, `isYours`, and eleven players in batting order
(position, name, role, bowling style, `isYou`). It is available before the toss (the match is not started yet) and
afterwards.

## What is shown, and what is not

- **Your side** shows each player's overall rating.
- **The opposition** shows only name, role and bowling style. Their attributes are not scouted, so they are not sent
  (the DTO is built server-side and the field is `null`), which a test asserts.
- Your Cricketer carries a **You** tag in text, not only colour.
- Names are unique across both sides; the AI team uses a deterministic role template (2 openers, top order, middle
  order, wicketkeeper, finisher, batting all-rounder, bowling all-rounder, spinner, swing bowler, fast bowler).
  The first five have no bowling style, so a batter never bowls an over they could not.

The team sheet is not editable (selecting the XI is a later module). The screen has one action,
**CONTINUE TO TOSS**.
