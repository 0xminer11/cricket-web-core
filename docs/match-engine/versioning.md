# Version policy

`MATCH_ENGINE_VERSION = '2'`: first implemented deterministic engine, replacing the Module 1 v1 interface placeholder. Existing string version types are preserved. Game balance remains initial `'1'`; Module 0 configuration and new initial resolver weights comprise that first playable balance. Replay schema is 1; RNG has its own explicit algorithm tag.

After this module, algorithm/rules changes require an engine version bump; weight-only changes require a balance version bump. Archive old implementations/configurations or explicitly reject old replay versions. Never replay old inputs silently using new rules. Do not change golden output without documenting why and the corresponding version update.

State uses the existing data schema version; persistence migration numbering is independent. Engine events use deterministic numeric ordering instead of wall time.

## Module 9 note: `DeliveryIntent.executionInput`

Module 9 added an optional `executionInput` (0..1) to `DeliveryIntent`. It is additive and backward compatible: when it
is absent (or exactly 0.5) the resolver performs the identical arithmetic and draws the identical random numbers as
before, so every Module 8 replay and the golden match are unchanged and `MATCH_ENGINE_VERSION` stays `'2'`. The two
tuning constants (`inputQuality`, `inputRadius`) live in `ENGINE_BALANCE.execution`. Replays that include an execution
input record it inside the ball action, so they remain reproducible.

## Module 11 note: matches in progress

Module 11 changes nothing in the engine (no formula, no weight, no replay schema): `MATCH_ENGINE_VERSION` stays `'2'` and
the golden match is unchanged. What it adds around the engine is persistence (`match_engine_sessions.flow`,
`match_career_results`) and presentation.

Policy for a match that is already in progress when a later module bumps the engine or balance version:

- A match keeps the engine and balance version recorded in its own replay and `matches` row. It is never silently replayed
  with newer rules: either the old implementation/configuration is archived, or the replay is rejected with a typed error
  and the match is left as it was.
- The career result of a finished match is stored once (`match_career_results.summary`, with `game_balance_version`), so
  changing reward configuration later never alters a result that has already been shown or paid.
- A match that was created before the toss existed (no `flow` data) has its toss inside the replay; the flow service reads
  it from there (`flow` is `{}`) and such matches skip the toss screens.
