# 09 — Equipment System

## Slots
Performance-eligible: Bat, Helmet, Gloves, Pads, Shoes.  
Primarily cosmetic: Jersey, Pants, Wristband, Arm Guard, Glasses, Chain, Bat Grip, Bat Sticker.

Cosmetic-only definitions must have zero stat modifiers.

## Bat model
Use only understandable bat effects: Power, Timing and Placement/Control support. Do not store a second arbitrary “sweet spot” stat; represent sweet-spot assistance as a small Timing bonus. Weight is metadata/cosmetic tuning unless a future physical model requires it.

## Rarity
Common, Uncommon, Rare, Epic, Legendary. Rarity controls content/value bands, not guaranteed superiority. A well-upgraded Rare item may remain competitive with baseline Epic gear.

## Upgrade model
- Levels 0–10 maximum depending item.
- Deterministic coin cost.
- No upgrade failure or gambling.
- Stat growth per level is small and explicit in the item definition.
- Combined equipment benefit is capped near 12% of effective skill.

## Inventory
Unlimited equipment storage for MVP, duplicates allowed, quantity stacking only when semantically safe. Inventory records reference `itemId` plus owned state; static names/assets/stats remain in definitions.
