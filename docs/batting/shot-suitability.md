# Shot suitability

Each Module 0 shot lists the `idealLines` and `idealLengths` it suits. Suitability is `(lineMatch + lengthMatch) / 2`
(0, 0.5 or 1). It is the engine's number and it drives the contact formula; this module only shows it.

| Surface                    | What it does                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Engine (`shotSuitability`) | scales the selection term; `fit` lets Footwork recover part of a mismatch                                                                |
| Hint (assist Normal+)      | three words: **Good shot option** (1) / **Playable** (0.5) / **Risky** (0)                                                               |
| Suggested action           | `suggestedAction(line, length)` marks a sensible action: yorker -> defend, short -> leg side, full -> drive, good on/off -> drive/defend |
| Shot risk                  | lofted shots carry a higher wicket risk (`def.risk`) in return for boundaries                                                            |

## Tests that matter to design

- **Bad shot**: a cover drive to a bouncer is clearly worse than to a full ball outside off.
- **Perfect timing + bad shot** does not always rescue a terrible choice.
- **Good shot + slightly bad timing** can still make contact (skill forgives): this is the forgiving heart of the system.
- **Defend**: high survival, low scoring. **Loft**: higher reward, higher risk.

See [testing](testing.md#simulation-report) for the measured numbers.
