# Module 0 integration notes

Original config, types, seed data and all game-design documents are preserved verbatim. The existing @the-cricketer/game-core namespace is retained. Added a public barrel, validators and runtime-independent infrastructure without moving or duplicating domain types.

Module 0 has no concrete version values or aggregate GameConfig instance. New constants initialize string balance/engine versions to "1" and numeric schema version to 1. gameDefinitions aggregates existing arrays directly; no new defaults or balancing values were invented.

The chapter 20 asset manifest interface is reproduced exactly, including its categories. No approved asset files/manifest entries exist. The registry is intentionally empty; item/team/animation references produce warnings. Shot animationAssetKey is a string and may use animation keys rather than asset.* IDs: explicit mapping is deferred until supplied assets exist. No misleading URL is returned for missing assets.

Validators aggregate items, shots, deliveries, pitches, formats, training, teams, career tiers/events, archetype stats, achievements, contracts and sponsors. They check duplicate IDs, ranges, prices, overs, known references, weight sums and asset dependencies. Missing art is warning-level; malformed approved definitions are errors. Module 0 string prerequisite/objective expressions remain opaque specifications; no evaluator or missing objective definitions were invented.

No Colyseus choice exists in the supplied specifications, so Module 1 prepares HTTP lifecycle and room registration boundaries without selecting multiplayer semantics. Existing fractional equipment modifiers are intentional (effective skill bonuses), not invalid integer base attributes. Module 0 documentation's design questions remain future-module decisions.
